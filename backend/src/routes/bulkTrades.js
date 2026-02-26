import axios from 'axios';
import * as cheerio from 'cheerio';
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

/**
 * Parse a date string like "25 Feb 2026" into a Date object.
 */
function parseTrendlyneDate(dateStr) {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return null;
  return d.toISOString().split('T')[0]; // YYYY-MM-DD
}

/**
 * Fetch bulk/block deals from Trendlyne and store mutual fund trades in DB.
 * Trendlyne aggregates NSE + BSE data with clean HTML tables.
 */
async function fetchFromTrendlyne() {
  const url = 'https://trendlyne.com/portfolio/bulk-block-deals/latest/all/';
  const res = await axios.get(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html',
    },
    timeout: 30000,
  });

  const $ = cheerio.load(res.data);
  const trades = [];

  $('table tbody tr').each((_, row) => {
    const cells = $(row).find('td');
    if (cells.length < 8) return;

    const stockRaw = $(cells[0]).text().trim();
    // Extract just the company name (first line before extra info)
    const stockName = stockRaw.split('\n')[0].trim();
    const clientName = $(cells[1]).text().trim();
    const exchange = $(cells[2]).text().trim();
    const dealType = $(cells[3]).text().trim().toLowerCase(); // bulk or block
    const action = $(cells[4]).text().trim(); // Purchase or Sale
    const dateStr = $(cells[5]).text().trim();
    const priceStr = $(cells[6]).text().trim().replace(/,/g, '');
    const qtyStr = $(cells[7]).text().trim().replace(/,/g, '');
    const pctStr = cells.length > 9 ? $(cells[9]).text().trim().replace('%', '') : null;

    const tradeDate = parseTrendlyneDate(dateStr);
    if (!tradeDate || !stockName || !clientName) return;

    const transactionType = action.toLowerCase().includes('purchase') ? 'Buy' : 'Sell';

    trades.push({
      trade_date: tradeDate,
      symbol: stockName,
      company_name: stockName,
      client_name: clientName,
      exchange: exchange || 'NSE',
      deal_type: dealType || 'bulk',
      transaction_type: transactionType,
      quantity: parseInt(qtyStr) || 0,
      price: parseFloat(priceStr) || 0,
      pct_traded: parseFloat(pctStr) || null,
    });
  });

  return trades;
}

/**
 * POST /api/bulk-trades/refresh
 * Fetches latest bulk/block deals and stores MF-related trades in DB.
 */
export async function refreshBulkTrades(req, res) {
  try {
    console.log('Fetching bulk/block deals from Trendlyne...');

    const allTrades = await fetchFromTrendlyne();
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
