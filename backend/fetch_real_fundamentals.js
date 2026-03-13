import YahooFinance from 'yahoo-finance2';
import db from './src/db.js';

const yahooFinance = new YahooFinance();

/**
 * Fetch real fundamental data from Yahoo Finance using fundamentalsTimeSeries
 * This replaces the deprecated quoteSummary financial statement modules
 */
async function fetchRealFundamentals(symbol) {
  try {
    console.log(`📊 Fetching fundamentals for ${symbol}...`);

    // Fetch current financial data for ratios
    const quoteSummary = await yahooFinance.quoteSummary(symbol, {
      modules: ['summaryDetail', 'financialData', 'defaultKeyStatistics']
    });

    const financialData = quoteSummary.financialData || {};
    const keyStats = quoteSummary.defaultKeyStatistics || {};
    const summaryDetail = quoteSummary.summaryDetail || {};

    // Fetch fundamentals time series data (NEW API)
    const endDate = new Date();
    const startDate = new Date();
    startDate.setFullYear(endDate.getFullYear() - 2); // Get last 2 years

    let incomeData = null;
    let balanceData = null;
    let cashflowData = null;

    try {
      // Fetch financials (income statement)
      const finResult = await yahooFinance.fundamentalsTimeSeries(symbol, {
        period1: startDate,
        period2: endDate,
        type: 'annual',
        module: 'financials'
      });
      incomeData = finResult?.[0] || null;
    } catch (e) {
      // Data not available
    }

    try {
      // Fetch balance sheet
      const balResult = await yahooFinance.fundamentalsTimeSeries(symbol, {
        period1: startDate,
        period2: endDate,
        type: 'annual',
        module: 'balance-sheet'
      });
      balanceData = balResult?.[0] || null;
    } catch (e) {
      // Data not available
    }

    try {
      // Fetch cash flow
      const cfResult = await yahooFinance.fundamentalsTimeSeries(symbol, {
        period1: startDate,
        period2: endDate,
        type: 'annual',
        module: 'cash-flow'
      });
      cashflowData = cfResult?.[0] || null;
    } catch (e) {
      // Data not available
    }

    // Extract fundamental metrics
    const fundamentals = {
      period_type: 'A', // Annual
      fiscal_year: new Date().getFullYear(),
      fiscal_quarter: null,

      // Income Statement (from financials module)
      revenue: incomeData?.totalRevenue || financialData.totalRevenue?.raw || null,
      operating_income: incomeData?.operatingIncome || null,
      net_income: incomeData?.netIncome || null,
      ebitda: incomeData?.EBITDA || financialData.ebitda?.raw || null,
      eps: keyStats.trailingEps?.raw || null,

      // Balance Sheet
      total_assets: balanceData?.totalAssets || null,
      total_liabilities: balanceData?.totalLiabilitiesNetMinorityInterest || null,
      shareholders_equity: balanceData?.stockholdersEquity || null,
      current_assets: balanceData?.currentAssets || null,
      current_liabilities: balanceData?.currentLiabilities || null,

      // Cash Flow
      operating_cash_flow: cashflowData?.operatingCashFlow || null,
      investing_cash_flow: cashflowData?.investingCashFlow || null,
      financing_cash_flow: cashflowData?.financingCashFlow || null,
      free_cash_flow: cashflowData?.freeCashFlow || financialData.freeCashflow?.raw || null,

      // Ratios from financialData (these are still available)
      pe_ratio: summaryDetail.trailingPE?.raw || keyStats.trailingPE?.raw || null,
      pb_ratio: keyStats.priceToBook?.raw || null,
      roe: financialData.returnOnEquity?.raw ? financialData.returnOnEquity.raw * 100 : null,
      roa: financialData.returnOnAssets?.raw ? financialData.returnOnAssets.raw * 100 : null,

      // Calculate additional ratios
      debt_to_equity: null,
      current_ratio: null,
      quick_ratio: null,
      gross_margin: null,
      operating_margin: null,
      net_margin: null
    };

    // Calculate debt_to_equity if we have the data
    if (fundamentals.total_liabilities && fundamentals.shareholders_equity && fundamentals.shareholders_equity > 0) {
      const longTermDebt = balanceData?.longTermDebt || 0;
      fundamentals.debt_to_equity = longTermDebt / fundamentals.shareholders_equity;
    }

    // Calculate current_ratio
    if (fundamentals.current_assets && fundamentals.current_liabilities && fundamentals.current_liabilities > 0) {
      fundamentals.current_ratio = fundamentals.current_assets / fundamentals.current_liabilities;
    }

    // Calculate quick_ratio
    if (fundamentals.current_assets && fundamentals.current_liabilities && fundamentals.current_liabilities > 0) {
      const inventory = balanceData?.inventory || 0;
      fundamentals.quick_ratio = (fundamentals.current_assets - inventory) / fundamentals.current_liabilities;
    }

    // Calculate margins (if revenue exists)
    if (fundamentals.revenue && fundamentals.revenue > 0) {
      const grossProfit = incomeData?.grossProfit || null;
      if (grossProfit !== null) {
        fundamentals.gross_margin = (grossProfit / fundamentals.revenue) * 100;
      }

      if (fundamentals.operating_income !== null) {
        fundamentals.operating_margin = (fundamentals.operating_income / fundamentals.revenue) * 100;
      }

      if (fundamentals.net_income !== null) {
        fundamentals.net_margin = (fundamentals.net_income / fundamentals.revenue) * 100;
      }
    }

    // Use financialData margins if available (these are still reliable)
    if (financialData.profitMargins?.raw !== null && financialData.profitMargins?.raw !== undefined) {
      fundamentals.net_margin = financialData.profitMargins.raw * 100;
    }
    if (financialData.operatingMargins?.raw !== null && financialData.operatingMargins?.raw !== undefined) {
      fundamentals.operating_margin = financialData.operatingMargins.raw * 100;
    }
    if (financialData.grossMargins?.raw !== null && financialData.grossMargins?.raw !== undefined) {
      fundamentals.gross_margin = financialData.grossMargins.raw * 100;
    }

    return fundamentals;
  } catch (error) {
    console.error(`   ✗ Error fetching fundamentals for ${symbol}:`, error.message);
    throw error;
  }
}

/**
 * Store fundamentals in database
 */
async function storeFundamentals(stockId, fundamentals) {
  await db.query(`
    INSERT INTO stock_fundamentals (
      stock_id, period_type, fiscal_year, fiscal_quarter,
      revenue, operating_income, net_income, ebitda, eps,
      total_assets, total_liabilities, shareholders_equity,
      current_assets, current_liabilities,
      operating_cash_flow, investing_cash_flow, financing_cash_flow, free_cash_flow,
      pe_ratio, pb_ratio, roe, roa, debt_to_equity, current_ratio, quick_ratio,
      gross_margin, operating_margin, net_margin
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14,
      $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28
    )
    ON CONFLICT (stock_id, period_type, fiscal_year, fiscal_quarter)
    DO UPDATE SET
      revenue = $5, operating_income = $6, net_income = $7, ebitda = $8, eps = $9,
      total_assets = $10, total_liabilities = $11, shareholders_equity = $12,
      current_assets = $13, current_liabilities = $14,
      operating_cash_flow = $15, investing_cash_flow = $16, financing_cash_flow = $17, free_cash_flow = $18,
      pe_ratio = $19, pb_ratio = $20, roe = $21, roa = $22, debt_to_equity = $23,
      current_ratio = $24, quick_ratio = $25, gross_margin = $26, operating_margin = $27, net_margin = $28
  `, [
    stockId, fundamentals.period_type, fundamentals.fiscal_year, fundamentals.fiscal_quarter,
    fundamentals.revenue, fundamentals.operating_income, fundamentals.net_income, fundamentals.ebitda, fundamentals.eps,
    fundamentals.total_assets, fundamentals.total_liabilities, fundamentals.shareholders_equity,
    fundamentals.current_assets, fundamentals.current_liabilities,
    fundamentals.operating_cash_flow, fundamentals.investing_cash_flow, fundamentals.financing_cash_flow, fundamentals.free_cash_flow,
    fundamentals.pe_ratio, fundamentals.pb_ratio, fundamentals.roe, fundamentals.roa, fundamentals.debt_to_equity,
    fundamentals.current_ratio, fundamentals.quick_ratio, fundamentals.gross_margin, fundamentals.operating_margin, fundamentals.net_margin
  ]);
}

/**
 * Main function to fetch real fundamentals for all stocks
 */
async function fetchAllRealFundamentals() {
  try {
    console.log('📊 Fetching REAL fundamental data from Yahoo Finance...\n');

    // Get all stocks
    const result = await db.query(`
      SELECT id, symbol, company_name
      FROM stocks
      ORDER BY symbol
    `);

    if (result.rows.length === 0) {
      console.log('⚠️  No stocks found. Please populate stocks first.');
      return;
    }

    console.log(`Found ${result.rows.length} stocks.\n`);

    let successCount = 0;
    let errorCount = 0;

    for (const stock of result.rows) {
      try {
        console.log(`\n📈 Processing ${stock.symbol} (${stock.company_name})...`);

        // Fetch real fundamentals from Yahoo Finance
        const fundamentals = await fetchRealFundamentals(stock.symbol);

        // Store in database
        await storeFundamentals(stock.id, fundamentals);

        // Log key metrics
        console.log(`   ✓ Revenue: ${fundamentals.revenue ? `₹${(fundamentals.revenue / 10000000).toFixed(2)} Cr` : 'N/A'}`);
        console.log(`   ✓ Net Income: ${fundamentals.net_income ? `₹${(fundamentals.net_income / 10000000).toFixed(2)} Cr` : 'N/A'}`);
        console.log(`   ✓ P/E Ratio: ${fundamentals.pe_ratio?.toFixed(2) || 'N/A'}`);
        console.log(`   ✓ ROE: ${fundamentals.roe?.toFixed(2) || 'N/A'}%`);
        console.log(`   ✓ Net Margin: ${fundamentals.net_margin?.toFixed(2) || 'N/A'}%`);
        console.log(`   ✓ Debt/Equity: ${fundamentals.debt_to_equity?.toFixed(2) || 'N/A'}`);

        successCount++;

        // Rate limiting - wait 1 second between requests
        await new Promise(resolve => setTimeout(resolve, 1000));

      } catch (error) {
        console.error(`   ✗ Error: ${error.message}`);
        errorCount++;

        // Continue to next stock even if one fails
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    console.log('\n✨ Real fundamental data fetch complete!');
    console.log(`   Success: ${successCount} stocks`);
    console.log(`   Errors: ${errorCount} stocks`);
    console.log('\n📝 Next steps:');
    console.log('   Run: node calculate_quality_scores.js');
    console.log('   This will calculate quality scores based on REAL data!\n');

    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

// Run
fetchAllRealFundamentals();
