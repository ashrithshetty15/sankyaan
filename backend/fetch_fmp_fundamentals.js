import axios from 'axios';
import db from './src/db.js';
import fs from 'fs';

// ============================================================================
// CONFIG
// ============================================================================

const FMP_API_KEY = 'Mz2bTzf6J06kxAQZxfGiRJVgvMzIgN9R';
const FMP_BASE_URL = 'https://financialmodelingprep.com';
const CALLS_PER_MINUTE = 280; // 300 limit, 20 buffer
const DELAY_BETWEEN_CALLS = Math.ceil(60000 / CALLS_PER_MINUTE); // ~214ms
const MAX_RETRIES = 3;
const PROGRESS_FILE = 'fmp_fetch_progress.json';

// ============================================================================
// RATE LIMITER
// ============================================================================

class RateLimiter {
  constructor(callsPerMinute) {
    this.callsPerMinute = callsPerMinute;
    this.timestamps = [];
    this.totalCalls = 0;
  }

  async wait() {
    const now = Date.now();

    // Remove timestamps older than 60 seconds
    this.timestamps = this.timestamps.filter(ts => ts > now - 60000);

    // If at limit, wait until oldest timestamp expires
    if (this.timestamps.length >= this.callsPerMinute) {
      const oldestTimestamp = this.timestamps[0];
      const waitTime = 60000 - (now - oldestTimestamp) + 100;

      if (waitTime > 0) {
        console.log(`  ⏳ Rate limit: waiting ${(waitTime / 1000).toFixed(1)}s...`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
    }

    this.timestamps.push(Date.now());
    this.totalCalls++;
  }

  getRate() {
    if (this.timestamps.length < 2) return 0;
    const now = Date.now();
    const recentCalls = this.timestamps.filter(ts => ts > now - 60000);
    return recentCalls.length;
  }
}

// ============================================================================
// FMP API CLIENT
// ============================================================================

class FMPClient {
  constructor(apiKey, rateLimiter) {
    this.apiKey = apiKey;
    this.rateLimiter = rateLimiter;
    this.errors = 0;
  }

  async _get(path, params = {}) {
    await this.rateLimiter.wait();

    try {
      const url = `${FMP_BASE_URL}${path}`;
      const response = await axios.get(url, {
        params: { ...params, apikey: this.apiKey },
        timeout: 15000
      });

      if (response.status === 429) {
        console.log('  ⚠️  429 Rate Limited - waiting 30s...');
        await new Promise(resolve => setTimeout(resolve, 30000));
        return this._get(path, params);
      }

      if (response.status !== 200) {
        this.errors++;
        return null;
      }

      const data = response.data;

      // Check for error messages
      if (data && typeof data === 'object' && data['Error Message']) {
        return null;
      }

      return data;
    } catch (error) {
      this.errors++;
      if (error.code === 'ECONNABORTED') {
        console.log('  ⚠️  Request timeout');
      }
      return null;
    }
  }

  async getProfile(symbol) {
    const data = await this._get('/stable/profile', { symbol });
    if (data && Array.isArray(data) && data.length > 0) {
      return data[0];
    }
    return null;
  }

  async getIncomeStatement(symbol, limit = 5) {
    return await this._get('/stable/income-statement', { symbol, limit });
  }

  async getBalanceSheet(symbol, limit = 5) {
    return await this._get('/stable/balance-sheet-statement', { symbol, limit });
  }

  async getCashFlow(symbol, limit = 5) {
    return await this._get('/stable/cashflow-statement', { symbol, limit });
  }

  async getKeyMetrics(symbol, limit = 5) {
    return await this._get('/stable/key-metrics', { symbol, limit });
  }
}

// ============================================================================
// HELPERS
// ============================================================================

function safeFloat(val) {
  if (val === null || val === undefined) return null;
  const num = parseFloat(val);
  return isNaN(num) || !isFinite(num) ? null : num;
}

function safeInt(val) {
  if (val === null || val === undefined) return null;
  const num = parseInt(val);
  return isNaN(num) ? null : num;
}

function parseDate(val) {
  if (!val) return null;
  try {
    const date = new Date(val);
    return isNaN(date.getTime()) ? null : date.toISOString().split('T')[0];
  } catch {
    return null;
  }
}

// ============================================================================
// DATABASE FUNCTIONS
// ============================================================================

async function upsert(table, conflictCols, record) {
  const cols = Object.keys(record);
  const values = Object.values(record);
  const placeholders = cols.map((_, i) => `$${i + 1}`).join(', ');
  const colNames = cols.join(', ');

  const skipCols = conflictCols.split(',').map(c => c.trim());
  const updateSet = cols
    .filter(col => !skipCols.includes(col))
    .map(col => `${col} = EXCLUDED.${col}`)
    .join(', ');

  const query = `
    INSERT INTO ${table} (${colNames})
    VALUES (${placeholders})
    ON CONFLICT (${conflictCols}) DO UPDATE SET
      ${updateSet},
      loaded_at = CURRENT_TIMESTAMP
  `;

  try {
    await db.query(query, values);
    return true;
  } catch (error) {
    console.error(`  ❌ Error upserting to ${table}:`, error.message);
    return false;
  }
}

async function updateProgress(symbol, status) {
  await db.query(`
    INSERT INTO fetch_progress (fmp_symbol, last_fetched, status)
    VALUES ($1, CURRENT_DATE, $2)
    ON CONFLICT (fmp_symbol) DO UPDATE SET
      last_fetched = CURRENT_DATE,
      status = EXCLUDED.status
  `, [symbol, status]);
}

// ============================================================================
// FETCH SINGLE STOCK
// ============================================================================

async function fetchStock(fmpClient, nseSymbol) {
  const symbol = `${nseSymbol}.NS`;
  const today = new Date().toISOString().split('T')[0];
  const result = { symbol, counts: {}, status: 'ok' };

  // 1. Profile
  const profile = await fmpClient.getProfile(symbol);
  if (!profile) {
    await updateProgress(symbol, 'no_profile');
    result.status = 'no_profile';
    return result;
  }

  const marketCap = safeInt(profile.marketCap);
  const range = profile.range || '';
  const [low52, high52] = range.includes('-')
    ? range.split('-').map(s => safeFloat(s.trim()))
    : [null, null];

  const quoteRecord = {
    fmp_symbol: symbol,
    nse_symbol: nseSymbol,
    company_name: profile.companyName || null,
    industry: profile.industry || null,
    sector: profile.sector || null,
    isin: profile.isin || null,
    currency: profile.currency || null,
    country: profile.country || null,
    current_price: safeFloat(profile.price),
    market_cap: marketCap,
    market_cap_cr: marketCap ? Math.round(marketCap / 1e7 * 100) / 100 : null,
    week_52_high: high52,
    week_52_low: low52,
    pe_ratio: safeFloat(profile.pe),
    pb_ratio: null, // Will be filled from key metrics
    eps: safeFloat(profile.eps),
    dividend_yield: safeFloat(profile.lastDiv),
    beta: safeFloat(profile.beta),
    fetch_date: today
  };

  // 2. Income Statement
  const incomeData = await fmpClient.getIncomeStatement(symbol) || [];
  const incomeRecords = [];

  for (const item of incomeData) {
    const periodEnd = parseDate(item.date);
    if (!periodEnd) continue;

    incomeRecords.push({
      fmp_symbol: symbol,
      period_end: periodEnd,
      period_type: item.period || 'FY',
      currency: item.reportedCurrency || null,
      revenue: safeFloat(item.revenue),
      cost_of_revenue: safeFloat(item.costOfRevenue),
      gross_profit: safeFloat(item.grossProfit),
      gross_profit_ratio: safeFloat(item.grossProfitRatio),
      operating_expenses: safeFloat(item.operatingExpenses),
      operating_income: safeFloat(item.operatingIncome),
      operating_income_ratio: safeFloat(item.operatingIncomeRatio),
      interest_expense: safeFloat(item.interestExpense),
      ebitda: safeFloat(item.ebitda),
      ebitda_ratio: safeFloat(item.ebitdaratio),
      income_before_tax: safeFloat(item.incomeBeforeTax),
      income_tax: safeFloat(item.incomeTaxExpense),
      net_income: safeFloat(item.netIncome),
      net_income_ratio: safeFloat(item.netIncomeRatio),
      eps: safeFloat(item.eps),
      eps_diluted: safeFloat(item.epsDiluted),
      shares_outstanding: safeInt(item.weightedAverageShsOutDil),
      fetch_date: today
    });
  }

  // 3. Balance Sheet
  const balanceData = await fmpClient.getBalanceSheet(symbol) || [];
  const balanceRecords = [];

  for (const item of balanceData) {
    const periodEnd = parseDate(item.date);
    if (!periodEnd) continue;

    balanceRecords.push({
      fmp_symbol: symbol,
      period_end: periodEnd,
      currency: item.reportedCurrency || null,
      total_assets: safeFloat(item.totalAssets),
      total_current_assets: safeFloat(item.totalCurrentAssets),
      cash_and_equivalents: safeFloat(item.cashAndCashEquivalents),
      inventory: safeFloat(item.inventory),
      property_plant_equipment: safeFloat(item.propertyPlantEquipmentNet),
      goodwill: safeFloat(item.goodwill),
      total_liabilities: safeFloat(item.totalLiabilities),
      total_current_liabilities: safeFloat(item.totalCurrentLiabilities),
      long_term_debt: safeFloat(item.longTermDebt),
      short_term_debt: safeFloat(item.shortTermDebt),
      total_debt: safeFloat(item.totalDebt),
      total_stockholders_equity: safeFloat(item.totalStockholdersEquity),
      retained_earnings: safeFloat(item.retainedEarnings),
      shares_outstanding: safeInt(item.commonStock),
      fetch_date: today
    });
  }

  // 4. Cash Flow
  const cashFlowData = await fmpClient.getCashFlow(symbol) || [];
  const cashFlowRecords = [];

  for (const item of cashFlowData) {
    const periodEnd = parseDate(item.date);
    if (!periodEnd) continue;

    cashFlowRecords.push({
      fmp_symbol: symbol,
      period_end: periodEnd,
      currency: item.reportedCurrency || null,
      net_income: safeFloat(item.netIncome),
      depreciation: safeFloat(item.depreciationAndAmortization),
      operating_cash_flow: safeFloat(item.operatingCashFlow),
      capital_expenditure: safeFloat(item.capitalExpenditure),
      investing_cash_flow: safeFloat(item.netCashUsedForInvestingActivites),
      dividends_paid: safeFloat(item.dividendsPaid),
      financing_cash_flow: safeFloat(item.netCashUsedProvidedByFinancingActivities),
      free_cash_flow: safeFloat(item.freeCashFlow),
      fetch_date: today
    });
  }

  // 5. Key Metrics
  const metricsData = await fmpClient.getKeyMetrics(symbol) || [];
  const metricsRecords = [];

  for (const item of metricsData) {
    const periodEnd = parseDate(item.date);
    if (!periodEnd) continue;

    metricsRecords.push({
      fmp_symbol: symbol,
      period_end: periodEnd,
      revenue_per_share: safeFloat(item.revenuePerShare),
      book_value_per_share: safeFloat(item.bookValuePerShare),
      free_cf_per_share: safeFloat(item.freeCashFlowPerShare),
      pe_ratio: safeFloat(item.peRatio),
      pb_ratio: safeFloat(item.pbRatio),
      ev_to_ebitda: safeFloat(item.enterpriseValueOverEBITDA),
      debt_to_equity: safeFloat(item.debtToEquity),
      current_ratio: safeFloat(item.currentRatio),
      roe: safeFloat(item.returnOnEquity),
      roa: safeFloat(item.returnOnTangibleAssets),
      roce: safeFloat(item.returnOnCapitalEmployed),
      dividend_yield: safeFloat(item.dividendYield),
      payout_ratio: safeFloat(item.payoutRatio),
      fetch_date: today
    });
  }

  // Enrich quote with latest P/B from metrics
  if (metricsData.length > 0) {
    quoteRecord.pb_ratio = safeFloat(metricsData[0].pbRatio);
  }

  // Save to database
  await upsert('stock_quotes', 'fmp_symbol, fetch_date', quoteRecord);

  let savedCounts = {
    income: 0,
    balance: 0,
    cashflow: 0,
    metrics: 0
  };

  for (const record of incomeRecords) {
    if (await upsert('stock_financials', 'fmp_symbol, period_end, period_type', record)) {
      savedCounts.income++;
    }
  }

  for (const record of balanceRecords) {
    if (await upsert('stock_balance_sheet', 'fmp_symbol, period_end', record)) {
      savedCounts.balance++;
    }
  }

  for (const record of cashFlowRecords) {
    if (await upsert('stock_cash_flow', 'fmp_symbol, period_end', record)) {
      savedCounts.cashflow++;
    }
  }

  for (const record of metricsRecords) {
    if (await upsert('stock_key_metrics', 'fmp_symbol, period_end', record)) {
      savedCounts.metrics++;
    }
  }

  const status = savedCounts.income > 0 || savedCounts.balance > 0
    ? 'done'
    : 'no_financials';

  await updateProgress(symbol, status);

  result.counts = savedCounts;
  result.status = status;
  return result;
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║  FMP Fundamentals Fetcher (Node.js)                            ║');
  console.log('║  Rate: 280 calls/min | 5 calls/stock                          ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  // Get symbols to fetch
  const symbolsResult = await db.query(`
    SELECT DISTINCT nse_symbol
    FROM nse_symbol_map
    ORDER BY nse_symbol
  `);

  const allSymbols = symbolsResult.rows.map(r => r.nse_symbol);
  console.log(`📊 Found ${allSymbols.length} symbols to fetch\n`);

  if (allSymbols.length === 0) {
    console.log('❌ No symbols found in nse_symbol_map table');
    console.log('   Run the Python script first to populate symbols\n');
    process.exit(1);
  }

  // Load progress
  let progress = { processed: [], failed: [] };
  if (fs.existsSync(PROGRESS_FILE)) {
    try {
      progress = JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf8'));
      console.log(`📂 Resuming: ${progress.processed.length} already processed\n`);
    } catch (error) {
      console.log('⚠️  Could not load progress file, starting fresh\n');
    }
  }

  const toProcess = allSymbols.filter(s => !progress.processed.includes(s));
  console.log(`🎯 Processing ${toProcess.length} stocks\n`);

  const totalCalls = toProcess.length * 5;
  const estimatedMinutes = Math.ceil(totalCalls / CALLS_PER_MINUTE);
  console.log(`⏱️  Estimated time: ~${estimatedMinutes} minutes\n`);
  console.log('─'.repeat(70) + '\n');

  // Initialize
  const rateLimiter = new RateLimiter(CALLS_PER_MINUTE);
  const fmpClient = new FMPClient(FMP_API_KEY, rateLimiter);

  let successful = 0;
  let noFinancials = 0;
  let noProfile = 0;
  let errors = 0;

  const startTime = Date.now();

  // Process stocks
  for (let i = 0; i < toProcess.length; i++) {
    const symbol = toProcess[i];
    const overall = progress.processed.length + i + 1;

    const elapsed = (Date.now() - startTime) / 1000;
    const rate = rateLimiter.getRate();
    const remaining = toProcess.length - i;
    const eta = Math.ceil(remaining * 5 / CALLS_PER_MINUTE);

    console.log(`[${overall}/${allSymbols.length}] ${symbol}.NS (${rate} calls/min, ETA: ${eta}min)`);

    try {
      const result = await fetchStock(fmpClient, symbol);
      const counts = result.counts;

      if (result.status === 'done') {
        console.log(`  ✅ Income:${counts.income} BS:${counts.balance} CF:${counts.cashflow} KM:${counts.metrics}`);
        successful++;
      } else if (result.status === 'no_financials') {
        console.log(`  ⚠️  No financials available`);
        noFinancials++;
      } else if (result.status === 'no_profile') {
        console.log(`  ⚠️  No profile found`);
        noProfile++;
      }

      progress.processed.push(symbol);

    } catch (error) {
      console.log(`  ❌ Error: ${error.message}`);
      errors++;
      progress.failed.push({ symbol, error: error.message });
    }

    // Save progress every 10 stocks
    if ((i + 1) % 10 === 0) {
      fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progress, null, 2));
    }

    console.log('');
  }

  // Final summary
  const totalElapsed = (Date.now() - startTime) / 60000;

  console.log('═'.repeat(70));
  console.log(`  COMPLETE (${totalElapsed.toFixed(1)} minutes, ${rateLimiter.totalCalls} API calls)`);
  console.log('═'.repeat(70));
  console.log(`  ✅ Successful:      ${successful}`);
  console.log(`  ⚠️  No financials:   ${noFinancials}`);
  console.log(`  ⚠️  No profile:      ${noProfile}`);
  console.log(`  ❌ Errors:          ${errors}`);
  console.log('═'.repeat(70));
  console.log(`\n✨ Data saved to PostgreSQL!`);
  console.log(`\n📊 Next step: node calculate_quality_scores_fmp.js\n`);

  // Cleanup
  if (fs.existsSync(PROGRESS_FILE)) {
    fs.unlinkSync(PROGRESS_FILE);
  }

  process.exit(0);
}

main().catch(error => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});
