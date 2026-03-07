/**
 * TrueData Market Data API Service
 *
 * Provides real-time options chain data via WebSocket and historical data via REST.
 * Uses the truedata-nodejs npm package.
 *
 * Env vars: tdUser, tdPwd
 */

// In-memory cache for live options data
const optionsCache = new Map(); // key: `${symbol}_${expiry}` → Map<strike, {ce: {...}, pe: {...}}>
const underlyingCache = new Map(); // key: symbol → {ltp, open, high, low, close, volume, oi}

let rtFeed = null;
let historicalApi = null;
let trueDataModule = null;
let isConnected = false;
let tdUser = null;
let tdPwd = null;

/**
 * Initialize TrueData connections (WebSocket + Historical REST).
 * Call once on server startup (after dotenv.config() has run).
 */
export async function initTrueData() {
  tdUser = process.env.TRUEDATA_USER;
  tdPwd = process.env.TRUEDATA_PWD;

  console.log(`🔑 TrueData credentials: user=${tdUser ? 'set' : 'MISSING'}, pwd=${tdPwd ? 'set' : 'MISSING'}`);

  if (!tdUser || !tdPwd) {
    console.warn('⚠️  TrueData credentials not set (TRUEDATA_USER / TRUEDATA_PWD). Trade alerts disabled.');
    return false;
  }

  try {
    const td = await import('truedata-nodejs');
    const { rtConnect, rtFeed: feed, rtSubscribe, rtDisconnect, historical, rtConnectFullFeed } = td.default || td;

    // Store module references for later use
    rtFeed = feed;
    historicalApi = historical;

    // Connect real-time WebSocket
    await rtConnect(tdUser, tdPwd, ['NIFTY', 'BANKNIFTY'], 8082, 1, 1);

    // Set up event handlers on the feed emitter
    rtFeed.on('touchline', (data) => {
      handleTouchline(data);
    });

    rtFeed.on('greeks', (data) => {
      handleGreeks(data);
    });

    rtFeed.on('bidask', (data) => {
      handleBidAsk(data);
    });

    rtFeed.on('error', (err) => {
      console.error('❌ TrueData WebSocket error:', err.message);
    });

    rtFeed.on('disconnect', () => {
      console.warn('⚠️  TrueData WebSocket disconnected');
      isConnected = false;
    });

    // Store subscribe/disconnect functions for later use
    trueDataModule = { rtSubscribe, rtDisconnect, rtConnect, rtConnectFullFeed };

    isConnected = true;
    console.log('✅ TrueData service initialized — connected to WebSocket');
    return true;
  } catch (err) {
    console.error('❌ Failed to initialize TrueData:', err.message);
    return false;
  }
}

/**
 * Handle real-time touchline (LTP, OI, volume) updates.
 */
function handleTouchline(data) {
  if (!data || !data.symbol) return;

  const symbol = data.symbol;
  const parsed = parseOptionSymbol(symbol);

  if (parsed) {
    // It's an option — update options cache
    const cacheKey = `${parsed.underlying}_${parsed.expiry}`;
    if (!optionsCache.has(cacheKey)) {
      optionsCache.set(cacheKey, new Map());
    }
    const strikeMap = optionsCache.get(cacheKey);
    if (!strikeMap.has(parsed.strike)) {
      strikeMap.set(parsed.strike, { ce: null, pe: null });
    }
    const strikeData = strikeMap.get(parsed.strike);
    const side = parsed.type.toUpperCase() === 'CE' ? 'ce' : 'pe';
    strikeData[side] = {
      ...strikeData[side],
      symbol,
      ltp: data.ltp,
      volume: data.volume,
      oi: data.oi,
      oiChange: data.oi_change,
      bidPrice: data.bid_price,
      askPrice: data.ask_price,
      timestamp: data.timestamp || Date.now(),
    };
  } else {
    // It's an underlying — update underlying cache
    underlyingCache.set(symbol, {
      ltp: data.ltp,
      open: data.open,
      high: data.high,
      low: data.low,
      close: data.close,
      volume: data.volume,
      oi: data.oi,
      timestamp: data.timestamp || Date.now(),
    });
  }
}

/**
 * Handle Greeks data (IV, Delta, Theta, Vega, Gamma).
 */
function handleGreeks(data) {
  if (!data || !data.symbol) return;

  const parsed = parseOptionSymbol(data.symbol);
  if (!parsed) return;

  const cacheKey = `${parsed.underlying}_${parsed.expiry}`;
  if (!optionsCache.has(cacheKey)) {
    optionsCache.set(cacheKey, new Map());
  }
  const strikeMap = optionsCache.get(cacheKey);
  if (!strikeMap.has(parsed.strike)) {
    strikeMap.set(parsed.strike, { ce: null, pe: null });
  }
  const strikeData = strikeMap.get(parsed.strike);
  const side = parsed.type.toUpperCase() === 'CE' ? 'ce' : 'pe';
  strikeData[side] = {
    ...strikeData[side],
    iv: data.iv,
    delta: data.delta,
    theta: data.theta,
    vega: data.vega,
    gamma: data.gamma,
  };
}

/**
 * Handle bid-ask data for liquidity.
 */
function handleBidAsk(data) {
  if (!data || !data.symbol) return;

  const parsed = parseOptionSymbol(data.symbol);
  if (!parsed) return;

  const cacheKey = `${parsed.underlying}_${parsed.expiry}`;
  const strikeMap = optionsCache.get(cacheKey);
  if (!strikeMap) return;

  const strikeData = strikeMap.get(parsed.strike);
  if (!strikeData) return;

  const side = parsed.type.toUpperCase() === 'CE' ? 'ce' : 'pe';
  strikeData[side] = {
    ...strikeData[side],
    bidPrice: data.bid_price,
    askPrice: data.ask_price,
    bidQty: data.bid_qty,
    askQty: data.ask_qty,
    spread: data.ask_price && data.bid_price ? data.ask_price - data.bid_price : null,
  };
}

/**
 * Parse an NSE option symbol like "NIFTY 27MAR2026 CE 24500" into components.
 */
function parseOptionSymbol(symbol) {
  if (!symbol) return null;

  // Pattern: UNDERLYING DDMMMYYYY CE/PE STRIKE
  const match = symbol.match(/^(\w+)\s+(\d{2}[A-Z]{3}\d{4})\s+(CE|PE)\s+(\d+(?:\.\d+)?)$/i);
  if (match) {
    return {
      underlying: match[1],
      expiry: match[2],
      type: match[3].toUpperCase(),
      strike: parseFloat(match[4]),
    };
  }

  // Alternative pattern: UNDERLYING YYMM STRIKE CE/PE
  const match2 = symbol.match(/^(\w+)(\d{4})\s+(\d+(?:\.\d+)?)\s+(CE|PE)$/i);
  if (match2) {
    return {
      underlying: match2[1],
      expiry: match2[2],
      type: match2[4].toUpperCase(),
      strike: parseFloat(match2[3]),
    };
  }

  return null;
}

/**
 * Subscribe to options chain for a symbol + expiry.
 * Builds the list of option symbols and subscribes via WebSocket.
 */
export async function subscribeOptionsChain(underlying, expiry, strikeRange = 20) {
  if (!rtFeed || !isConnected) {
    console.warn('TrueData not connected. Cannot subscribe to options chain.');
    return false;
  }

  try {
    // Subscribe to the underlying first
    const symbols = [underlying];

    // Get ATM strike from underlying LTP
    const underlyingData = underlyingCache.get(underlying);
    const spotPrice = underlyingData?.ltp;

    if (!spotPrice) {
      // Subscribe to underlying first and wait for LTP
      await trueDataModule.rtSubscribe([underlying]);
      console.log(`Subscribed to ${underlying}, waiting for LTP...`);
      return true;
    }

    // Build option symbols for the chain
    const stepSize = underlying === 'NIFTY' ? 50 : underlying === 'BANKNIFTY' ? 100 : 50;
    const atmStrike = Math.round(spotPrice / stepSize) * stepSize;

    for (let i = -strikeRange; i <= strikeRange; i++) {
      const strike = atmStrike + (i * stepSize);
      symbols.push(`${underlying} ${expiry} CE ${strike}`);
      symbols.push(`${underlying} ${expiry} PE ${strike}`);
    }

    await trueDataModule.rtSubscribe(symbols);
    console.log(`✅ Subscribed to ${symbols.length} symbols for ${underlying} ${expiry} options chain`);
    return true;
  } catch (err) {
    console.error(`❌ Failed to subscribe to ${underlying} options chain:`, err.message);
    return false;
  }
}

/**
 * Get the current options chain from in-memory cache.
 */
export function getOptionsChain(underlying, expiry) {
  const cacheKey = `${underlying}_${expiry}`;
  const strikeMap = optionsCache.get(cacheKey);

  if (!strikeMap) return [];

  const chain = [];
  for (const [strike, data] of strikeMap.entries()) {
    chain.push({
      strike,
      ce: data.ce,
      pe: data.pe,
    });
  }

  return chain.sort((a, b) => a.strike - b.strike);
}

/**
 * Get underlying spot data from cache.
 */
export function getUnderlyingData(symbol) {
  return underlyingCache.get(symbol) || null;
}

/**
 * Fetch historical bar data via REST API.
 * @param {string} symbol - e.g. "NIFTY" or "NIFTY 27MAR2026 CE 24500"
 * @param {string} timeframe - e.g. "1min", "5min", "1D"
 * @param {Date} from - start date
 * @param {Date} to - end date
 */
export async function getHistoricalBars(symbol, timeframe, from, to) {
  if (!historicalApi) {
    console.warn('TrueData historical API not initialized.');
    return [];
  }

  try {
    await historicalApi.auth(tdUser, tdPwd);
    const data = await historicalApi.getBarData(symbol, timeframe, from, to);
    return data || [];
  } catch (err) {
    console.error(`❌ Failed to fetch historical bars for ${symbol}:`, err.message);
    return [];
  }
}

/**
 * Calculate IV Rank (0–100) for an underlying.
 * IV Rank = (Current IV - 52-week Low IV) / (52-week High IV - 52-week Low IV) × 100
 *
 * Requires historical IV data. Uses ATM option IV as proxy.
 */
export async function calculateIVRank(underlying, currentIV) {
  try {
    // Fetch 1 year of daily bars for the underlying to compute historical volatility
    const oneYearAgo = new Date();
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
    const bars = await getHistoricalBars(underlying, '1D', oneYearAgo, new Date());

    if (!bars || bars.length < 20) {
      // Not enough data — return a default mid-range
      return 50;
    }

    // Compute realized volatility windows to approximate IV range
    const closes = bars.map(b => b.close).filter(Boolean);
    const returns = [];
    for (let i = 1; i < closes.length; i++) {
      returns.push(Math.log(closes[i] / closes[i - 1]));
    }

    // Rolling 20-day realized vol (annualized)
    const volWindows = [];
    for (let i = 20; i <= returns.length; i++) {
      const window = returns.slice(i - 20, i);
      const mean = window.reduce((a, b) => a + b, 0) / window.length;
      const variance = window.reduce((a, b) => a + (b - mean) ** 2, 0) / window.length;
      volWindows.push(Math.sqrt(variance * 252) * 100);
    }

    if (volWindows.length === 0) return 50;

    const minVol = Math.min(...volWindows);
    const maxVol = Math.max(...volWindows);

    if (maxVol - minVol < 0.01) return 50;

    const ivRank = ((currentIV - minVol) / (maxVol - minVol)) * 100;
    return Math.max(0, Math.min(100, Math.round(ivRank)));
  } catch (err) {
    console.error(`Failed to calculate IV Rank for ${underlying}:`, err.message);
    return 50;
  }
}

/**
 * Check if TrueData is connected and ready.
 */
export function isReady() {
  return isConnected && rtFeed !== null;
}

/**
 * Disconnect TrueData WebSocket.
 */
export async function disconnect() {
  if (trueDataModule?.rtDisconnect) {
    try {
      await trueDataModule.rtDisconnect();
    } catch (_) { /* ignore */ }
  }
  rtFeed = null;
  trueDataModule = null;
  isConnected = false;
  console.log('TrueData disconnected');
}

export default {
  initTrueData,
  subscribeOptionsChain,
  getOptionsChain,
  getUnderlyingData,
  getHistoricalBars,
  calculateIVRank,
  isReady,
  disconnect,
};
