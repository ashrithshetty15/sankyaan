import axios from 'axios';
import * as cheerio from 'cheerio';

const NSE_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'en-US,en;q=0.9',
  'Referer': 'https://www.nseindia.com/',
};

const CACHE_TTL = 5 * 60 * 1000; // 5 minutes
let sentimentCache = { data: null, fetchedAt: 0 };

async function getNSECookies() {
  const resp = await axios.get('https://www.nseindia.com', {
    headers: NSE_HEADERS,
    timeout: 15000,
    maxRedirects: 5,
  });
  return (resp.headers['set-cookie'] || []).map(c => c.split(';')[0]).join('; ');
}

function getVIXLevel(value) {
  if (!value) return 'Unknown';
  if (value < 15) return 'Low Fear';
  if (value < 20) return 'Moderate';
  if (value < 25) return 'High';
  return 'Extreme Fear';
}

function getPCRSentiment(pcr) {
  if (pcr == null) return 'Unknown';
  if (pcr > 1.2) return 'Bullish';
  if (pcr < 0.8) return 'Bearish';
  return 'Neutral';
}

async function fetchAllIndices(cookies) {
  const headers = { ...NSE_HEADERS, Cookie: cookies };
  const resp = await axios.get('https://www.nseindia.com/api/allIndices', {
    headers,
    timeout: 15000,
  });
  return resp.data?.data || [];
}

function extractIndex(allData, symbol) {
  const entry = allData.find(i => i.indexSymbol === symbol || i.index === symbol);
  if (!entry) return null;
  const last = parseFloat(entry.last ?? entry.lastPrice ?? 0);
  const change = parseFloat(entry.variation ?? entry.change ?? entry.priceChange ?? 0);
  const changePct = parseFloat(entry.percentChange ?? entry.pChange ?? 0);
  return {
    last,
    change,
    changePct,
    open: parseFloat(entry.open ?? 0),
    high: parseFloat(entry.dayHigh ?? entry.high ?? 0),
    low: parseFloat(entry.dayLow ?? entry.low ?? 0),
  };
}

async function fetchPCR(symbol, cookies) {
  const headers = { ...NSE_HEADERS, Cookie: cookies };
  const resp = await axios.get(
    `https://www.nseindia.com/api/option-chain-indices?symbol=${symbol}`,
    { headers, timeout: 20000 }
  );
  const rows = resp.data?.records?.data || resp.data?.filtered?.data || [];
  let callOI = 0;
  let putOI = 0;
  for (const row of rows) {
    callOI += row.CE?.openInterest ?? 0;
    putOI += row.PE?.openInterest ?? 0;
  }
  const pcr = callOI > 0 ? parseFloat((putOI / callOI).toFixed(3)) : null;
  return { value: pcr, sentiment: getPCRSentiment(pcr) };
}

async function fetchStockTwits(symbol) {
  const resp = await axios.get(
    `https://api.stocktwits.com/api/2/streams/symbol/${symbol}.json`,
    { timeout: 10000 }
  );
  const messages = resp.data?.messages || [];
  const bullish = messages.filter(m => m.entities?.sentiment?.basic === 'Bullish').length;
  const bearish = messages.filter(m => m.entities?.sentiment?.basic === 'Bearish').length;
  const total = messages.length;
  const bullishPct = total > 0 ? Math.round((bullish / total) * 100) : 0;
  return { bullish, bearish, total, bullishPct };
}

async function fetchNews() {
  const resp = await axios.get('https://www.moneycontrol.com/rss/latestnews.xml', {
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
    if (title) items.push({ title: title.slice(0, 150), link, pubDate });
  });
  return items.slice(0, 8);
}

/**
 * GET /api/market-sentiment
 */
export async function getMarketSentiment(req, res) {
  try {
    const now = Date.now();
    if (sentimentCache.data && (now - sentimentCache.fetchedAt) < CACHE_TTL) {
      return res.json(sentimentCache.data);
    }

    // Get cookies — if NSE blocks, continue with empty string (partial data still ok)
    let cookies = '';
    try { cookies = await getNSECookies(); } catch (_) {}

    const [
      indicesResult,
      niftyPCRResult,
      bankNiftyPCRResult,
      stwNiftyResult,
      stwBankNiftyResult,
      newsResult,
    ] = await Promise.allSettled([
      fetchAllIndices(cookies),
      fetchPCR('NIFTY', cookies),
      fetchPCR('BANKNIFTY', cookies),
      fetchStockTwits('NIFTY.NSE'),
      fetchStockTwits('BANKNIFTY.NSE'),
      fetchNews(),
    ]);

    const allIndices = indicesResult.status === 'fulfilled' ? indicesResult.value : [];
    const vixRaw = extractIndex(allIndices, 'INDIA VIX');
    const niftyRaw = extractIndex(allIndices, 'NIFTY 50') || extractIndex(allIndices, 'Nifty 50');
    const bankNiftyRaw = extractIndex(allIndices, 'NIFTY BANK') || extractIndex(allIndices, 'Nifty Bank');

    const payload = {
      vix: vixRaw ? {
        value: vixRaw.last,
        change: vixRaw.change,
        changePct: vixRaw.changePct,
        level: getVIXLevel(vixRaw.last),
      } : null,
      indices: {
        nifty: niftyRaw,
        banknifty: bankNiftyRaw,
      },
      pcr: {
        nifty: niftyPCRResult.status === 'fulfilled' ? niftyPCRResult.value : null,
        banknifty: bankNiftyPCRResult.status === 'fulfilled' ? bankNiftyPCRResult.value : null,
      },
      stocktwits: {
        nifty: stwNiftyResult.status === 'fulfilled' ? stwNiftyResult.value : { bullish: 0, bearish: 0, total: 0, bullishPct: 0 },
        banknifty: stwBankNiftyResult.status === 'fulfilled' ? stwBankNiftyResult.value : { bullish: 0, bearish: 0, total: 0, bullishPct: 0 },
      },
      news: newsResult.status === 'fulfilled' ? newsResult.value : [],
      timestamp: new Date().toISOString(),
    };

    sentimentCache = { data: payload, fetchedAt: now };
    res.json(payload);
  } catch (err) {
    console.error('Market sentiment error:', err.message);
    res.status(500).json({ error: 'Failed to fetch market sentiment data' });
  }
}
