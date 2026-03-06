import { fyersModel } from 'fyers-api-v3';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TOKEN_FILE = path.join(__dirname, '..', '.fyers-token.json');

let fyers = null;
let accessToken = null;
let isConnected = false;

// In-memory options chain cache
const optionsChainCache = new Map();
const underlyingCache = new Map();

/**
 * Initialize Fyers API client.
 */
export function initFyers() {
  const appId = process.env.FYERS_APP_ID;
  const secretKey = process.env.FYERS_SECRET_KEY;

  if (!appId || !secretKey) {
    console.warn('Fyers credentials not set. Set FYERS_APP_ID and FYERS_SECRET_KEY in .env');
    return false;
  }

  fyers = new fyersModel();
  fyers.setAppId(appId);
  fyers.setRedirectUrl(process.env.FYERS_REDIRECT_URL || 'http://localhost:5000/api/fyers/callback');

  // Try loading saved token
  const saved = loadToken();
  if (saved && saved.access_token) {
    accessToken = saved.access_token;
    fyers.setAccessToken(accessToken);
    isConnected = true;
    console.log('Fyers: loaded saved access token');
    return true;
  }

  console.log('Fyers: no access token. User needs to authenticate via /api/fyers/auth');
  return false;
}

/**
 * Get Fyers OAuth2 login URL.
 */
export function getAuthUrl() {
  if (!fyers) initFyers();
  if (!fyers) return null;
  return fyers.generateAuthCode();
}

/**
 * Exchange auth code for access token.
 */
export async function handleAuthCallback(authCode) {
  if (!fyers) throw new Error('Fyers not initialized');

  const secretKey = process.env.FYERS_SECRET_KEY;
  const appId = process.env.FYERS_APP_ID;

  const response = await fyers.generate_access_token({
    client_id: appId,
    secret_key: secretKey,
    auth_code: authCode,
  });

  if (response.s === 'ok' && response.access_token) {
    accessToken = response.access_token;
    fyers.setAccessToken(accessToken);
    isConnected = true;
    saveToken({ access_token: accessToken, created_at: new Date().toISOString() });
    console.log('Fyers: authenticated successfully');
    return true;
  } else {
    throw new Error(response.message || 'Fyers auth failed');
  }
}

/**
 * Get option chain for an underlying (e.g. NSE:NIFTY50-INDEX).
 */
export async function getOptionChain(symbol, strikeCount = 10) {
  if (!isConnected || !fyers) {
    return { error: 'Fyers not connected. Please authenticate first.' };
  }

  try {
    const result = await fyers.getOptionChain({ symbol, strikecount: strikeCount });

    if (result.s === 'ok' && result.data) {
      const vixVal = result.data?.indiavixData?.ltp || 0;
      optionsChainCache.set(symbol, { data: result.data, vix: vixVal, timestamp: Date.now() });
      return result.data;
    }
    return { error: result.message || 'No data returned' };
  } catch (err) {
    console.error('Fyers option chain error for ' + symbol + ':', err.message);
    return { error: err.message };
  }
}

/**
 * Get quotes for symbols.
 */
export async function getQuotes(symbols) {
  if (!isConnected || !fyers) return { error: 'Fyers not connected' };

  try {
    const result = await fyers.getQuotes(symbols);
    if (result.s === 'ok' && result.d) {
      for (const quote of result.d) {
        underlyingCache.set(quote.n, {
          ltp: quote.v?.lp,
          open: quote.v?.open_price,
          high: quote.v?.high_price,
          low: quote.v?.low_price,
          close: quote.v?.prev_close_price,
          volume: quote.v?.volume,
          timestamp: Date.now(),
        });
      }
      return result.d;
    }
    return { error: result.message || 'No quotes data' };
  } catch (err) {
    console.error('Fyers quotes error:', err.message);
    return { error: err.message };
  }
}

/**
 * Get historical candle data.
 */
export async function getHistory(symbol, resolution, fromDate, toDate) {
  if (!isConnected || !fyers) return [];

  try {
    const result = await fyers.getHistory({
      symbol, resolution, date_format: 1,
      range_from: fromDate, range_to: toDate, cont_flag: 1,
    });
    return (result.s === 'ok' && result.candles) ? result.candles : [];
  } catch (err) {
    console.error('Fyers history error for ' + symbol + ':', err.message);
    return [];
  }
}

/**
 * Get market status.
 */
export async function getMarketStatus() {
  if (!isConnected || !fyers) return null;
  try { return await fyers.market_status(); } catch (_) { return null; }
}

/**
 * Get cached options chain formatted for the strategy engine.
 */
export function getCachedOptionsChain(symbol) {
  const cached = optionsChainCache.get(symbol);
  if (!cached || Date.now() - cached.timestamp > 60000) return [];

  const optData = cached.data?.optionsChain || cached.data;
  if (!Array.isArray(optData)) return [];

  const strikes = new Map();
  for (const opt of optData) {
    const strike = opt.strike_price;
    if (!strike || strike < 0) continue;

    if (!strikes.has(strike)) strikes.set(strike, { strike, ce: null, pe: null });

    const row = strikes.get(strike);
    if (opt.option_type !== 'CE' && opt.option_type !== 'PE') continue;
    const side = opt.option_type === 'CE' ? 'ce' : 'pe';
    row[side] = {
      ltp: opt.ltp || 0,
      iv: 0,
      delta: 0,
      theta: 0,
      gamma: 0,
      vega: 0,
      oi: opt.oi || 0,
      volume: opt.volume || 0,
      bid: opt.bid || 0,
      ask: opt.ask || 0,
      spread: (opt.ask || 0) - (opt.bid || 0),
      symbol: opt.symbol || '',
    };
  }

  return Array.from(strikes.values()).sort((a, b) => a.strike - b.strike);
}

export function getCachedVIX(symbol) {
  const cached = optionsChainCache.get(symbol);
  return cached?.vix || 0;
}

export function getCachedUnderlyingData(symbol) {
  return underlyingCache.get(symbol) || null;
}

export function isReady() { return isConnected; }
export function getClient() { return fyers; }

// -- Token persistence --
function saveToken(data) {
  try { fs.writeFileSync(TOKEN_FILE, JSON.stringify(data, null, 2)); } catch (_) {}
}

function loadToken() {
  try {
    if (fs.existsSync(TOKEN_FILE)) {
      const data = JSON.parse(fs.readFileSync(TOKEN_FILE, 'utf-8'));
      const created = new Date(data.created_at);
      const now = new Date();
      if (created.toDateString() === now.toDateString()) return data;
      console.log('Fyers token expired (not from today). Need re-auth.');
    }
  } catch (_) {}
  return null;
}

export function disconnect() {
  isConnected = false;
  accessToken = null;
  fyers = null;
  optionsChainCache.clear();
  underlyingCache.clear();
  try { fs.unlinkSync(TOKEN_FILE); } catch (_) {}
  console.log('Fyers disconnected');
}
