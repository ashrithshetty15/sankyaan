import axios from 'axios';

const NSE_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'en-US,en;q=0.9',
  'Referer': 'https://www.nseindia.com/',
};

const CACHE_TTL = 30 * 60 * 1000; // 30 minutes
let commentaryCache = { data: null, fetchedAt: 0 };

/** Returns true if current time is within NSE market hours (IST Mon–Fri 9:15–15:30) */
function isMarketOpen() {
  const now = new Date();
  // Convert to IST (UTC+5:30)
  const ist = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
  const day = ist.getDay(); // 0=Sun, 6=Sat
  if (day === 0 || day === 6) return false;
  const h = ist.getHours();
  const m = ist.getMinutes();
  const mins = h * 60 + m;
  return mins >= 9 * 60 + 15 && mins <= 15 * 60 + 30;
}

async function getNSECookies() {
  const resp = await axios.get('https://www.nseindia.com', {
    headers: NSE_HEADERS, timeout: 15000, maxRedirects: 5,
  });
  return (resp.headers['set-cookie'] || []).map(c => c.split(';')[0]).join('; ');
}

/** Next Thursday on or after today */
function getNextThursday(fromDate = new Date()) {
  const d = new Date(fromDate);
  const dow = d.getDay();
  const daysUntilThursday = (4 - dow + 7) % 7 || 7;
  d.setDate(d.getDate() + daysUntilThursday);
  return d;
}

/** Last Thursday of the given month */
function getMonthlyExpiry(year, month) {
  const lastDay = new Date(year, month + 1, 0);
  const dow = lastDay.getDay();
  const lastThursday = new Date(lastDay);
  lastThursday.setDate(lastDay.getDate() - ((dow + 3) % 7));
  return lastThursday;
}

function formatNSEExpiry(date) {
  const dd = String(date.getDate()).padStart(2, '0');
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${dd}-${months[date.getMonth()]}-${date.getFullYear()}`;
}

async function fetchOptionChain(symbol, cookies) {
  const headers = { ...NSE_HEADERS, Cookie: cookies };
  const resp = await axios.get(
    `https://www.nseindia.com/api/option-chain-indices?symbol=${symbol}`,
    { headers, timeout: 20000 }
  );
  return resp.data;
}

async function fetchAllIndices(cookies) {
  const headers = { ...NSE_HEADERS, Cookie: cookies };
  const resp = await axios.get('https://www.nseindia.com/api/allIndices', {
    headers, timeout: 15000,
  });
  return resp.data?.data || [];
}

function computeOIMetrics(optData, targetExpiry) {
  const rows = optData.filter(r => !targetExpiry || r.expiryDate === targetExpiry);
  let callOI = 0, putOI = 0;
  const strikeOI = {};

  for (const row of rows) {
    const strike = row.strikePrice;
    if (!strikeOI[strike]) strikeOI[strike] = { ce: 0, pe: 0 };
    if (row.CE) { callOI += row.CE.openInterest || 0; strikeOI[strike].ce += row.CE.openInterest || 0; }
    if (row.PE) { putOI += row.PE.openInterest || 0; strikeOI[strike].pe += row.PE.openInterest || 0; }
  }

  const pcr = callOI > 0 ? parseFloat((putOI / callOI).toFixed(3)) : null;

  const strikes = Object.keys(strikeOI).map(Number).sort((a, b) => a - b);
  let maxPainStrike = null;
  let minLoss = Infinity;
  for (const s of strikes) {
    let totalLoss = 0;
    for (const s2 of strikes) {
      if (s2 > s) totalLoss += strikeOI[s2].ce * (s2 - s);
      if (s2 < s) totalLoss += strikeOI[s2].pe * (s - s2);
    }
    if (totalLoss < minLoss) { minLoss = totalLoss; maxPainStrike = s; }
  }

  const topCE = [...strikes].sort((a, b) => strikeOI[b].ce - strikeOI[a].ce).slice(0, 5)
    .map(s => ({ strike: s, oi: strikeOI[s].ce }));
  const topPE = [...strikes].sort((a, b) => strikeOI[b].pe - strikeOI[a].pe).slice(0, 5)
    .map(s => ({ strike: s, oi: strikeOI[s].pe }));

  return { pcr, maxPain: maxPainStrike, topCE, topPE, totalCallOI: callOI, totalPutOI: putOI };
}

function extractExpiryMetrics(chainData, today) {
  const optData = chainData?.records?.data || chainData?.filtered?.data || [];
  const expiriesRaw = chainData?.records?.expiryDates || [];

  const nextThursdayFmt = formatNSEExpiry(getNextThursday(today));
  let monthlyDate = getMonthlyExpiry(today.getFullYear(), today.getMonth());
  if (monthlyDate < today) monthlyDate = getMonthlyExpiry(today.getFullYear(), today.getMonth() + 1);
  const monthlyFmt = formatNSEExpiry(monthlyDate);

  const weeklyExpiry = expiriesRaw.find(e => e >= nextThursdayFmt) || expiriesRaw[0];
  const monthlyExpiry = expiriesRaw.find(e => e >= monthlyFmt) || expiriesRaw[expiriesRaw.length - 1];

  const weekly = weeklyExpiry
    ? { expiry: weeklyExpiry, ...computeOIMetrics(optData, weeklyExpiry) }
    : null;
  const monthly = monthlyExpiry
    ? { expiry: monthlyExpiry, ...computeOIMetrics(optData, monthlyExpiry) }
    : null;

  return { weekly, monthly };
}

function fmtOI(oi) {
  return oi >= 1e5 ? `${(oi / 1e5).toFixed(1)}L` : String(oi);
}

async function generateCommentary(marketData) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;

  const { spot, bankniftySpot, midcapSpot, finniftySpot, vix, nifty, banknifty, midcap, finnifty, timestamp } = marketData;
  const timeStr = new Date(timestamp).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' });

  const oiSection = (label, data) => {
    if (!data?.weekly && !data?.monthly) return `${label}: OI data unavailable`;
    const w = data.weekly;
    const m = data.monthly;
    return `${label}:
Weekly (${w?.expiry ?? 'N/A'}): PCR ${w?.pcr ?? 'N/A'} | Max Pain ${w?.maxPain ?? 'N/A'} | CE: ${w?.topCE?.slice(0,3).map(s => `${s.strike}(${fmtOI(s.oi)})`).join(', ') ?? 'N/A'} | PE: ${w?.topPE?.slice(0,3).map(s => `${s.strike}(${fmtOI(s.oi)})`).join(', ') ?? 'N/A'}
Monthly (${m?.expiry ?? 'N/A'}): PCR ${m?.pcr ?? 'N/A'} | Max Pain ${m?.maxPain ?? 'N/A'} | CE: ${m?.topCE?.slice(0,3).map(s => `${s.strike}(${fmtOI(s.oi)})`).join(', ') ?? 'N/A'} | PE: ${m?.topPE?.slice(0,3).map(s => `${s.strike}(${fmtOI(s.oi)})`).join(', ') ?? 'N/A'}`;
  };

  const spotLine = (label, s) => s ? `- ${label}: ${s.price} (${s.changePct >= 0 ? '+' : ''}${s.changePct}%)` : '';

  const prompt = `You are a professional Indian derivatives market analyst providing live F&O commentary at ${timeStr} IST. Write exactly 4 paragraphs in a confident, analytical tone like a CNBC-TV18 or Bloomberg Quint analyst — use numbers, be direct and insightful, no bullet points.

MARKET DATA:
${spotLine('Nifty 50', spot)}
${spotLine('Bank Nifty', bankniftySpot)}
${spotLine('Midcap Nifty', midcapSpot)}
${spotLine('Fin Nifty', finniftySpot)}
- India VIX: ${vix?.value ?? 'N/A'} (${vix?.level ?? ''})

${oiSection('NIFTY OI', nifty)}

${oiSection('BANKNIFTY OI', banknifty)}

${oiSection('MIDCPNIFTY OI', midcap)}

${oiSection('FINNIFTY OI', finnifty)}

Write exactly 4 paragraphs:
1. Overall market tone — what broad index movement and VIX signal right now
2. Nifty + BankNifty F&O positioning — key weekly/monthly levels, where bulls/bears are positioned
3. Midcap Nifty + Fin Nifty positioning — PCR bias, key OI levels, sectoral implications
4. Near-term outlook — key levels to watch across all four indices

Keep it under 350 words. Use strike prices as specific numbers.`;

  const resp = await axios.post(
    'https://api.anthropic.com/v1/messages',
    {
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 700,
      messages: [{ role: 'user', content: prompt }],
    },
    {
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      timeout: 30000,
    }
  );
  return resp.data?.content?.[0]?.text || null;
}

/**
 * GET /api/nifty-commentary
 */
export async function getNiftyCommentary(req, res) {
  const force = req.query.force === '1';
  const now = Date.now();
  const marketOpen = isMarketOpen();

  // Outside market hours — return cached data (or last stale data) with marketOpen flag
  if (!marketOpen && !force) {
    const cached = commentaryCache.data;
    if (cached) {
      return res.json({ ...cached, marketOpen: false });
    }
    // No cache yet — still fetch once so page has data even outside hours
  }

  if (!force && commentaryCache.data && (now - commentaryCache.fetchedAt) < CACHE_TTL) {
    return res.json({ ...commentaryCache.data, marketOpen });
  }

  try {
    let cookies = '';
    try { cookies = await getNSECookies(); } catch (_) {}

    const [indicesResult, niftyChainResult, bankniftyChainResult, midcapChainResult, finniftyChainResult] = await Promise.allSettled([
      fetchAllIndices(cookies),
      fetchOptionChain('NIFTY', cookies),
      fetchOptionChain('BANKNIFTY', cookies),
      fetchOptionChain('MIDCPNIFTY', cookies),
      fetchOptionChain('FINNIFTY', cookies),
    ]);

    // Extract spot prices
    const allIndices = indicesResult.status === 'fulfilled' ? indicesResult.value : [];
    const niftyEntry = allIndices.find(i => i.indexSymbol === 'NIFTY 50' || i.index === 'Nifty 50');
    const bnEntry = allIndices.find(i => i.indexSymbol === 'NIFTY BANK' || i.index === 'Nifty Bank' || i.indexSymbol === 'BANK NIFTY');
    const vixEntry = allIndices.find(i => i.indexSymbol === 'INDIA VIX' || i.index === 'India VIX');
    const midcapEntry = allIndices.find(i =>
      i.indexSymbol === 'NIFTY MID SELECT' || i.indexSymbol === 'NIFTY MIDCAP SELECT' ||
      i.index === 'Nifty Midcap Select' || i.indexSymbol === 'MIDCPNIFTY'
    );
    const finniftyEntry = allIndices.find(i =>
      i.indexSymbol === 'NIFTY FIN SERVICE' || i.index === 'Nifty Financial Services' ||
      i.indexSymbol === 'FINNIFTY' || i.index === 'Nifty Fin Services'
    );

    const extractSpot = (entry) => entry ? {
      price: parseFloat(entry.last ?? entry.lastPrice ?? 0),
      change: parseFloat(entry.variation ?? entry.change ?? 0),
      changePct: parseFloat(entry.percentChange ?? entry.pChange ?? 0),
    } : null;

    const spot = extractSpot(niftyEntry);
    const bankniftySpot = extractSpot(bnEntry);
    const midcapSpot = extractSpot(midcapEntry);
    const finniftySpot = extractSpot(finniftyEntry);

    const vixVal = vixEntry ? parseFloat(vixEntry.last ?? vixEntry.lastPrice ?? 0) : null;
    const vix = vixVal ? {
      value: vixVal,
      level: vixVal < 15 ? 'Low Fear' : vixVal < 20 ? 'Moderate' : vixVal < 25 ? 'High' : 'Extreme Fear',
    } : null;

    const today = new Date();
    const niftyOI = niftyChainResult.status === 'fulfilled'
      ? extractExpiryMetrics(niftyChainResult.value, today)
      : { weekly: null, monthly: null };
    const bankniftyOI = bankniftyChainResult.status === 'fulfilled'
      ? extractExpiryMetrics(bankniftyChainResult.value, today)
      : { weekly: null, monthly: null };
    const midcapOI = midcapChainResult.status === 'fulfilled'
      ? extractExpiryMetrics(midcapChainResult.value, today)
      : { weekly: null, monthly: null };
    const finniftyOI = finniftyChainResult.status === 'fulfilled'
      ? extractExpiryMetrics(finniftyChainResult.value, today)
      : { weekly: null, monthly: null };

    if (niftyChainResult.status === 'rejected') console.warn('Nifty chain error:', niftyChainResult.reason?.message);
    if (bankniftyChainResult.status === 'rejected') console.warn('BankNifty chain error:', bankniftyChainResult.reason?.message);
    if (midcapChainResult.status === 'rejected') console.warn('MidcapNifty chain error:', midcapChainResult.reason?.message);
    if (finniftyChainResult.status === 'rejected') console.warn('FinNifty chain error:', finniftyChainResult.reason?.message);

    const marketData = {
      spot,
      bankniftySpot,
      midcapSpot,
      finniftySpot,
      vix,
      nifty: niftyOI,
      banknifty: bankniftyOI,
      midcap: midcapOI,
      finnifty: finniftyOI,
      timestamp: new Date().toISOString(),
    };

    let commentary = null;
    let commentaryError = null;
    if (!process.env.ANTHROPIC_API_KEY) {
      commentaryError = 'ANTHROPIC_API_KEY not set';
    } else {
      try { commentary = await generateCommentary(marketData); } catch (e) {
        commentaryError = e.response?.data?.error?.message || e.message;
        console.warn('Commentary AI error:', commentaryError);
      }
    }

    const payload = {
      ...marketData,
      commentary,
      commentaryError,
      marketOpen,
      nextUpdateAt: marketOpen ? now + CACHE_TTL : null,
    };
    commentaryCache = { data: payload, fetchedAt: now };
    res.json(payload);
  } catch (err) {
    console.error('Nifty commentary error:', err.message);
    res.status(500).json({ error: 'Failed to fetch market data' });
  }
}
