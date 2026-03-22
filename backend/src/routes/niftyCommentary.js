import axios from 'axios';
import { postCommentaryToTelegram } from '../telegram.js';

const NSE_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'en-US,en;q=0.9',
  'Referer': 'https://www.nseindia.com/',
};

const CACHE_TTL = 20 * 60 * 1000; // 20 minutes
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

function computeOIMetrics(optData, targetExpiry, spotPrice) {
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

  // ── Greeks extraction ──
  let atmIV = null, atmDelta = null, atmGamma = null, atmTheta = null;
  let ivSkew = null, expectedMove = null;

  if (spotPrice && strikes.length > 0) {
    // ATM = strike closest to spot
    const atmStrike = strikes.reduce((prev, curr) =>
      Math.abs(curr - spotPrice) < Math.abs(prev - spotPrice) ? curr : prev
    );
    const atmRow = rows.find(r => r.strikePrice === atmStrike);
    if (atmRow) {
      atmIV = atmRow.CE?.impliedVolatility ?? atmRow.PE?.impliedVolatility ?? null;
      atmDelta = atmRow.CE?.delta ?? null;
      atmGamma = atmRow.CE?.gamma ?? null;
      // Average theta of ATM CE + PE (both are negative; show absolute value)
      const ceTheta = atmRow.CE?.theta;
      const peTheta = atmRow.PE?.theta;
      if (ceTheta != null && peTheta != null) atmTheta = parseFloat(((Math.abs(ceTheta) + Math.abs(peTheta)) / 2).toFixed(2));
      else if (ceTheta != null) atmTheta = parseFloat(Math.abs(ceTheta).toFixed(2));
    }

    // IV skew: OTM PE (5% below spot) IV minus OTM CE (5% above spot) IV
    const otmPEStrike = strikes.reduce((p, c) => Math.abs(c - spotPrice * 0.95) < Math.abs(p - spotPrice * 0.95) ? c : p);
    const otmCEStrike = strikes.reduce((p, c) => Math.abs(c - spotPrice * 1.05) < Math.abs(p - spotPrice * 1.05) ? c : p);
    const peIV = rows.find(r => r.strikePrice === otmPEStrike)?.PE?.impliedVolatility;
    const ceIV = rows.find(r => r.strikePrice === otmCEStrike)?.CE?.impliedVolatility;
    if (peIV != null && ceIV != null) ivSkew = parseFloat((peIV - ceIV).toFixed(2));

    // Expected weekly move: ATM IV / sqrt(52) × spot / 100
    if (atmIV != null) expectedMove = parseFloat((atmIV / 100 * spotPrice / Math.sqrt(52)).toFixed(0));
  }

  return { pcr, maxPain: maxPainStrike, topCE, topPE, totalCallOI: callOI, totalPutOI: putOI,
           atmIV, atmDelta, atmGamma, atmTheta, ivSkew, expectedMove };
}

/**
 * Full option chain table for a given expiry, filtered to ATM ± 20 strikes.
 * Normalised to { strike, isATM, ce: { oi, ltp, iv }, pe: { oi, ltp, iv } }.
 */
function buildIndexOptionChain(optData, targetExpiry, spotPrice) {
  const rows = optData.filter(r => !targetExpiry || r.expiryDate === targetExpiry);
  const allStrikes = [...new Set(rows.map(r => r.strikePrice))].sort((a, b) => a - b);

  let strikesToShow = allStrikes;
  if (spotPrice && allStrikes.length > 40) {
    const atmIdx = allStrikes.reduce((best, _, i) =>
      Math.abs(allStrikes[i] - spotPrice) < Math.abs(allStrikes[best] - spotPrice) ? i : best, 0);
    strikesToShow = allStrikes.slice(Math.max(0, atmIdx - 20), Math.min(allStrikes.length, atmIdx + 21));
  }

  const atmStrike = spotPrice && allStrikes.length > 0
    ? allStrikes.reduce((p, c) => Math.abs(c - spotPrice) < Math.abs(p - spotPrice) ? c : p)
    : null;

  return strikesToShow.map(strike => {
    const row = rows.find(r => r.strikePrice === strike);
    return {
      strike,
      isATM: strike === atmStrike,
      ce: row?.CE ? { oi: row.CE.openInterest || 0, ltp: row.CE.lastPrice || null, iv: row.CE.impliedVolatility || null } : null,
      pe: row?.PE ? { oi: row.PE.openInterest || 0, ltp: row.PE.lastPrice || null, iv: row.PE.impliedVolatility || null } : null,
    };
  });
}

function extractExpiryMetrics(chainData, today, spotPrice) {
  const optData = chainData?.records?.data || chainData?.filtered?.data || [];
  const expiriesRaw = chainData?.records?.expiryDates || [];

  const nextThursdayFmt = formatNSEExpiry(getNextThursday(today));
  let monthlyDate = getMonthlyExpiry(today.getFullYear(), today.getMonth());
  if (monthlyDate < today) monthlyDate = getMonthlyExpiry(today.getFullYear(), today.getMonth() + 1);
  const monthlyFmt = formatNSEExpiry(monthlyDate);

  const weeklyExpiry = expiriesRaw.find(e => e >= nextThursdayFmt) || expiriesRaw[0];
  const monthlyExpiry = expiriesRaw.find(e => e >= monthlyFmt) || expiriesRaw[expiriesRaw.length - 1];

  const weekly = weeklyExpiry
    ? { expiry: weeklyExpiry, ...computeOIMetrics(optData, weeklyExpiry, spotPrice) }
    : null;
  const monthly = monthlyExpiry
    ? { expiry: monthlyExpiry, ...computeOIMetrics(optData, monthlyExpiry, spotPrice) }
    : null;

  const weeklyChain = weeklyExpiry ? buildIndexOptionChain(optData, weeklyExpiry, spotPrice) : [];

  return { weekly, monthly, weeklyChain };
}

function fmtOI(oi) {
  return oi >= 1e5 ? `${(oi / 1e5).toFixed(1)}L` : String(oi);
}

async function callClaude(prompt, apiKey) {
  const resp = await axios.post(
    'https://api.anthropic.com/v1/messages',
    {
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 400,
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

function buildIndexPrompt(indexName, spot, oiData, vix, timeStr) {
  const w = oiData?.weekly;
  const m = oiData?.monthly;

  const fmtN = (v, d = 2) => v != null ? Number(v).toFixed(d) : 'N/A';

  const oiStr = (label, d) => {
    if (!d) return `${label}: N/A`;
    const greeks = [
      d.atmIV != null ? `ATM IV ${fmtN(d.atmIV)}%` : null,
      d.expectedMove != null ? `Expected move ±${d.expectedMove}pts` : null,
      d.atmDelta != null ? `Δ ${fmtN(d.atmDelta)}` : null,
      d.atmGamma != null ? `Γ ${fmtN(d.atmGamma, 4)}` : null,
      d.atmTheta != null ? `Θ -${fmtN(d.atmTheta)}/day` : null,
      d.ivSkew != null ? `IV Skew(PE-CE) ${fmtN(d.ivSkew)}%` : null,
    ].filter(Boolean).join(' | ');
    return `${label} (${d.expiry}): PCR ${d.pcr ?? 'N/A'} | Max Pain ${d.maxPain ?? 'N/A'} | CE walls: ${d.topCE?.slice(0,3).map(s => `${s.strike}(${fmtOI(s.oi)})`).join(', ')} | PE support: ${d.topPE?.slice(0,3).map(s => `${s.strike}(${fmtOI(s.oi)})`).join(', ')}${greeks ? `\n  Greeks: ${greeks}` : ''}`;
  };

  return `You are a professional Indian derivatives analyst. Write exactly 2 paragraphs about ${indexName} F&O at ${timeStr} IST. Be direct, use numbers, no bullet points.

DATA:
- Spot: ${spot?.price ?? 'N/A'} (${spot?.changePct >= 0 ? '+' : ''}${spot?.changePct ?? 0}%)
- India VIX: ${vix?.value ?? 'N/A'} (${vix?.level ?? ''})
- ${oiStr('Weekly', w)}
- ${oiStr('Monthly', m)}

Paragraph 1: Current bias — combine PCR, IV skew (put skew = fear), and delta to assess directional lean; mention expected move range if available.
Paragraph 2: Key levels — CE OI resistance, PE OI support, max pain magnet; note if high gamma/theta near expiry signals pinning risk.
Under 140 words. Use specific strike prices and Greek values as numbers.`;
}

async function generateCommentaries(marketData) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return { nifty: null, banknifty: null, midcap: null, finnifty: null, errors: {} };

  const { spot, bankniftySpot, midcapSpot, finniftySpot, vix, nifty, banknifty, midcap, finnifty, timestamp } = marketData;
  const timeStr = new Date(timestamp).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' });

  const indices = [
    { key: 'nifty',     name: 'Nifty 50',      spot,          oi: nifty     },
    { key: 'banknifty', name: 'Bank Nifty',     spot: bankniftySpot, oi: banknifty },
    { key: 'midcap',    name: 'Midcap Nifty',   spot: midcapSpot,   oi: midcap    },
    { key: 'finnifty',  name: 'Fin Nifty',      spot: finniftySpot, oi: finnifty  },
  ];

  const results = await Promise.allSettled(
    indices.map(({ name, spot: s, oi }) =>
      callClaude(buildIndexPrompt(name, s, oi, vix, timeStr), apiKey)
    )
  );

  const commentaries = {};
  const errors = {};
  indices.forEach(({ key }, i) => {
    if (results[i].status === 'fulfilled') {
      commentaries[key] = results[i].value;
    } else {
      commentaries[key] = null;
      errors[key] = results[i].reason?.response?.data?.error?.message || results[i].reason?.message;
    }
  });
  return { ...commentaries, errors };
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
      ? extractExpiryMetrics(niftyChainResult.value, today, spot?.price)
      : { weekly: null, monthly: null };
    const bankniftyOI = bankniftyChainResult.status === 'fulfilled'
      ? extractExpiryMetrics(bankniftyChainResult.value, today, bankniftySpot?.price)
      : { weekly: null, monthly: null };
    const midcapOI = midcapChainResult.status === 'fulfilled'
      ? extractExpiryMetrics(midcapChainResult.value, today, midcapSpot?.price)
      : { weekly: null, monthly: null };
    const finniftyOI = finniftyChainResult.status === 'fulfilled'
      ? extractExpiryMetrics(finniftyChainResult.value, today, finniftySpot?.price)
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

    let commentaries = { nifty: null, banknifty: null, midcap: null, finnifty: null, errors: {} };
    if (!process.env.ANTHROPIC_API_KEY) {
      commentaries.errors._global = 'ANTHROPIC_API_KEY not set';
    } else {
      try { commentaries = await generateCommentaries(marketData); } catch (e) {
        commentaries.errors._global = e.response?.data?.error?.message || e.message;
        console.warn('Commentary AI error:', commentaries.errors._global);
      }
    }

    const payload = {
      ...marketData,
      commentaries,
      marketOpen,
      nextUpdateAt: marketOpen ? now + CACHE_TTL : null,
    };
    commentaryCache = { data: payload, fetchedAt: now };
    res.json(payload);

    // Post to Telegram in background (non-blocking) during market hours
    if (marketOpen) {
      postCommentaryToTelegram(payload).catch(e =>
        console.error('Telegram post failed:', e.message)
      );
    }
  } catch (err) {
    console.error('Nifty commentary error:', err.message);
    res.status(500).json({ error: 'Failed to fetch market data' });
  }
}
