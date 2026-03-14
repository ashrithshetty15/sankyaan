import db from '../db.js';
import { fetchStockQuote } from '../stockDataFetcher.js';
import { getQuotes, getFyersSymbol, isReady as isFyersReady, getOptionChain } from '../fyersService.js';

const UNDERLYING_MAP = {
  NIFTY: 'NSE:NIFTY50-INDEX',
  BANKNIFTY: 'NSE:NIFTYBANK-INDEX',
  MIDCPNIFTY: 'NSE:MIDCPNIFTY-INDEX',
  FINNIFTY: 'NSE:FINNIFTY-INDEX',
};

/** Build a futures symbol from underlying + expiry date string "YYYY-MM-DD" */
function buildFuturesSymbol(underlying, expiryDate) {
  const d = new Date(expiryDate);
  const yy = String(d.getFullYear()).slice(2);
  const months = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
  return `NSE:${underlying}${yy}${months[d.getMonth()]}FUT`;
}

/**
 * Fetch live price for a symbol.
 * Tries Fyers first; falls back to Yahoo Finance for equity symbols.
 */
async function fetchLivePrice(symbol) {
  // If looks like a full Fyers symbol (NSE:...) use getQuotes directly
  const fyersSymbol = symbol.includes(':') ? symbol : getFyersSymbol(symbol);

  if (isFyersReady()) {
    try {
      const quotes = await getQuotes([fyersSymbol]);
      if (Array.isArray(quotes) && quotes[0]?.v?.lp) {
        return quotes[0].v.lp;
      }
    } catch (_) { /* fall through */ }
  }

  // Fallback: Yahoo Finance (equity NSE stocks only)
  if (!symbol.includes(':')) {
    const quote = await fetchStockQuote(`${symbol}.NS`).catch(() => null);
    if (quote?.regularMarketPrice) return quote.regularMarketPrice;
  }

  return null;
}

const VIRTUAL_CAPITAL = 1000000; // ₹10,00,000

function getUserTier(stats) {
  const { total_trades, return_pct, win_rate, sharpe_score } = stats;
  if (total_trades >= 50 && sharpe_score >= 1.0 && return_pct >= 10) return 'Diamond';
  if (total_trades >= 30 && return_pct >= 5 && win_rate >= 50) return 'Gold';
  if (total_trades >= 10 && return_pct > 0) return 'Silver';
  return 'Bronze';
}

function calcRankScore(stats) {
  const returnPct = parseFloat(stats.return_pct) || 0;
  const sharpe = parseFloat(stats.sharpe_score) || 0;
  const winRate = parseFloat(stats.win_rate) || 0;
  const streak = parseFloat(stats.streak_days) || 0;
  // Normalise streak: cap at 30 days = max contribution
  const streakNorm = Math.min(streak / 30, 1) * 10;
  return parseFloat(
    (returnPct * 0.35 + sharpe * 3 * 0.30 + winRate * 0.20 + streakNorm * 0.15).toFixed(4)
  );
}

async function refreshRankings(userId) {
  const tradesRes = await db.query(
    `SELECT pnl, entry_at::date AS trade_date
     FROM paper_trades
     WHERE user_id = $1 AND status = 'closed'
     ORDER BY exit_at`,
    [userId]
  );
  const trades = tradesRes.rows;
  const total_trades = trades.length;

  if (total_trades === 0) {
    await db.query(
      `INSERT INTO paper_rankings (user_id, total_trades, win_rate, total_pnl, return_pct,
         max_drawdown, sharpe_score, streak_days, rank_score, updated_at)
       VALUES ($1, 0, 0, 0, 0, 0, 0, 0, 0, NOW())
       ON CONFLICT (user_id) DO UPDATE SET
         total_trades = 0, win_rate = 0, total_pnl = 0, return_pct = 0,
         max_drawdown = 0, sharpe_score = 0, streak_days = 0, rank_score = 0, updated_at = NOW()`,
      [userId]
    );
    return;
  }

  const wins = trades.filter(t => parseFloat(t.pnl) > 0).length;
  const win_rate = parseFloat(((wins / total_trades) * 100).toFixed(2));
  const total_pnl = trades.reduce((s, t) => s + parseFloat(t.pnl), 0);
  const return_pct = parseFloat(((total_pnl / VIRTUAL_CAPITAL) * 100).toFixed(4));

  // Max drawdown: running peak-to-trough
  let peak = VIRTUAL_CAPITAL;
  let equity = VIRTUAL_CAPITAL;
  let max_drawdown = 0;
  for (const t of trades) {
    equity += parseFloat(t.pnl);
    if (equity > peak) peak = equity;
    const dd = peak > 0 ? ((peak - equity) / peak) * 100 : 0;
    if (dd > max_drawdown) max_drawdown = dd;
  }
  max_drawdown = parseFloat(max_drawdown.toFixed(4));

  // Sharpe score: mean daily PnL / std dev of daily PnL
  const dailyMap = {};
  for (const t of trades) {
    const d = t.trade_date;
    dailyMap[d] = (dailyMap[d] || 0) + parseFloat(t.pnl);
  }
  const dailyPnls = Object.values(dailyMap);
  let sharpe_score = 0;
  if (dailyPnls.length > 1) {
    const mean = dailyPnls.reduce((s, v) => s + v, 0) / dailyPnls.length;
    const variance = dailyPnls.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / dailyPnls.length;
    const std = Math.sqrt(variance);
    sharpe_score = std > 0 ? parseFloat((mean / std).toFixed(4)) : 0;
  }

  // Streak: consecutive days with at least one trade (from today backwards)
  const allDatesRes = await db.query(
    `SELECT DISTINCT entry_at::date AS d FROM paper_trades WHERE user_id = $1 ORDER BY d DESC`,
    [userId]
  );
  const dateset = new Set(allDatesRes.rows.map(r => r.d.toISOString().split('T')[0]));
  let streak_days = 0;
  let checkDate = new Date();
  while (dateset.has(checkDate.toISOString().split('T')[0])) {
    streak_days++;
    checkDate.setDate(checkDate.getDate() - 1);
  }

  const stats = { total_trades, win_rate, total_pnl, return_pct, max_drawdown, sharpe_score, streak_days };
  const rank_score = calcRankScore(stats);

  await db.query(
    `INSERT INTO paper_rankings (user_id, total_trades, win_rate, total_pnl, return_pct,
       max_drawdown, sharpe_score, streak_days, rank_score, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
     ON CONFLICT (user_id) DO UPDATE SET
       total_trades = $2, win_rate = $3, total_pnl = $4, return_pct = $5,
       max_drawdown = $6, sharpe_score = $7, streak_days = $8, rank_score = $9, updated_at = NOW()`,
    [userId, total_trades, win_rate, total_pnl, return_pct, max_drawdown, sharpe_score, streak_days, rank_score]
  );
}

/**
 * GET /api/paper-trading/portfolio
 * User's open positions + available balance.
 */
export async function getPortfolio(req, res) {
  if (!req.user) return res.status(401).json({ error: 'Login required' });
  const userId = req.user.userId;
  try {
    const openTrades = await db.query(
      `SELECT id, symbol, trade_type, quantity, entry_price, entry_at, notes
       FROM paper_trades WHERE user_id = $1 AND status = 'open' ORDER BY entry_at DESC`,
      [userId]
    );
    // Capital used by open trades
    const capitalUsed = openTrades.rows.reduce(
      (s, t) => s + parseFloat(t.entry_price) * parseInt(t.quantity), 0
    );
    // Realised PnL from closed trades
    const pnlRes = await db.query(
      `SELECT COALESCE(SUM(pnl), 0) AS realised FROM paper_trades WHERE user_id = $1 AND status = 'closed'`,
      [userId]
    );
    const realised = parseFloat(pnlRes.rows[0].realised);
    const available_balance = VIRTUAL_CAPITAL + realised - capitalUsed;

    res.json({
      positions: openTrades.rows,
      virtual_capital: VIRTUAL_CAPITAL,
      capital_used: parseFloat(capitalUsed.toFixed(2)),
      realised_pnl: parseFloat(realised.toFixed(2)),
      available_balance: parseFloat(available_balance.toFixed(2)),
    });
  } catch (err) {
    console.error('Paper portfolio error:', err.message);
    res.status(500).json({ error: 'Failed to load portfolio' });
  }
}

/**
 * POST /api/paper-trading/trade
 * Body: { symbol, trade_type, quantity, entry_price?, notes? }
 */
export async function enterTrade(req, res) {
  if (!req.user) return res.status(401).json({ error: 'Login required' });
  const userId = req.user.userId;
  const { symbol, trade_type, quantity, entry_price, notes } = req.body;

  if (!symbol || !trade_type || !quantity) {
    return res.status(400).json({ error: 'symbol, trade_type, and quantity are required' });
  }
  if (!['BUY', 'SELL'].includes(trade_type.toUpperCase())) {
    return res.status(400).json({ error: 'trade_type must be BUY or SELL' });
  }

  try {
    let price = parseFloat(entry_price);
    if (!price) {
      price = await fetchLivePrice(symbol);
      if (!price) return res.status(400).json({ error: 'Could not fetch current price. Please enter entry_price manually.' });
    }

    const cost = price * parseInt(quantity);

    // Check balance for BUY trades
    if (trade_type.toUpperCase() === 'BUY') {
      const pnlRes = await db.query(
        `SELECT COALESCE(SUM(pnl), 0) AS realised FROM paper_trades WHERE user_id = $1 AND status = 'closed'`,
        [userId]
      );
      const openRes = await db.query(
        `SELECT COALESCE(SUM(entry_price * quantity), 0) AS used FROM paper_trades WHERE user_id = $1 AND status = 'open'`,
        [userId]
      );
      const realised = parseFloat(pnlRes.rows[0].realised);
      const used = parseFloat(openRes.rows[0].used);
      const available = VIRTUAL_CAPITAL + realised - used;
      if (cost > available) {
        return res.status(400).json({
          error: `Insufficient balance. Available: ₹${available.toFixed(2)}, Required: ₹${cost.toFixed(2)}`
        });
      }
    }

    const result = await db.query(
      `INSERT INTO paper_trades (user_id, symbol, trade_type, quantity, entry_price, notes)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [userId, symbol.toUpperCase(), trade_type.toUpperCase(), parseInt(quantity), price, notes || null]
    );

    res.json({ trade: result.rows[0], message: 'Trade entered successfully' });
  } catch (err) {
    console.error('Paper trade enter error:', err.message);
    res.status(500).json({ error: 'Failed to enter trade' });
  }
}

/**
 * PUT /api/paper-trading/trade/:id/close
 * Body: { exit_price? }
 */
export async function closeTrade(req, res) {
  if (!req.user) return res.status(401).json({ error: 'Login required' });
  const userId = req.user.userId;
  const { id } = req.params;
  const { exit_price } = req.body;

  try {
    const tradeRes = await db.query(
      `SELECT * FROM paper_trades WHERE id = $1 AND user_id = $2 AND status = 'open'`,
      [id, userId]
    );
    if (tradeRes.rows.length === 0) {
      return res.status(404).json({ error: 'Open trade not found' });
    }
    const trade = tradeRes.rows[0];

    let exitPrice = parseFloat(exit_price);
    if (!exitPrice) {
      exitPrice = await fetchLivePrice(trade.symbol);
      if (!exitPrice) return res.status(400).json({ error: 'Could not fetch exit price. Please provide exit_price manually.' });
    }

    const qty = parseInt(trade.quantity);
    const entryPrice = parseFloat(trade.entry_price);
    // PnL: BUY profits when price rises, SELL profits when price falls
    const pnl = trade.trade_type === 'BUY'
      ? (exitPrice - entryPrice) * qty
      : (entryPrice - exitPrice) * qty;

    const updated = await db.query(
      `UPDATE paper_trades SET exit_price = $1, exit_at = NOW(), status = 'closed', pnl = $2
       WHERE id = $3 RETURNING *`,
      [exitPrice, parseFloat(pnl.toFixed(4)), id]
    );

    // Refresh rankings async (don't block response)
    refreshRankings(userId).catch(e => console.error('Rankings refresh error:', e.message));

    res.json({ trade: updated.rows[0], pnl: parseFloat(pnl.toFixed(2)), message: 'Trade closed' });
  } catch (err) {
    console.error('Paper trade close error:', err.message);
    res.status(500).json({ error: 'Failed to close trade' });
  }
}

/**
 * GET /api/paper-trading/history
 */
export async function getHistory(req, res) {
  if (!req.user) return res.status(401).json({ error: 'Login required' });
  const userId = req.user.userId;
  const limit = parseInt(req.query.limit) || 50;
  try {
    const result = await db.query(
      `SELECT * FROM paper_trades WHERE user_id = $1 AND status = 'closed'
       ORDER BY exit_at DESC LIMIT $2`,
      [userId, limit]
    );
    res.json({ trades: result.rows });
  } catch (err) {
    console.error('Paper history error:', err.message);
    res.status(500).json({ error: 'Failed to load history' });
  }
}

/**
 * GET /api/paper-trading/stats
 * User's own ranking metrics + tier.
 */
export async function getStats(req, res) {
  if (!req.user) return res.status(401).json({ error: 'Login required' });
  const userId = req.user.userId;
  try {
    const result = await db.query(
      `SELECT * FROM paper_rankings WHERE user_id = $1`,
      [userId]
    );
    if (result.rows.length === 0) {
      return res.json({
        total_trades: 0, win_rate: 0, total_pnl: 0, return_pct: 0,
        max_drawdown: 0, sharpe_score: 0, streak_days: 0, rank_score: 0,
        tier: 'Bronze',
      });
    }
    const stats = result.rows[0];
    res.json({ ...stats, tier: getUserTier(stats) });
  } catch (err) {
    console.error('Paper stats error:', err.message);
    res.status(500).json({ error: 'Failed to load stats' });
  }
}

/**
 * GET /api/paper-trading/leaderboard
 * Top 50 users by rank_score (min 10 closed trades).
 */
export async function getLeaderboard(req, res) {
  try {
    const result = await db.query(
      `SELECT r.rank_score, r.total_trades, r.win_rate, r.return_pct,
              r.sharpe_score, r.streak_days, r.total_pnl,
              u.name, u.email
       FROM paper_rankings r
       JOIN users u ON u.id = r.user_id
       WHERE r.total_trades >= 10
       ORDER BY r.rank_score DESC
       LIMIT 50`
    );
    const rows = result.rows.map((row, idx) => ({
      rank: idx + 1,
      name: row.name || row.email?.split('@')[0] || 'Anonymous',
      return_pct: parseFloat(row.return_pct),
      win_rate: parseFloat(row.win_rate),
      total_trades: row.total_trades,
      sharpe_score: parseFloat(row.sharpe_score),
      streak_days: row.streak_days,
      total_pnl: parseFloat(row.total_pnl),
      rank_score: parseFloat(row.rank_score),
      tier: getUserTier(row),
    }));
    res.json({ leaderboard: rows });
  } catch (err) {
    console.error('Leaderboard error:', err.message);
    res.status(500).json({ error: 'Failed to load leaderboard' });
  }
}

/**
 * GET /api/paper-trading/option-chain/:underlying?expiry=YYYY-MM-DD
 * Returns expiry list + strikes (with CE/PE LTPs) for Options & Futures pickers.
 */
export async function getOptionChainForTrading(req, res) {
  const { underlying } = req.params;
  const { expiry } = req.query;
  const fyersSymbol = UNDERLYING_MAP[underlying.toUpperCase()];
  if (!fyersSymbol) return res.status(400).json({ error: `Unsupported underlying: ${underlying}` });

  if (!isFyersReady()) {
    return res.status(503).json({ error: 'Fyers not connected. Please authenticate via /api/fyers/auth.' });
  }

  try {
    const data = await getOptionChain(fyersSymbol, 15);
    if (data?.error) return res.status(503).json({ error: data.error });

    const underlyingLtp = data.underlyingData?.ltp || 0;
    const optData = data.optionsChain || (Array.isArray(data) ? data : []);

    // Collect all expiries
    const expirySet = new Set(optData.map(o => o.expiry).filter(Boolean));
    const expiries = Array.from(expirySet).sort();

    // Filter by requested expiry (or use nearest)
    const targetExpiry = expiry && expiries.includes(expiry) ? expiry : expiries[0];
    const filtered = targetExpiry
      ? optData.filter(o => o.expiry === targetExpiry)
      : optData;

    // Group by strike
    const strikeMap = new Map();
    for (const opt of filtered) {
      const strike = opt.strike_price;
      if (!strike) continue;
      if (!strikeMap.has(strike)) strikeMap.set(strike, { strike, ce: null, pe: null });
      const row = strikeMap.get(strike);
      const side = opt.option_type === 'CE' ? 'ce' : 'pe';
      row[side] = { ltp: opt.ltp || 0, symbol: opt.symbol || '', oi: opt.oi || 0 };
    }

    const strikes = Array.from(strikeMap.values()).sort((a, b) => a.strike - b.strike);
    // ATM = strike closest to underlying LTP
    const atm = underlyingLtp
      ? strikes.reduce((prev, cur) =>
          Math.abs(cur.strike - underlyingLtp) < Math.abs(prev.strike - underlyingLtp) ? cur : prev
        , strikes[0] || {})?.strike
      : null;

    res.json({ expiries, strikes, underlyingLtp, targetExpiry, atm });
  } catch (err) {
    console.error('Option chain endpoint error:', err.message);
    res.status(500).json({ error: err.message });
  }
}
