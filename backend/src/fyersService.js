import { fyersModel } from 'fyers-api-v3';
import { generateSync } from 'otplib';
import crypto from 'crypto';
import axios from 'axios';
import db from './db.js';

let fyers = null;
let accessToken = null;
let isConnected = false;

// In-memory options chain cache
const optionsChainCache = new Map();
const underlyingCache = new Map();

/**
 * Initialize Fyers API client.
 */
export async function initFyers() {
  const appId = process.env.FYERS_APP_ID;
  const secretKey = process.env.FYERS_SECRET_KEY;

  if (!appId || !secretKey) {
    console.warn('Fyers credentials not set. Set FYERS_APP_ID and FYERS_SECRET_KEY in .env');
    return false;
  }

  fyers = new fyersModel();
  fyers.setAppId(appId);
  fyers.setRedirectUrl(process.env.FYERS_REDIRECT_URL || 'http://localhost:5000/api/fyers/callback');

  // Try loading saved token from DB (survives redeploys)
  const saved = await loadToken();
  if (saved && saved.access_token) {
    accessToken = saved.access_token;
    fyers.setAccessToken(accessToken);
    isConnected = true;
    console.log('Fyers: loaded saved access token from DB');
    return true;
  }

  console.log('Fyers: no access token. User needs to authenticate via /api/fyers/auth');
  return false;
}

/**
 * Get Fyers OAuth2 login URL.
 */
export function getAuthUrl() {
  if (!fyers) {
    // Sync init without token load (fyers client setup only)
    const appId = process.env.FYERS_APP_ID;
    if (appId) {
      fyers = new fyersModel();
      fyers.setAppId(appId);
      fyers.setRedirectUrl(process.env.FYERS_REDIRECT_URL || 'http://localhost:5000/api/fyers/callback');
    }
  }
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
    await saveToken({ access_token: accessToken, created_at: new Date().toISOString() });
    console.log('Fyers: authenticated successfully');
    return true;
  } else {
    throw new Error(response.message || 'Fyers auth failed');
  }
}

/**
 * Detect if a Fyers API response indicates an authentication/token error.
 */
function isAuthError(result) {
  if (!result) return false;
  const msg = (result.message || '').toLowerCase();
  const code = result.code;
  return (
    code === -16 || code === 403 || code === 401 ||
    msg.includes('invalid token') ||
    msg.includes('token expired') ||
    msg.includes('unauthorized') ||
    msg.includes('access denied') ||
    msg.includes('session expired')
  );
}

/**
 * Mark Fyers as disconnected so the next scan triggers re-auth.
 */
export function markDisconnected() {
  isConnected = false;
  console.log('Fyers: marked as disconnected, will re-auth on next scan');
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
    if (isAuthError(result)) {
      markDisconnected();
      return { error: 'auth_error: ' + (result.message || 'Token expired') };
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
    if (isAuthError(result)) {
      markDisconnected();
      return { error: 'auth_error: ' + (result.message || 'Token expired') };
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

// -- Token persistence (DB-backed so it survives Railway redeploys) --
async function saveToken(data) {
  try {
    await db.query(`
      INSERT INTO app_config (key, value, updated_at)
      VALUES ('fyers_token', $1, NOW())
      ON CONFLICT (key) DO UPDATE SET value = $1, updated_at = NOW()
    `, [JSON.stringify(data)]);
  } catch (err) {
    console.error('Fyers: failed to save token to DB:', err.message);
  }
}

async function loadToken() {
  try {
    const result = await db.query(`SELECT value FROM app_config WHERE key = 'fyers_token'`);
    if (result.rows.length === 0) return null;
    const data = JSON.parse(result.rows[0].value);
    const created = new Date(data.created_at);
    const now = new Date();
    if (created.toDateString() === now.toDateString()) return data;
    console.log('Fyers token expired (not from today). Need re-auth.');
  } catch (err) {
    console.error('Fyers: failed to load token from DB:', err.message);
  }
  return null;
}


/**
 * Headless auto-authentication using TOTP + PIN.
 * No browser needed — authenticates programmatically.
 */
export async function autoAuthenticate() {
  const fyId = process.env.FYERS_USER_ID;
  const pin = process.env.FYERS_PIN;
  const totpSecret = process.env.FYERS_TOTP_SECRET;
  const appId = process.env.FYERS_APP_ID;
  const secretKey = process.env.FYERS_SECRET_KEY;
  const redirectUrl = process.env.FYERS_REDIRECT_URL || 'http://localhost:5000/api/fyers/callback';

  if (!fyId || !pin || !totpSecret || !appId || !secretKey) {
    console.warn('Fyers auto-auth: missing credentials (FYERS_USER_ID, FYERS_PIN, FYERS_TOTP_SECRET)');
    return false;
  }

  try {
    if (!fyers) {
      fyers = new fyersModel();
      fyers.setAppId(appId);
      fyers.setRedirectUrl(redirectUrl);
    }

    console.log('Fyers auto-auth: starting headless authentication...');

    // Step 1: Send login OTP request
    const step1 = await axios.post('https://api-t2.fyers.in/vagator/v2/send_login_otp', {
      fy_id: fyId,
      app_id: '2',
    });
    if (!step1.data?.request_key) throw new Error('Step 1 failed: ' + JSON.stringify(step1.data));
    let requestKey = step1.data.request_key;

    // Step 2: Verify TOTP
    const totp = generateSync({ secret: totpSecret });
    const step2 = await axios.post('https://api-t2.fyers.in/vagator/v2/verify_otp', {
      request_key: requestKey,
      otp: totp,
    });
    if (!step2.data?.request_key) throw new Error('Step 2 failed: ' + JSON.stringify(step2.data));
    requestKey = step2.data.request_key;

    // Step 3: Verify PIN
    const pinHash = crypto.createHash('sha256').update(pin).digest('hex');
    const step3 = await axios.post('https://api-t2.fyers.in/vagator/v2/verify_pin_v2', {
      request_key: requestKey,
      identity_type: 'pin',
      identifier: pinHash,
      recaptcha_token: '',
    });
    if (!step3.data?.data?.access_token) throw new Error('Step 3 failed: ' + JSON.stringify(step3.data));
    const bearerToken = step3.data.data.access_token;

    // Step 4: Get auth code via token endpoint
    const appIdBase = appId.split('-')[0];
    const step4 = await axios.post('https://api-t1.fyers.in/api/v3/token', {
      fyers_id: fyId,
      app_id: appIdBase,
      redirect_uri: redirectUrl,
      appType: '100',
      code_challenge: '',
      state: 'auto_auth',
      scope: '',
      nonce: '',
      response_type: 'code',
      create_cookie: true,
    }, {
      headers: { Authorization: 'Bearer ' + bearerToken },
    });

    const authUrl = step4.data?.Url;
    if (!authUrl) throw new Error('Step 4 failed: ' + JSON.stringify(step4.data));

    // Extract auth_code from URL
    const url = new URL(authUrl);
    const authCode = url.searchParams.get('auth_code');
    if (!authCode) throw new Error('No auth_code in redirect URL: ' + authUrl);

    // Step 5: Exchange auth code for access token
    const response = await fyers.generate_access_token({
      client_id: appId,
      secret_key: secretKey,
      auth_code: authCode,
    });

    if (response.s === 'ok' && response.access_token) {
      accessToken = response.access_token;
      fyers.setAccessToken(accessToken);
      isConnected = true;
      await saveToken({ access_token: accessToken, created_at: new Date().toISOString() });
      console.log('Fyers auto-auth: authenticated successfully');
      return true;
    }

    throw new Error('Token exchange failed: ' + (response.message || JSON.stringify(response)));
  } catch (err) {
    console.error('Fyers auto-auth failed:', err.message);
    return false;
  }
}


/**
 * Map NSE symbol to Fyers format for quotes and option chains.
 * Indices: NIFTY -> NSE:NIFTY50-INDEX, BANKNIFTY -> NSE:NIFTYBANK-INDEX
 * Stocks: RELIANCE -> NSE:RELIANCE-EQ
 */
export function getFyersSymbol(nseSymbol) {
  const INDEX_MAP = {
    NIFTY: 'NSE:NIFTY50-INDEX',
    BANKNIFTY: 'NSE:NIFTYBANK-INDEX',
  };
  return INDEX_MAP[nseSymbol] || 'NSE:' + nseSymbol + '-EQ';
}
/**
 * Fetch actual SPAN margin from Fyers for a multi-leg options strategy.
 * @param {Array} legs - Array of leg objects with symbol, action fields
 * @param {number} lotSize - Number of units per lot
 * @returns {number|null} - Required margin in INR, or null if unavailable
 */
export async function getSpanMargin(legs, lotSize) {
  if (!accessToken || !isConnected) return null;
  const appId = process.env.FYERS_APP_ID;
  if (!appId) return null;

  const legsWithSymbol = legs.filter(l => l.symbol);
  if (legsWithSymbol.length === 0) return null;

  try {
    const data = legsWithSymbol.map(leg => ({
      symbol: leg.symbol,
      qty: lotSize,
      side: leg.action === 'SELL' ? -1 : 1,
      type: 2,
      productType: 'MARGIN',
    }));

    const res = await axios.post(
      'https://api-t1.fyers.in/api/v3/span_margin',
      { data },
      { headers: { Authorization: `${appId}:${accessToken}` } }
    );

    if (res.data?.s === 'ok' && res.data?.data) {
      return res.data.data.final_margin ?? res.data.data.initial_margin ?? null;
    }
  } catch (err) {
    console.error('SPAN margin error:', err.response?.data || err.message);
  }
  return null;
}

export function disconnect() {
  isConnected = false;
  accessToken = null;
  fyers = null;
  optionsChainCache.clear();
  underlyingCache.clear();
  console.log('Fyers disconnected');
}
