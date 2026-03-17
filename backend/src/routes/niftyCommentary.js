import axios from 'axios';

const NSE_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'en-US,en;q=0.9',
  'Referer': 'https://www.nseindia.com/',
};

const CACHE_TTL = 10 * 60 * 1000; // 10 minutes
let commentaryCache = { data: null, fetchedAt: 0 };

async function getNSECookies() {
  const resp = await axios.get('https://www.nseindia.com', {
    headers: NSE_HEADERS, timeout: 15000, maxRedirects: 5,
  });
  return (resp.headers['set-cookie'] || []).map(c => c.split(';')[0]).join('; ');
}

/** Next Thursday on or after today */
function getNextThursday(fromDate = new Date()) {
  const d = new Date(fromDate);
  const dow = d.getDay(); // 0=Sun, 4=Thu
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

async function fetchOptionChainData(cookies) {
  const headers = { ...NSE_HEADERS, Cookie: cookies };
  const resp = await axios.get(
    'https://www.nseindia.com/api/option-chain-indices?symbol=NIFTY',
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

  // Max pain: strike where total OI loss is minimum for option buyers
  const strikes = Object.keys(strikeOI).map(Number).sort((a, b) => a - b);
  let maxPainStrike = null;
  let minLoss = Infinity;
  for (const s of strikes) {
    let totalLoss = 0;
    for (const s2 of strikes) {
      if (s2 > s) totalLoss += strikeOI[s2].ce * (s2 - s); // CE loss if expires at s
      if (s2 < s) totalLoss += strikeOI[s2].pe * (s - s2); // PE loss if expires at s
    }
    if (totalLoss < minLoss) { minLoss = totalLoss; maxPainStrike = s; }
  }

  // Top 5 CE and PE OI strikes
  const topCE = strikes.sort((a, b) => strikeOI[b].ce - strikeOI[a].ce).slice(0, 5)
    .map(s => ({ strike: s, oi: strikeOI[s].ce }));
  const topPE = strikes.sort((a, b) => strikeOI[b].pe - strikeOI[a].pe).slice(0, 5)
    .map(s => ({ strike: s, oi: strikeOI[s].pe }));

  return { pcr, maxPain: maxPainStrike, topCE, topPE, totalCallOI: callOI, totalPutOI: putOI };
}

async function generateCommentary(marketData) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;

  const { spot, vix, weekly, monthly, timestamp } = marketData;
  const timeStr = new Date(timestamp).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' });

  const prompt = `You are a professional Indian derivatives market analyst providing live commentary at ${timeStr} IST. Based on the following NIFTY F&O data, write a concise 3-paragraph market commentary in a confident, analytical tone — like a Bloomberg or CNBC-TV18 analyst would narrate.

MARKET DATA:
- Nifty Spot: ${spot?.price ?? 'N/A'} (${spot?.changePct >= 0 ? '+' : ''}${spot?.changePct ?? 0}%)
- India VIX: ${vix?.value ?? 'N/A'} (${vix?.level ?? ''})

WEEKLY EXPIRY OI (${weekly?.expiry ?? 'this week'}):
- PCR: ${weekly?.pcr ?? 'N/A'} → ${weekly?.pcr > 1.2 ? 'Bullish sentiment' : weekly?.pcr < 0.8 ? 'Bearish sentiment' : 'Neutral'}
- Max Pain: ${weekly?.maxPain ?? 'N/A'}
- Top CE (Resistance) strikes by OI: ${weekly?.topCE?.slice(0, 3).map(s => `${s.strike} (${(s.oi / 1e5).toFixed(1)}L)`).join(', ') ?? 'N/A'}
- Top PE (Support) strikes by OI: ${weekly?.topPE?.slice(0, 3).map(s => `${s.strike} (${(s.oi / 1e5).toFixed(1)}L)`).join(', ') ?? 'N/A'}

MONTHLY EXPIRY OI (${monthly?.expiry ?? 'this month'}):
- PCR: ${monthly?.pcr ?? 'N/A'} → ${monthly?.pcr > 1.2 ? 'Bullish' : monthly?.pcr < 0.8 ? 'Bearish' : 'Neutral'}
- Max Pain: ${monthly?.maxPain ?? 'N/A'}
- Top CE strikes: ${monthly?.topCE?.slice(0, 3).map(s => `${s.strike} (${(s.oi / 1e5).toFixed(1)}L)`).join(', ') ?? 'N/A'}
- Top PE strikes: ${monthly?.topPE?.slice(0, 3).map(s => `${s.strike} (${(s.oi / 1e5).toFixed(1)}L)`).join(', ') ?? 'N/A'}

Write exactly 3 paragraphs:
1. Current market tone and what VIX + spot movement signals
2. Weekly expiry OI analysis — key support/resistance levels, where smart money is positioned
3. Monthly picture — bigger support/resistance zones and near-term outlook

Keep it under 250 words. Use numbers. Be direct and insightful. Do not use bullet points.`;

  const resp = await axios.post(
    'https://api.anthropic.com/v1/messages',
    {
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 600,
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

  if (!force && commentaryCache.data && (now - commentaryCache.fetchedAt) < CACHE_TTL) {
    return res.json(commentaryCache.data);
  }

  try {
    let cookies = '';
    try { cookies = await getNSECookies(); } catch (_) {}

    const [indicesResult, chainResult] = await Promise.allSettled([
      fetchAllIndices(cookies),
      fetchOptionChainData(cookies),
    ]);

    // Extract spot + VIX
    const allIndices = indicesResult.status === 'fulfilled' ? indicesResult.value : [];
    const niftyEntry = allIndices.find(i => i.indexSymbol === 'NIFTY 50' || i.index === 'Nifty 50');
    const vixEntry = allIndices.find(i => i.indexSymbol === 'INDIA VIX' || i.index === 'India VIX');

    const spot = niftyEntry ? {
      price: parseFloat(niftyEntry.last ?? niftyEntry.lastPrice ?? 0),
      change: parseFloat(niftyEntry.variation ?? niftyEntry.change ?? 0),
      changePct: parseFloat(niftyEntry.percentChange ?? niftyEntry.pChange ?? 0),
    } : null;

    const vixVal = vixEntry ? parseFloat(vixEntry.last ?? vixEntry.lastPrice ?? 0) : null;
    const vix = vixVal ? {
      value: vixVal,
      level: vixVal < 15 ? 'Low Fear' : vixVal < 20 ? 'Moderate' : vixVal < 25 ? 'High' : 'Extreme Fear',
    } : null;

    // Compute weekly and monthly OI metrics
    let weekly = null;
    let monthly = null;

    if (chainResult.status === 'rejected') {
      console.warn('Option chain fetch failed:', chainResult.reason?.message);
    }

    if (chainResult.status === 'fulfilled') {
      const optData = chainResult.value?.records?.data || chainResult.value?.filtered?.data || [];
      const expiriesRaw = chainResult.value?.records?.expiryDates || [];

      const today = new Date();
      const nextThursday = getNextThursday(today);
      const nextThursdayFmt = formatNSEExpiry(nextThursday);

      // Monthly: last Thursday of current or next month
      let monthlyDate = getMonthlyExpiry(today.getFullYear(), today.getMonth());
      if (monthlyDate < today) monthlyDate = getMonthlyExpiry(today.getFullYear(), today.getMonth() + 1);
      const monthlyFmt = formatNSEExpiry(monthlyDate);

      // Find nearest available expiry in the chain for weekly
      const weeklyExpiry = expiriesRaw.find(e => e >= nextThursdayFmt) || expiriesRaw[0];
      const monthlyExpiry = expiriesRaw.find(e => e >= monthlyFmt) || expiriesRaw[expiriesRaw.length - 1];

      const weeklyMetrics = computeOIMetrics(optData, weeklyExpiry);
      const monthlyMetrics = computeOIMetrics(optData, monthlyExpiry);

      weekly = { expiry: weeklyExpiry, ...weeklyMetrics };
      monthly = { expiry: monthlyExpiry, ...monthlyMetrics };
    }

    const marketData = { spot, vix, weekly, monthly, timestamp: new Date().toISOString() };

    // Generate AI commentary (non-blocking — use cached text if AI fails)
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

    const chainError = chainResult.status === 'rejected' ? chainResult.reason?.message : null;
    const payload = { ...marketData, commentary, commentaryError, chainError, nextUpdateAt: now + CACHE_TTL };
    commentaryCache = { data: payload, fetchedAt: now };
    res.json(payload);
  } catch (err) {
    console.error('Nifty commentary error:', err.message);
    res.status(500).json({ error: 'Failed to fetch market data' });
  }
}
