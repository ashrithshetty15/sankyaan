import db from '../db.js';
import { scanStrategies, getNextExpiry } from '../strategyEngine.js';
import {
  isReady,
  getOptionChain,
  getQuotes,
  getCachedOptionsChain,
  getCachedUnderlyingData,
} from '../fyersService.js';

const DEFAULT_UNDERLYINGS = ['NIFTY', 'BANKNIFTY'];

// Fyers symbol mapping
const FYERS_SYMBOLS = {
  NIFTY: 'NSE:NIFTY50-INDEX',
  BANKNIFTY: 'NSE:NIFTYBANK-INDEX',
};

/**
 * GET /api/trade-alerts
 */
export async function getTradeAlerts(req, res) {
  try {
    const { strategy, underlying, risk_level, limit = 20 } = req.query;

    let sql = 'SELECT * FROM trade_alerts WHERE status = $1';
    const params = ['active'];
    let paramIdx = 2;

    if (strategy) {
      sql += ` AND strategy = $${paramIdx++}`;
      params.push(strategy);
    }
    if (underlying) {
      sql += ` AND underlying = $${paramIdx++}`;
      params.push(underlying.toUpperCase());
    }
    if (risk_level) {
      sql += ` AND risk_level = $${paramIdx++}`;
      params.push(risk_level);
    }

    sql += ` ORDER BY probability_score DESC, created_at DESC LIMIT $${paramIdx}`;
    params.push(parseInt(limit));

    const result = await db.query(sql, params);

    const statsResult = await db.query(`
      SELECT
        COUNT(*) FILTER (WHERE status = 'active') AS active_count,
        ROUND(AVG(probability_score) FILTER (WHERE status = 'active')) AS avg_score,
        COUNT(*) FILTER (WHERE status = 'closed' AND pnl > 0) AS wins,
        COUNT(*) FILTER (WHERE status = 'closed') AS total_closed
      FROM trade_alerts
    `);

    const stats = statsResult.rows[0] || {};
    const winRate = stats.total_closed > 0
      ? Math.round((stats.wins / stats.total_closed) * 100)
      : null;

    res.json({
      alerts: result.rows,
      stats: {
        active_count: parseInt(stats.active_count) || 0,
        avg_score: parseInt(stats.avg_score) || 0,
        win_rate: winRate,
        total_closed: parseInt(stats.total_closed) || 0,
      },
      fyers_connected: isReady(),
    });
  } catch (err) {
    console.error('Error fetching trade alerts:', err);
    res.status(500).json({ error: 'Failed to fetch trade alerts' });
  }
}

/**
 * GET /api/trade-alerts/history
 */
export async function getTradeAlertHistory(req, res) {
  try {
    const { limit = 50 } = req.query;

    const result = await db.query(`
      SELECT * FROM trade_alerts
      WHERE status IN ('closed', 'expired')
      ORDER BY expired_at DESC NULLS LAST, created_at DESC
      LIMIT $1
    `, [parseInt(limit)]);

    res.json({ alerts: result.rows });
  } catch (err) {
    console.error('Error fetching alert history:', err);
    res.status(500).json({ error: 'Failed to fetch alert history' });
  }
}

/**
 * POST /api/trade-alerts/scan
 * Trigger a manual scan using Fyers option chain data.
 */
export async function triggerScan(req, res) {
  try {
    if (!isReady()) {
      return res.status(503).json({
        error: 'Fyers not connected. Please authenticate via /api/fyers/auth first.',
      });
    }

    const underlyings = req.body?.underlyings || DEFAULT_UNDERLYINGS;
    const expiry = req.body?.expiry || getNextExpiry('NIFTY');

    // Fetch option chains and quotes from Fyers
    for (const u of underlyings) {
      const fyersSymbol = FYERS_SYMBOLS[u] || `NSE:${u}-INDEX`;
      await getOptionChain(fyersSymbol, 15);
      await getQuotes([fyersSymbol]);
    }

    // Run the scanner on cached data
    const alerts = await scanStrategies(underlyings, expiry);

    if (alerts.length === 0) {
      return res.json({ message: 'No qualifying trades found', alerts: [], inserted: 0 });
    }

    // Mark old active alerts as expired
    await db.query(`
      UPDATE trade_alerts SET status = 'expired', expired_at = NOW()
      WHERE status = 'active' AND underlying = ANY($1)
    `, [underlyings]);

    // Insert new alerts
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

    console.log('Scan complete: ' + inserted + ' trade alerts generated');
    res.json({ message: 'Scan complete', alerts, inserted });
  } catch (err) {
    console.error('Error running trade scan:', err);
    res.status(500).json({ error: 'Scan failed: ' + err.message });
  }
}

/**
 * GET /api/trade-alerts/options-chain/:symbol
 */
export async function getOptionsChainEndpoint(req, res) {
  try {
    const { symbol } = req.params;
    if (!symbol) return res.status(400).json({ error: 'Symbol required' });

    const upper = symbol.toUpperCase();
    const fyersSymbol = FYERS_SYMBOLS[upper] || `NSE:${upper}-INDEX`;

    if (isReady()) {
      // Fetch fresh data
      await getOptionChain(fyersSymbol, 15);
      await getQuotes([fyersSymbol]);
    }

    const chain = getCachedOptionsChain(fyersSymbol);
    const spot = getCachedUnderlyingData(fyersSymbol);

    res.json({
      underlying: upper,
      spot: spot?.ltp || null,
      chain,
      connected: isReady(),
    });
  } catch (err) {
    console.error('Error fetching options chain:', err);
    res.status(500).json({ error: 'Failed to fetch options chain' });
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
