import { fyersModel } from 'fyers-api-v3';
import { generateSync } from 'otplib';
import crypto from 'crypto';
import axios from 'axios';
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
    const step1 = await axios.post('https://api-t2.fyers.in/vagator/v2/send_login_otp_v2', {
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
      saveToken({ access_token: accessToken, created_at: new Date().toISOString() });
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
export function disconnect() {
  isConnected = false;
  accessToken = null;
  fyers = null;
  optionsChainCache.clear();
  underlyingCache.clear();
  try { fs.unlinkSync(TOKEN_FILE); } catch (_) {}
  console.log('Fyers disconnected');
}
