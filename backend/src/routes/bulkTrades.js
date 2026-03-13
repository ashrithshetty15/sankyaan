import axios from 'axios';
import db from '../db.js';

/**
 * Known mutual fund house keywords used to filter bulk/block deals.
 */
const MF_KEYWORDS = [
  'mutual fund', 'asset management', 'amc',
  'hdfc mf', 'icici prudential', 'sbi mutual', 'sbi mf',
  'axis mutual', 'kotak mutual', 'kotak mahindra',
  'nippon india', 'nippon life', 'aditya birla', 'birla sun life',
  'dsp mutual', 'dsp investment', 'franklin templeton',
  'tata mutual', 'tata mf', 'tata asset',
  'uti mutual', 'uti asset', 'mirae asset',
  'motilal oswal', 'invesco', 'edelweiss',
  'pgim india', 'canara robeco', 'hsbc mutual',
  'bandhan mutual', 'baroda bnp', 'quant mutual',
  'groww mutual', 'ppfas mutual', 'parag parikh',
  'sundaram mutual', 'mahindra manulife', 'itc mutual',
  '360 one', 'whiteoak', 'nj mutual', 'lic mutual',
  'union mutual', 'quantum mutual', 'samco mutual',
  'zerodha', 'trustmf', 'bajaj finserv',
  'jm financial', 'shriram mutual', 'helios mutual',
];

function isMutualFundClient(clientName) {
  const lower = clientName.toLowerCase();
  return MF_KEYWORDS.some(kw => lower.includes(kw));
}

const NSE_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'en-US,en;q=0.9',
  'Referer': 'https://www.nseindia.com/',
};

/**
 * Get NSE session cookies (required to hit NSE JSON APIs).
 */
async function getNSECookies() {
  const resp = await axios.get('https://www.nseindia.com', {
    headers: NSE_HEADERS,
    timeout: 15000,
    maxRedirects: 5,
  });
  return (resp.headers['set-cookie'] || []).map(c => c.split(';')[0]).join('; ');
}

/**
 * Parse NSE date string "DD-MM-YYYY" → "YYYY-MM-DD".
 */
function parseNSEDate(dateStr) {
  if (!dateStr) return null;
  // NSE returns dates as "13-Mar-2026" or "13-03-2026"
  const d = new Date(dateStr);
  if (!isNaN(d.getTime())) return d.toISOString().split('T')[0];
  return null;
}

/**
 * Fetch bulk and block deals from NSE's official JSON API.
 */
async function fetchFromNSE() {
  const cookies = await getNSECookies();
  const headers = { ...NSE_HEADERS, Cookie: cookies };

  const [bulkResp, blockResp] = await Promise.all([
    axios.get('https://www.nseindia.com/api/bulk-deal', { headers, timeout: 20000 }).catch(() => null),
    axios.get('https://www.nseindia.com/api/block-deal', { headers, timeout: 20000 }).catch(() => null),
  ]);

  const trades = [];

  function parseDeals(resp, dealType) {
    if (!resp?.data) return;
    const rows = Array.isArray(resp.data) ? resp.data : (resp.data.data || []);
    for (const row of rows) {
      const symbol = row.symbol || row.SYMBOL || '';
      const clientName = row.clientName || row.CLIENT_NAME || row.client_name || '';
      const buySell = row.buyOrSell || row.BUY_SELL || row.buy_sell || '';
      const qty = parseInt(row.quantity || row.QUANTITY || 0);
      const price = parseFloat(row.tradePrice || row.TRADE_PRICE || row.price || 0);
      const dateStr = row.date || row.DATE || row.tradeDate || row.TRADE_DATE || '';
      const exchange = row.exchange || 'NSE';

      const tradeDate = parseNSEDate(dateStr);
      if (!tradeDate || !symbol || !clientName) continue;

      const transactionType = buySell.toUpperCase().includes('B') ? 'Buy' : 'Sell';

      trades.push({
        trade_date: tradeDate,
        symbol,
        company_name: row.companyName || row.COMPANY_NAME || symbol,
        client_name: clientName,
        exchange,
        deal_type: dealType,
        transaction_type: transactionType,
        quantity: qty,
        price,
        pct_traded: parseFloat(row.pctDaysTurnover || row.PCT_TURNOVER || 0) || null,
      });
    }
  }

  parseDeals(bulkResp, 'bulk');
  parseDeals(blockResp, 'block');

  return trades;
}

/**
 * POST /api/bulk-trades/refresh
 * Fetches latest bulk/block deals and stores MF-related trades in DB.
 */
export async function refreshBulkTrades(req, res) {
  try {
    console.log('Fetching bulk/block deals from NSE...');

    const allTrades = await fetchFromNSE();
    console.log(`  Found ${allTrades.length} total deals`);

    // Filter for mutual fund clients only
    const mfTrades = allTrades.filter(t => isMutualFundClient(t.client_name));
    console.log(`  ${mfTrades.length} mutual fund deals`);

    let inserted = 0;
    for (const t of mfTrades) {
      try {
        await db.query(
          `INSERT INTO bulk_trades (trade_date, symbol, company_name, client_name, exchange, deal_type, transaction_type, quantity, price, pct_traded)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
           ON CONFLICT (trade_date, symbol, client_name, deal_type, transaction_type, exchange)
           DO UPDATE SET quantity = EXCLUDED.quantity, price = EXCLUDED.price, pct_traded = EXCLUDED.pct_traded`,
          [t.trade_date, t.symbol, t.company_name, t.client_name, t.exchange, t.deal_type, t.transaction_type, t.quantity, t.price, t.pct_traded]
        );
        inserted++;
      } catch (err) {
        // Skip duplicates or errors for individual rows
      }
    }

    console.log(`  Upserted ${inserted} MF trades`);
    res.json({
      success: true,
      totalDeals: allTrades.length,
      mfDeals: mfTrades.length,
      upserted: inserted,
    });
  } catch (error) {
    console.error('Error refreshing bulk trades:', error.message);
    res.status(500).json({ error: 'Failed to refresh bulk trades' });
  }
}

/**
 * GET /api/bulk-trades
 * Returns mutual fund bulk/block trades with optional filters.
 * Query params: days (default 5), transactionType, search
 */
export async function getBulkTrades(req, res) {
  try {
    const { days = 5, transactionType, search } = req.query;

    const wheres = [];
    const params = [];
    let idx = 1;

    // Date range filter
    wheres.push(`trade_date >= CURRENT_DATE - $${idx}::integer`);
    params.push(parseInt(days));
    idx++;

    // Transaction type filter
    if (transactionType && transactionType !== 'all') {
      wheres.push(`transaction_type = $${idx}`);
      params.push(transactionType);
      idx++;
    }

    // Search filter (stock or client name)
    if (search) {
      wheres.push(`(symbol ILIKE $${idx} OR client_name ILIKE $${idx})`);
      params.push(`%${search}%`);
      idx++;
    }

    const sql = `
      SELECT trade_date, symbol, company_name, client_name, exchange,
             deal_type, transaction_type, quantity, price, pct_traded,
             (quantity * price) AS amount
      FROM bulk_trades
      WHERE ${wheres.join(' AND ')}
      ORDER BY trade_date DESC, amount DESC
    `;

    const result = await db.query(sql, params);

    // Build summary stats
    const trades = result.rows.map(r => ({
      tradeDate: r.trade_date,
      symbol: r.symbol,
      companyName: r.company_name,
      clientName: r.client_name,
      exchange: r.exchange,
      dealType: r.deal_type,
      transactionType: r.transaction_type,
      quantity: parseInt(r.quantity),
      price: parseFloat(r.price),
      amount: parseFloat(r.amount) || 0,
      pctTraded: r.pct_traded ? parseFloat(r.pct_traded) : null,
    }));

    const buys = trades.filter(t => t.transactionType === 'Buy');
    const sells = trades.filter(t => t.transactionType === 'Sell');

    res.json({
      trades,
      totalCount: trades.length,
      summary: {
        totalBuys: buys.length,
        totalSells: sells.length,
        buyValue: buys.reduce((sum, t) => sum + t.amount, 0),
        sellValue: sells.reduce((sum, t) => sum + t.amount, 0),
      },
    });
  } catch (error) {
    console.error('Error fetching bulk trades:', error);
    res.status(500).json({ error: 'Failed to fetch bulk trades' });
  }
}
