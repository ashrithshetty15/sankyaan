import { isReady, getOptionChain, getQuotes } from './fyersService.js';
import { scanStrategies, getNextExpiry } from './strategyEngine.js';
import { sendTradeAlert, sendScanSummary, isBotReady } from './telegramBot.js';
import db from './db.js';

const SCAN_INTERVAL = 15 * 60 * 1000; // 15 minutes
const DEFAULT_UNDERLYINGS = ['NIFTY', 'BANKNIFTY'];

const FYERS_SYMBOLS = {
  NIFTY: 'NSE:NIFTY50-INDEX',
  BANKNIFTY: 'NSE:NIFTYBANK-INDEX',
};

let scanTimer = null;

function isMarketHours() {
  const now = new Date();
  const ist = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
  const day = ist.getDay();
  if (day === 0 || day === 6) return false;
  const minutes = ist.getHours() * 60 + ist.getMinutes();
  return minutes >= 555 && minutes <= 930; // 9:15 AM to 3:30 PM
}

async function runScan() {
  if (!isReady()) {
    console.log('Auto-scan skipped: Fyers not connected');
    return;
  }

  if (!isMarketHours()) {
    console.log('Auto-scan skipped: market closed');
    return;
  }

  try {
    const expiry = getNextExpiry('NIFTY');
    console.log('Auto-scan starting for ' + DEFAULT_UNDERLYINGS.join(', ') + ' expiry ' + expiry);

    // Fetch fresh data
    for (const u of DEFAULT_UNDERLYINGS) {
      const fyersSymbol = FYERS_SYMBOLS[u] || `NSE:${u}-INDEX`;
      await getOptionChain(fyersSymbol, 15);
      await getQuotes([fyersSymbol]);
    }

    // Run scanner
    const alerts = await scanStrategies(DEFAULT_UNDERLYINGS, expiry);

    if (alerts.length === 0) {
      console.log('Auto-scan: no qualifying trades');
      if (isBotReady()) await sendScanSummary(0, DEFAULT_UNDERLYINGS);
      return;
    }

    // Expire old alerts
    await db.query(
      `UPDATE trade_alerts SET status = 'expired', expired_at = NOW() WHERE status = 'active' AND underlying = ANY($1)`,
      [DEFAULT_UNDERLYINGS]
    );

    // Insert new alerts
    let inserted = 0;
    for (const alert of alerts) {
      const expiryDate = parseExpiryToDate(alert.expiry);
      await db.query(`
        INSERT INTO trade_alerts
          (strategy, underlying, expiry, legs, max_profit, max_loss, breakeven,
           probability_score, risk_level, iv_rank, entry_price)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      `, [
        alert.strategy,
        alert.underlying,
        expiryDate,
        JSON.stringify(alert.legs),
        alert.max_profit,
        alert.max_loss,
        JSON.stringify(alert.breakeven),
        alert.probability_score,
        alert.risk_level,
        alert.iv_rank,
        alert.entry_price,
      ]);
      inserted++;

      // Send to Telegram
      if (isBotReady()) await sendTradeAlert(alert);
    }

    console.log('Auto-scan complete: ' + inserted + ' alerts inserted');
    if (isBotReady()) await sendScanSummary(inserted, DEFAULT_UNDERLYINGS);
  } catch (err) {
    console.error('Auto-scan error:', err.message);
  }
}

export function startAutoScanner() {
  if (scanTimer) return;

  console.log('Auto-scanner started (every 15 min during market hours)');

  // Run first scan after a short delay
  setTimeout(runScan, 10000);

  // Schedule recurring scans
  scanTimer = setInterval(runScan, SCAN_INTERVAL);
}

export function stopAutoScanner() {
  if (scanTimer) {
    clearInterval(scanTimer);
    scanTimer = null;
    console.log('Auto-scanner stopped');
  }
}

function parseExpiryToDate(expiryStr) {
  if (!expiryStr) return new Date();
  const months = {
    JAN: 0, FEB: 1, MAR: 2, APR: 3, MAY: 4, JUN: 5,
    JUL: 6, AUG: 7, SEP: 8, OCT: 9, NOV: 10, DEC: 11,
  };
  const match = expiryStr.match(/^(\d{2})([A-Z]{3})(\d{4})$/);
  if (!match) return new Date();
  const [, dd, mmm, yyyy] = match;
  return new Date(parseInt(yyyy), months[mmm] || 0, parseInt(dd));
}
