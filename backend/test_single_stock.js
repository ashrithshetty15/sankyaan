import YahooFinance from 'yahoo-finance2';
import db from './src/db.js';

const yahooFinance = new YahooFinance();

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
      const finResult = await yahooFinance.fundamentalsTimeSeries(symbol, {
        period1: startDate,
        period2: endDate,
        type: 'annual',
        module: 'financials'
      });
      incomeData = finResult?.[0] || null;
    } catch (e) {}

    try {
      const balResult = await yahooFinance.fundamentalsTimeSeries(symbol, {
        period1: startDate,
        period2: endDate,
        type: 'annual',
        module: 'balance-sheet'
      });
      balanceData = balResult?.[0] || null;
    } catch (e) {}

    try {
      const cfResult = await yahooFinance.fundamentalsTimeSeries(symbol, {
        period1: startDate,
        period2: endDate,
        type: 'annual',
        module: 'cash-flow'
      });
      cashflowData = cfResult?.[0] || null;
    } catch (e) {}

    // Extract fundamental metrics
    const fundamentals = {
      period_type: 'A',
      fiscal_year: new Date().getFullYear(),
      fiscal_quarter: null,
      revenue: incomeData?.totalRevenue || financialData.totalRevenue?.raw || null,
      operating_income: incomeData?.operatingIncome || null,
      net_income: incomeData?.netIncome || null,
      ebitda: incomeData?.EBITDA || financialData.ebitda?.raw || null,
      eps: keyStats.trailingEps?.raw || null,
      total_assets: balanceData?.totalAssets || null,
      total_liabilities: balanceData?.totalLiabilitiesNetMinorityInterest || null,
      shareholders_equity: balanceData?.stockholdersEquity || null,
      current_assets: balanceData?.currentAssets || null,
      current_liabilities: balanceData?.currentLiabilities || null,
      operating_cash_flow: cashflowData?.operatingCashFlow || null,
      investing_cash_flow: cashflowData?.investingCashFlow || null,
      financing_cash_flow: cashflowData?.financingCashFlow || null,
      free_cash_flow: cashflowData?.freeCashFlow || financialData.freeCashflow?.raw || null,
      pe_ratio: summaryDetail.trailingPE?.raw || keyStats.trailingPE?.raw || null,
      pb_ratio: keyStats.priceToBook?.raw || null,
      roe: financialData.returnOnEquity?.raw ? financialData.returnOnEquity.raw * 100 : null,
      roa: financialData.returnOnAssets?.raw ? financialData.returnOnAssets.raw * 100 : null,
      debt_to_equity: null,
      current_ratio: null,
      quick_ratio: null,
      gross_margin: null,
      operating_margin: null,
      net_margin: null
    };

    // Calculations
    if (fundamentals.total_liabilities && fundamentals.shareholders_equity && fundamentals.shareholders_equity > 0) {
      const longTermDebt = balanceData?.longTermDebt || 0;
      fundamentals.debt_to_equity = longTermDebt / fundamentals.shareholders_equity;
    }

    if (fundamentals.current_assets && fundamentals.current_liabilities && fundamentals.current_liabilities > 0) {
      fundamentals.current_ratio = fundamentals.current_assets / fundamentals.current_liabilities;
    }

    if (fundamentals.current_assets && fundamentals.current_liabilities && fundamentals.current_liabilities > 0) {
      const inventory = balanceData?.inventory || 0;
      fundamentals.quick_ratio = (fundamentals.current_assets - inventory) / fundamentals.current_liabilities;
    }

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
    console.error(`Error:`, error.message);
    throw error;
  }
}

async function test() {
  try {
    const symbol = 'RELIANCE.NS';
    const fundamentals = await fetchRealFundamentals(symbol);

    console.log('\n✅ Successfully fetched fundamentals:\n');
    console.log(`   Revenue: ₹${(fundamentals.revenue / 10000000).toFixed(2)} Cr`);
    console.log(`   Net Income: ₹${(fundamentals.net_income / 10000000).toFixed(2)} Cr`);
    console.log(`   EBITDA: ₹${(fundamentals.ebitda / 10000000).toFixed(2)} Cr`);
    console.log(`   P/E Ratio: ${fundamentals.pe_ratio?.toFixed(2) || 'N/A'}`);
    console.log(`   ROE: ${fundamentals.roe?.toFixed(2) || 'N/A'}%`);
    console.log(`   Net Margin: ${fundamentals.net_margin?.toFixed(2) || 'N/A'}%`);
    console.log(`   Debt/Equity: ${fundamentals.debt_to_equity?.toFixed(2) || 'N/A'}`);
    console.log(`   Current Ratio: ${fundamentals.current_ratio?.toFixed(2) || 'N/A'}`);

    await db.end();
    process.exit(0);
  } catch (error) {
    console.error('Test failed:', error);
    await db.end();
    process.exit(1);
  }
}

test();
