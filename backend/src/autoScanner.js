import { isReady, getOptionChain, getQuotes, autoAuthenticate, getFyersSymbol, markDisconnected } from './fyersService.js';
import { scanStrategies, getNextExpiry } from './strategyEngine.js';
import { getAllUpcomingEvents } from './eventCalendar.js';
import db from './db.js';

const SCAN_INTERVAL = 15 * 60 * 1000; // 15 minutes
const DEFAULT_UNDERLYINGS = ['NIFTY', 'BANKNIFTY'];

let scanTimer = null;
let lastAuthDate = null; // Track last successful auth date to force daily re-auth

function isMarketHours() {
  const now = new Date();
  const ist = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
  const day = ist.getDay();
  if (day === 0 || day === 6) return false;
  const minutes = ist.getHours() * 60 + ist.getMinutes();
  return minutes >= 555 && minutes <= 930; // 9:15 AM to 3:30 PM
}

async function runScan() {
  // Force re-auth at the start of each trading day (Fyers tokens are valid only for that day)
  const todayStr = new Date().toDateString();
  if (isReady() && lastAuthDate && lastAuthDate !== todayStr) {
    console.log('Auto-scan: new trading day detected, forcing re-auth...');
    markDisconnected();
  }

  if (!isReady()) {
    console.log('Auto-scan: Fyers not connected, attempting auto-auth...');
    const authed = await autoAuthenticate();
    if (!authed) {
      console.log('Auto-scan skipped: auto-auth failed');
      return;
    }
    lastAuthDate = todayStr;
  }

  if (!isMarketHours()) {
    console.log('Auto-scan skipped: market closed');
    return;
  }

  try {
    const expiry = getNextExpiry('NIFTY');
    console.log('Auto-scan starting for ' + DEFAULT_UNDERLYINGS.join(', ') + ' expiry ' + expiry);

    // Fetch upcoming events for IV Crush scanning
    let events = [];
    try {
      events = await getAllUpcomingEvents(5);
      if (events.length > 0) console.log('Auto-scan: ' + events.length + ' upcoming events found');
    } catch (err) {
      console.warn('Auto-scan: failed to fetch events:', err.message);
    }

    // Build event map (symbol -> event info)
    const eventMap = new Map();
    for (const ev of events) {
      if (!eventMap.has(ev.symbol)) eventMap.set(ev.symbol, ev);
    }

    // Collect all underlyings to scan (defaults + stocks with events)
    const allUnderlyings = [...DEFAULT_UNDERLYINGS];
    for (const ev of events) {
      if (!allUnderlyings.includes(ev.symbol)) allUnderlyings.push(ev.symbol);
    }

    // Fetch fresh data for all underlyings
    for (const u of allUnderlyings) {
      const fyersSymbol = getFyersSymbol(u);
      const chainResult = await getOptionChain(fyersSymbol, 15);
      // If auth error, stop scan and let next scan trigger re-auth
      if (chainResult?.error?.startsWith('auth_error')) {
        console.log('Auto-scan: token expired mid-scan, will re-auth on next scan');
        return;
      }
      await getQuotes([fyersSymbol]);
    }

    // Run scanner with event map
    const alerts = await scanStrategies(allUnderlyings, expiry, eventMap);

    if (alerts.length === 0) {
      console.log('Auto-scan: no qualifying trades');
      return;
    }

    // Expire current active alerts before inserting fresh ones
    await db.query(
      `UPDATE trade_alerts SET status = 'expired', expired_at = NOW()
       WHERE status = 'active' AND underlying = ANY($1)`,
      [allUnderlyings]
    );

    // Insert all alerts
    let inserted = 0;
    for (const alert of alerts) {
      const expiryDate = parseExpiryToDate(alert.expiry);

      await db.query(`
        INSERT INTO trade_alerts
          (strategy, underlying, expiry, legs, max_profit, max_loss, breakeven,
           probability_score, risk_level, iv_rank, entry_price,
           event_type, event_date, event_name, days_to_event, exit_rules)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
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
        alert.event_type || null,
        alert.event_date || null,
        alert.event_name || null,
        alert.days_to_event || null,
        alert.exit_rules ? JSON.stringify(alert.exit_rules) : null,
      ]);
      inserted++;
    }

    console.log(`Auto-scan complete: ${inserted} alerts refreshed`);
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
