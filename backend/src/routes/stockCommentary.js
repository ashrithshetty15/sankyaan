import axios from 'axios';

const NSE_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'en-US,en;q=0.9',
  'Referer': 'https://www.nseindia.com/',
};

const CACHE_TTL = 30 * 60 * 1000; // 30 minutes
const stockCommentaryCache = new Map(); // key = symbol (uppercase)

function isMarketOpen() {
  const now = new Date();
  const ist = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
  const day = ist.getDay();
  if (day === 0 || day === 6) return false;
  const mins = ist.getHours() * 60 + ist.getMinutes();
  return mins >= 9 * 60 + 15 && mins <= 15 * 60 + 30;
}

async function getNSECookies() {
  const resp = await axios.get('https://www.nseindia.com', {
    headers: NSE_HEADERS, timeout: 15000, maxRedirects: 5,
  });
  return (resp.headers['set-cookie'] || []).map(c => c.split(';')[0]).join('; ');
}

/** Last Thursday of the given month */
function getMonthlyExpiry(year, month) {
  const lastDay = new Date(year, month + 1, 0);
  const dow = lastDay.getDay();
  const lastThursday = new Date(lastDay);
  lastThursday.setDate(lastDay.getDate() - ((dow + 3) % 7));
  return lastThursday;
}

/** Next Thursday on or after today */
function getNextThursday(fromDate = new Date()) {
  const d = new Date(fromDate);
  const dow = d.getDay();
  const daysUntilThursday = (4 - dow + 7) % 7 || 7;
  d.setDate(d.getDate() + daysUntilThursday);
  return d;
}

function formatNSEExpiry(date) {
  const dd = String(date.getDate()).padStart(2, '0');
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${dd}-${months[date.getMonth()]}-${date.getFullYear()}`;
}

async function fetchStockOptionChain(symbol, cookies) {
  const headers = { ...NSE_HEADERS, Cookie: cookies };
  const resp = await axios.get(
    `https://www.nseindia.com/api/option-chain-equities?symbol=${encodeURIComponent(symbol)}`,
    { headers, timeout: 20000 }
  );
  return resp.data;
}

async function fetchStockQuote(symbol, cookies) {
  const headers = { ...NSE_HEADERS, Cookie: cookies };
  const resp = await axios.get(
    `https://www.nseindia.com/api/quote-equity?symbol=${encodeURIComponent(symbol)}`,
    { headers, timeout: 15000 }
  );
  return resp.data;
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

async function generateStockCommentary(symbol, marketData) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;

  const { spot, weekly, monthly, timestamp } = marketData;
  const timeStr = new Date(timestamp).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' });

  const oiLine = (data) => {
    if (!data) return 'N/A';
    return `PCR ${data.pcr ?? 'N/A'} | Max Pain ${data.maxPain ?? 'N/A'} | CE: ${data.topCE?.slice(0,3).map(s => `${s.strike}(${fmtOI(s.oi)})`).join(', ') ?? 'N/A'} | PE: ${data.topPE?.slice(0,3).map(s => `${s.strike}(${fmtOI(s.oi)})`).join(', ') ?? 'N/A'}`;
  };

  const prompt = `You are a professional Indian derivatives market analyst providing live commentary at ${timeStr} IST. Analyze ${symbol} F&O data and write a concise 3-paragraph commentary in a confident, analytical tone — like a CNBC-TV18 analyst.

STOCK DATA:
- ${symbol} Spot: ₹${spot?.price ?? 'N/A'} (${spot?.changePct >= 0 ? '+' : ''}${spot?.changePct ?? 0}%)

OPTION CHAIN OI:
- Weekly expiry (${weekly?.expiry ?? 'N/A'}): ${oiLine(weekly)}
- Monthly expiry (${monthly?.expiry ?? 'N/A'}): ${oiLine(monthly)}

Write exactly 3 paragraphs:
1. Current price action and what PCR signals about institutional bias for ${symbol}
2. Weekly expiry — key support/resistance from OI positioning, where bears/bulls are hedging
3. Monthly picture — structural support/resistance levels and near-term outlook for ${symbol}

Keep it under 200 words. Use specific strike prices as numbers. No bullet points. Be direct and insightful.`;

  const resp = await axios.post(
    'https://api.anthropic.com/v1/messages',
    {
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 500,
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
 * GET /api/stock-commentary?symbol=RELIANCE
 */
export async function getStockCommentary(req, res) {
  const symbol = (req.query.symbol || '').toUpperCase().trim();
  if (!symbol) {
    return res.status(400).json({ error: 'symbol query param is required (e.g. ?symbol=RELIANCE)' });
  }

  const force = req.query.force === '1';
  const now = Date.now();
  const marketOpen = isMarketOpen();

  const cached = stockCommentaryCache.get(symbol);

  // Outside market hours — return cached data with marketOpen flag
  if (!marketOpen && !force && cached) {
    return res.json({ ...cached.data, marketOpen: false });
  }

  // Within cache TTL
  if (!force && cached && (now - cached.fetchedAt) < CACHE_TTL) {
    return res.json({ ...cached.data, marketOpen });
  }

  try {
    let cookies = '';
    try { cookies = await getNSECookies(); } catch (_) {}

    const [quoteResult, chainResult] = await Promise.allSettled([
      fetchStockQuote(symbol, cookies),
      fetchStockOptionChain(symbol, cookies),
    ]);

    // Extract spot price
    let spot = null;
    if (quoteResult.status === 'fulfilled') {
      const pi = quoteResult.value?.priceInfo;
      if (pi) {
        spot = {
          price: parseFloat(pi.lastPrice ?? pi.last ?? 0),
          change: parseFloat(pi.change ?? 0),
          changePct: parseFloat(pi.pChange ?? pi.changePct ?? 0),
        };
      }
    } else {
      console.warn(`Stock quote fetch failed for ${symbol}:`, quoteResult.reason?.message);
    }

    // Extract OI metrics
    let weekly = null;
    let monthly = null;
    if (chainResult.status === 'fulfilled') {
      const { weekly: w, monthly: m } = extractExpiryMetrics(chainResult.value, new Date());
      weekly = w;
      monthly = m;
    } else {
      console.warn(`Option chain fetch failed for ${symbol}:`, chainResult.reason?.message);
    }

    const marketData = { symbol, spot, weekly, monthly, timestamp: new Date().toISOString() };

    let commentary = null;
    let commentaryError = null;
    if (!process.env.ANTHROPIC_API_KEY) {
      commentaryError = 'ANTHROPIC_API_KEY not set';
    } else {
      try { commentary = await generateStockCommentary(symbol, marketData); } catch (e) {
        commentaryError = e.response?.data?.error?.message || e.message;
        console.warn(`Commentary AI error for ${symbol}:`, commentaryError);
      }
    }

    const payload = {
      ...marketData,
      commentary,
      commentaryError,
      marketOpen,
      nextUpdateAt: marketOpen ? now + CACHE_TTL : null,
    };
    stockCommentaryCache.set(symbol, { data: payload, fetchedAt: now });
    res.json(payload);
  } catch (err) {
    console.error('Stock commentary error:', err.message);
    res.status(500).json({ error: `Failed to fetch data for ${symbol}` });
  }
}
