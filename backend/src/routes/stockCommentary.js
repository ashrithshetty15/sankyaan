import axios from 'axios';
import * as cheerio from 'cheerio';
import { getOptionChain, getQuotes, getFyersSymbol, isReady as isFyersReady, getCachedUnderlyingData } from '../fyersService.js';

const NSE_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'en-US,en;q=0.9',
  'Referer': 'https://www.nseindia.com/',
};

const CACHE_TTL = 20 * 60 * 1000; // 20 minutes
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

function formatNSEExpiry(date) {
  const dd = String(date.getDate()).padStart(2, '0');
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${dd}-${months[date.getMonth()]}-${date.getFullYear()}`;
}

// ─── OI + Greeks computation ──────────────────────────────────────────────────

/**
 * Compute OI metrics + ATM Greeks from NSE option chain rows for a given expiry.
 * Stock options are MONTHLY only (unlike indices which have weekly expiries).
 */
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

  // Max Pain
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

  // ── ATM Greeks (NSE data only) ──
  let atmIV = null, atmDelta = null, atmGamma = null, atmTheta = null;
  let ivSkew = null, expectedMove = null;

  if (spotPrice && strikes.length > 0) {
    const atmStrike = strikes.reduce((prev, curr) =>
      Math.abs(curr - spotPrice) < Math.abs(prev - spotPrice) ? curr : prev
    );
    const atmRow = rows.find(r => r.strikePrice === atmStrike);
    if (atmRow) {
      atmIV = atmRow.CE?.impliedVolatility ?? atmRow.PE?.impliedVolatility ?? null;
      atmDelta = atmRow.CE?.delta ?? null;
      atmGamma = atmRow.CE?.gamma ?? null;
      const ceTheta = atmRow.CE?.theta;
      const peTheta = atmRow.PE?.theta;
      if (ceTheta != null && peTheta != null) atmTheta = parseFloat(((Math.abs(ceTheta) + Math.abs(peTheta)) / 2).toFixed(2));
      else if (ceTheta != null) atmTheta = parseFloat(Math.abs(ceTheta).toFixed(2));
    }

    // IV Skew: OTM PE (5% below spot) IV minus OTM CE (5% above spot) IV
    const otmPEStrike = strikes.reduce((p, c) => Math.abs(c - spotPrice * 0.95) < Math.abs(p - spotPrice * 0.95) ? c : p);
    const otmCEStrike = strikes.reduce((p, c) => Math.abs(c - spotPrice * 1.05) < Math.abs(p - spotPrice * 1.05) ? c : p);
    const peIV = rows.find(r => r.strikePrice === otmPEStrike)?.PE?.impliedVolatility;
    const ceIV = rows.find(r => r.strikePrice === otmCEStrike)?.CE?.impliedVolatility;
    if (peIV != null && ceIV != null) ivSkew = parseFloat((peIV - ceIV).toFixed(2));

    // Expected monthly move: ATM IV / 100 * spot / sqrt(12)
    if (atmIV != null) expectedMove = parseFloat((atmIV / 100 * spotPrice / Math.sqrt(12)).toFixed(0));
  }

  return { pcr, maxPain: maxPainStrike, topCE, topPE, totalCallOI: callOI, totalPutOI: putOI,
           atmIV, atmDelta, atmGamma, atmTheta, ivSkew, expectedMove };
}

// ─── NSE data source ──────────────────────────────────────────────────────────

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

async function fetchFromNSE(symbol) {
  let cookies = '';
  try { cookies = await getNSECookies(); } catch (_) {}

  const [quoteResult, chainResult] = await Promise.allSettled([
    fetchStockQuote(symbol, cookies),
    fetchStockOptionChain(symbol, cookies),
  ]);

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
    console.warn(`NSE quote failed for ${symbol}:`, quoteResult.reason?.message);
  }

  let nearMonth = null, nextMonth = null;
  if (chainResult.status === 'fulfilled') {
    const optData = chainResult.value?.records?.data || chainResult.value?.filtered?.data || [];
    const expiriesRaw = chainResult.value?.records?.expiryDates || [];

    // Stock options have monthly expiry only — pick nearest upcoming and the one after
    const todayStr = formatNSEExpiry(new Date());
    const upcoming = expiriesRaw.filter(e => e >= todayStr);
    const nearExpiry = upcoming[0] || expiriesRaw[0];
    const nextExpiry = upcoming[1] || expiriesRaw[1] || null;

    nearMonth = nearExpiry
      ? { expiry: nearExpiry, ...computeOIMetrics(optData, nearExpiry, spot?.price) }
      : null;
    nextMonth = nextExpiry
      ? { expiry: nextExpiry, ...computeOIMetrics(optData, nextExpiry, spot?.price) }
      : null;
  } else {
    console.warn(`NSE option chain failed for ${symbol}:`, chainResult.reason?.message);
  }

  return { spot, nearMonth, nextMonth, source: 'nse' };
}

// ─── Fyers data source ────────────────────────────────────────────────────────

function computeFromFyers(optData, targetExpiry) {
  const rows = optData.filter(o => !targetExpiry || o.expiry === targetExpiry);
  let callOI = 0, putOI = 0;
  const strikeOI = {};

  for (const opt of rows) {
    const strike = opt.strike_price;
    if (!strike) continue;
    if (!strikeOI[strike]) strikeOI[strike] = { ce: 0, pe: 0 };
    if (opt.option_type === 'CE') { callOI += opt.oi || 0; strikeOI[strike].ce += opt.oi || 0; }
    if (opt.option_type === 'PE') { putOI += opt.oi || 0; strikeOI[strike].pe += opt.oi || 0; }
  }

  const pcr = callOI > 0 ? parseFloat((putOI / callOI).toFixed(3)) : null;
  const strikes = Object.keys(strikeOI).map(Number).sort((a, b) => a - b);

  let maxPainStrike = null, minLoss = Infinity;
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

  // Fyers doesn't return Greeks per strike — these will be null
  return { pcr, maxPain: maxPainStrike, topCE, topPE, totalCallOI: callOI, totalPutOI: putOI,
           atmIV: null, atmDelta: null, atmGamma: null, atmTheta: null, ivSkew: null, expectedMove: null };
}

/**
 * Fyers option symbols encode expiry in the name: 'NSE:RELIANCE2503271240CE'
 * → extract '250327' → '2025-03-27' (ISO, for sorting)
 */
function parseFyersExpiry(sym) {
  const m = /(\d{6})\d+(?:CE|PE)$/i.exec(sym || '');
  if (!m) return null;
  const s = m[1];
  const yy = 2000 + parseInt(s.slice(0, 2));
  const mm = String(parseInt(s.slice(2, 4))).padStart(2, '0');
  const dd = String(parseInt(s.slice(4, 6))).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

/**
 * Merge CE + PE rows by strike into a single sorted array for the option chain table.
 */
function buildOptionChain(optData, targetExpiry, spotPrice) {
  const rows = optData.filter(o => o.expiry === targetExpiry);
  const strikeSet = [...new Set(rows.map(o => o.strike_price).filter(Boolean))].sort((a, b) => a - b);

  let atmStrike = null;
  if (spotPrice && strikeSet.length > 0) {
    atmStrike = strikeSet.reduce((p, c) => Math.abs(c - spotPrice) < Math.abs(p - spotPrice) ? c : p);
  }

  return strikeSet.map(strike => {
    const ce = rows.find(o => o.strike_price === strike && o.option_type === 'CE');
    const pe = rows.find(o => o.strike_price === strike && o.option_type === 'PE');
    return {
      strike,
      isATM: strike === atmStrike,
      ce: ce ? { oi: ce.oi || 0, ltp: ce.ltp || null, iv: ce.iv || null, delta: ce.delta || null, volume: ce.volume || 0 } : null,
      pe: pe ? { oi: pe.oi || 0, ltp: pe.ltp || null, iv: pe.iv || null, delta: pe.delta || null, volume: pe.volume || 0 } : null,
    };
  });
}

async function fetchFromFyers(symbol) {
  const fyersSymbol = getFyersSymbol(symbol);
  await Promise.all([
    getOptionChain(fyersSymbol, 20),
    getQuotes([fyersSymbol]),
  ]);

  // Read from cache (populated by the calls above)
  const chainData = await getOptionChain(fyersSymbol, 20);
  if (chainData?.error) throw new Error(chainData.error);

  // Fyers option rows have no .expiry field — parse it from the symbol string
  const rawOptData = chainData.optionsChain || [];
  const optData = rawOptData.map(o => ({
    ...o,
    expiry: parseFyersExpiry(o.symbol || ''),
  }));

  const expiriesRaw = [...new Set(optData.map(o => o.expiry).filter(Boolean))].sort();
  const today = new Date().toISOString().slice(0, 10);
  const upcoming = expiriesRaw.filter(e => e >= today);
  const nearExpiry = upcoming[0] || expiriesRaw[0];
  const nextExpiry = upcoming[1] || expiriesRaw[1] || null;

  const nearMonth = nearExpiry ? { expiry: nearExpiry, ...computeFromFyers(optData, nearExpiry) } : null;
  const nextMonth = nextExpiry ? { expiry: nextExpiry, ...computeFromFyers(optData, nextExpiry) } : null;

  // Spot price from getCachedUnderlyingData (populated by getQuotes above)
  const spotData = getCachedUnderlyingData(fyersSymbol);
  const spot = spotData?.ltp
    ? { price: parseFloat(spotData.ltp), change: null, changePct: null }
    : null;

  const nearChain = nearExpiry ? buildOptionChain(optData, nearExpiry, spot?.price) : [];

  console.log(`Fyers ${symbol}: ${optData.length} rows, expiries: ${expiriesRaw.join(', ')}, spot: ${spotData?.ltp}`);
  return { spot, nearMonth, nextMonth, nearChain, source: 'fyers' };
}

// ─── News fetching ────────────────────────────────────────────────────────────

async function fetchStockNews(symbol) {
  const query = encodeURIComponent(`${symbol} NSE stock India`);
  const url = `https://news.google.com/rss/search?q=${query}&hl=en-IN&gl=IN&ceid=IN:en`;
  const resp = await axios.get(url, {
    timeout: 10000,
    responseType: 'text',
    headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/rss+xml, text/xml' },
  });
  const $ = cheerio.load(resp.data, { xmlMode: true });
  const items = [];
  $('item').each((_, el) => {
    const title = $(el).find('title').text().trim().replace(/^<!\[CDATA\[|\]\]>$/g, '');
    const link = $(el).find('link').text().trim() || $(el).find('guid').text().trim();
    const pubDate = $(el).find('pubDate').text().trim();
    if (title && items.length < 5) items.push({ title: title.slice(0, 140), link, pubDate });
  });
  return items;
}

// ─── AI commentary ─────────────────────────────────────────────────────────────

function fmtN(v, d = 2) { return v != null ? Number(v).toFixed(d) : 'N/A'; }
function fmtOI(oi) { return oi >= 1e5 ? `${(oi / 1e5).toFixed(1)}L` : String(oi); }

function buildStockPrompt(symbol, spot, nearMonth, nextMonth, news, timeStr) {
  const oiLine = (label, d) => {
    if (!d) return `${label}: N/A`;
    const greeks = [
      d.atmIV != null ? `ATM IV ${fmtN(d.atmIV)}%` : null,
      d.expectedMove != null ? `Exp.Move ±${d.expectedMove}pts` : null,
      d.atmDelta != null ? `Δ ${fmtN(d.atmDelta)}` : null,
      d.atmGamma != null ? `Γ ${fmtN(d.atmGamma, 4)}` : null,
      d.atmTheta != null ? `Θ -${fmtN(d.atmTheta)}/day` : null,
      d.ivSkew != null ? `IV Skew(PE-CE) ${fmtN(d.ivSkew)}%` : null,
    ].filter(Boolean).join(' | ');
    return `${label} (${d.expiry}): PCR ${d.pcr ?? 'N/A'} | Max Pain ${d.maxPain ?? 'N/A'} | CE walls: ${d.topCE?.slice(0,3).map(s => `${s.strike}(${fmtOI(s.oi)})`).join(', ') || 'N/A'} | PE support: ${d.topPE?.slice(0,3).map(s => `${s.strike}(${fmtOI(s.oi)})`).join(', ') || 'N/A'}${greeks ? `\n  Greeks: ${greeks}` : ''}`;
  };

  const newsLines = news?.length
    ? `\nRECENT NEWS:\n${news.slice(0, 4).map((n, i) => `${i + 1}. ${n.title}`).join('\n')}`
    : '';

  const priceStr = spot?.price
    ? `₹${spot.price}${spot.changePct != null ? ` (${spot.changePct >= 0 ? '+' : ''}${spot.changePct}%)` : ''}`
    : 'N/A';

  return `You are a professional Indian derivatives analyst. Write exactly 3 paragraphs about ${symbol} F&O at ${timeStr} IST. Be direct, use numbers, no bullet points.

DATA:
- ${symbol} Spot: ${priceStr}
- ${oiLine('Near Month', nearMonth)}
- ${oiLine('Next Month', nextMonth)}${newsLines}

Paragraph 1: Current directional bias — combine PCR, IV environment (skew = fear), ATM delta, and expected monthly move range.
Paragraph 2: Near-month levels — key CE resistance and PE support from OI, max pain magnet, gamma/theta pinning risk near expiry.
Paragraph 3: News + next-month picture — how recent news ties to the OI setup; structural support/resistance and outlook.

Under 220 words. Use specific strike prices and Greek values as numbers. Confident analyst tone.`;
}

async function generateStockCommentary(symbol, spot, nearMonth, nextMonth, news, timestamp) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;

  const timeStr = new Date(timestamp).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' });
  const prompt = buildStockPrompt(symbol, spot, nearMonth, nextMonth, news, timeStr);

  const resp = await axios.post(
    'https://api.anthropic.com/v1/messages',
    { model: 'claude-haiku-4-5-20251001', max_tokens: 550, messages: [{ role: 'user', content: prompt }] },
    {
      headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      timeout: 30000,
    }
  );
  return resp.data?.content?.[0]?.text || null;
}

// ─── Route handler ─────────────────────────────────────────────────────────────

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

  if (!marketOpen && !force && cached) {
    return res.json({ ...cached.data, marketOpen: false });
  }
  if (!force && cached && (now - cached.fetchedAt) < CACHE_TTL) {
    return res.json({ ...cached.data, marketOpen });
  }

  try {
    let oiResult;

    if (isFyersReady()) {
      try {
        oiResult = await fetchFromFyers(symbol);
        console.log(`Stock commentary for ${symbol}: fetched via Fyers`);
      } catch (e) {
        console.warn(`Fyers fetch failed for ${symbol}: ${e.message} — falling back to NSE`);
        oiResult = await fetchFromNSE(symbol);
      }
    } else {
      oiResult = await fetchFromNSE(symbol);
      console.log(`Stock commentary for ${symbol}: fetched via NSE (Fyers not connected)`);
    }

    const { spot, nearMonth, nextMonth, nearChain, source: dataSource } = oiResult;

    // Fetch news in parallel (graceful failure)
    let news = [];
    try { news = await fetchStockNews(symbol); } catch (e) {
      console.warn(`News fetch failed for ${symbol}:`, e.message);
    }

    const timestamp = new Date().toISOString();

    let commentary = null;
    let commentaryError = null;
    if (!process.env.ANTHROPIC_API_KEY) {
      commentaryError = 'ANTHROPIC_API_KEY not set';
    } else {
      try {
        commentary = await generateStockCommentary(symbol, spot, nearMonth, nextMonth, news, timestamp);
      } catch (e) {
        commentaryError = e.response?.data?.error?.message || e.message;
        console.warn(`Commentary AI error for ${symbol}:`, commentaryError);
      }
    }

    const payload = {
      symbol, spot, nearMonth, nextMonth, optionChain: nearChain || [], news,
      commentary, commentaryError, dataSource,
      marketOpen, nextUpdateAt: marketOpen ? now + CACHE_TTL : null, timestamp,
    };
    stockCommentaryCache.set(symbol, { data: payload, fetchedAt: now });
    res.json(payload);
  } catch (err) {
    console.error('Stock commentary error:', err.message);
    res.status(500).json({ error: `Failed to fetch data for ${symbol}: ${err.message}` });
  }
}
