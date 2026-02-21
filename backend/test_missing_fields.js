import axios from 'axios';

const FMP_API_KEY = 'Mz2bTzf6J06kxAQZxfGiRJVgvMzIgN9R';
const FMP_BASE = 'https://financialmodelingprep.com';
const symbol = 'RELIANCE.NS';

async function testMissingFields() {
  try {
    console.log('🧪 Testing FMP API for Missing Fields\n');

    // 1. Key Metrics
    console.log('=== Key Metrics Response ===');
    const kmRes = await axios.get(`${FMP_BASE}/stable/key-metrics`, {
      params: { symbol, limit: 1, apikey: FMP_API_KEY }
    });
    const km = kmRes.data[0];
    console.log('pbRatio:', km.pbRatio);
    console.log('debtToEquity:', km.debtToEquity);
    console.log('currentRatio:', km.currentRatio);
    console.log('dividendYield:', km.dividendYield);
    console.log('returnOnEquity:', km.returnOnEquity);
    console.log('returnOnCapitalEmployed:', km.returnOnCapitalEmployed);

    // 2. Income Statement
    console.log('\n=== Income Statement Response ===');
    const incomeRes = await axios.get(`${FMP_BASE}/stable/income-statement`, {
      params: { symbol, limit: 1, apikey: FMP_API_KEY }
    });
    const income = incomeRes.data[0];
    console.log('revenue:', income.revenue);
    console.log('netIncome:', income.netIncome);
    console.log('netIncomeRatio:', income.netIncomeRatio);
    console.log('operatingIncome:', income.operatingIncome);
    console.log('operatingIncomeRatio:', income.operatingIncomeRatio);
    console.log('ebitda:', income.ebitda);
    console.log('ebitdaratio:', income.ebitdaratio);
    console.log('grossProfit:', income.grossProfit);
    console.log('grossProfitRatio:', income.grossProfitRatio);

    // 3. Cash Flow
    console.log('\n=== Cash Flow Response ===');
    const cfRes = await axios.get(`${FMP_BASE}/stable/cashflow-statement`, {
      params: { symbol, limit: 1, apikey: FMP_API_KEY }
    });
    if (cfRes.data && cfRes.data.length > 0) {
      const cf = cfRes.data[0];
      console.log('operatingCashFlow:', cf.operatingCashFlow);
      console.log('freeCashFlow:', cf.freeCashFlow);
      console.log('capitalExpenditure:', cf.capitalExpenditure);
    } else {
      console.log('⚠️  No cash flow data available');
    }

    process.exit(0);
  } catch (error) {
    console.error('Error:', error.message);
    if (error.response) {
      console.log('Status:', error.response.status);
      console.log('Data:', error.response.data);
    }
    process.exit(1);
  }
}

testMissingFields();
