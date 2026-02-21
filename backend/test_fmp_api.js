import axios from 'axios';

const FMP_API_KEY = 'Mz2bTzf6J06kxAQZxfGiRJVgvMzIgN9R';
const FMP_BASE = 'https://financialmodelingprep.com';

async function testFMPAPI() {
  console.log('🧪 Testing FMP API...\n');

  const testSymbol = 'RELIANCE.NS';

  try {
    // Test 1: Profile (using stable endpoint for legacy API key)
    console.log(`1️⃣  Testing Profile API for ${testSymbol}...`);
    const profileRes = await axios.get(`${FMP_BASE}/stable/profile`, {
      params: { symbol: testSymbol, apikey: FMP_API_KEY },
      timeout: 10000
    });

    if (profileRes.data && profileRes.data.length > 0) {
      const profile = profileRes.data[0];
      console.log(`   ✅ Company: ${profile.companyName}`);
      console.log(`   ✅ Sector: ${profile.sector}`);
      console.log(`   ✅ Price: ₹${profile.price}`);
      console.log(`   ✅ Market Cap: ₹${(profile.mktCap / 1e7).toFixed(0)} Cr\n`);
    } else {
      console.log('   ❌ No profile data returned\n');
      return;
    }

    // Test 2: Income Statement
    console.log(`2️⃣  Testing Income Statement API...`);
    const incomeRes = await axios.get(`${FMP_BASE}/stable/income-statement`, {
      params: { symbol: testSymbol, limit: 1, apikey: FMP_API_KEY },
      timeout: 10000
    });

    if (incomeRes.data && incomeRes.data.length > 0) {
      const income = incomeRes.data[0];
      console.log(`   ✅ Period: ${income.date}`);
      console.log(`   ✅ Revenue: ₹${(income.revenue / 1e7).toFixed(0)} Cr`);
      console.log(`   ✅ Net Income: ₹${(income.netIncome / 1e7).toFixed(0)} Cr\n`);
    } else {
      console.log('   ❌ No income statement data\n');
    }

    // Test 3: Balance Sheet
    console.log(`3️⃣  Testing Balance Sheet API...`);
    const balanceRes = await axios.get(`${FMP_BASE}/stable/balance-sheet-statement`, {
      params: { symbol: testSymbol, limit: 1, apikey: FMP_API_KEY },
      timeout: 10000
    });

    if (balanceRes.data && balanceRes.data.length > 0) {
      const balance = balanceRes.data[0];
      console.log(`   ✅ Total Assets: ₹${(balance.totalAssets / 1e7).toFixed(0)} Cr`);
      console.log(`   ✅ Total Debt: ₹${(balance.totalDebt / 1e7).toFixed(0)} Cr\n`);
    } else {
      console.log('   ❌ No balance sheet data\n');
    }

    // Test 4: Cash Flow
    console.log(`4️⃣  Testing Cash Flow API...`);
    const cashFlowRes = await axios.get(`${FMP_BASE}/stable/cashflow-statement`, {
      params: { symbol: testSymbol, limit: 1, apikey: FMP_API_KEY },
      timeout: 10000
    });

    if (cashFlowRes.data && cashFlowRes.data.length > 0) {
      const cf = cashFlowRes.data[0];
      console.log(`   ✅ Operating CF: ₹${(cf.operatingCashFlow / 1e7).toFixed(0)} Cr`);
      console.log(`   ✅ Free CF: ₹${(cf.freeCashFlow / 1e7).toFixed(0)} Cr\n`);
    } else {
      console.log('   ❌ No cash flow data\n');
    }

    // Test 5: Key Metrics
    console.log(`5️⃣  Testing Key Metrics API...`);
    const metricsRes = await axios.get(`${FMP_BASE}/stable/key-metrics`, {
      params: { symbol: testSymbol, limit: 1, apikey: FMP_API_KEY },
      timeout: 10000
    });

    if (metricsRes.data && metricsRes.data.length > 0) {
      const metrics = metricsRes.data[0];
      console.log(`   ✅ ROE: ${metrics.roe}%`);
      console.log(`   ✅ P/E: ${metrics.peRatio}`);
      console.log(`   ✅ Debt/Equity: ${metrics.debtToEquity}\n`);
    } else {
      console.log('   ❌ No key metrics data\n');
    }

    console.log('═'.repeat(60));
    console.log('✅ FMP API is working! All 5 endpoints responding.');
    console.log('═'.repeat(60));
    console.log('\n✨ Ready to run: node fetch_fmp_fundamentals.js\n');

  } catch (error) {
    console.log('═'.repeat(60));
    console.log('❌ FMP API Error');
    console.log('═'.repeat(60));

    if (error.response) {
      console.log(`Status: ${error.response.status}`);
      console.log(`Message: ${JSON.stringify(error.response.data, null, 2)}`);

      if (error.response.status === 401) {
        console.log('\n⚠️  API Key might be invalid or expired');
      } else if (error.response.status === 429) {
        console.log('\n⚠️  Rate limit exceeded');
      } else if (error.response.status === 403) {
        console.log('\n⚠️  Subscription level might not have access to this endpoint');
      }
    } else {
      console.log(`Error: ${error.message}`);
    }

    console.log('\n');
    process.exit(1);
  }
}

testFMPAPI();
