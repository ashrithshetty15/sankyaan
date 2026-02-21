import axios from 'axios';

async function testAPIResponse() {
  try {
    console.log('🧪 Testing /api/search endpoint\n');

    const API_URL = 'http://localhost:5000/api';
    const fundName = '360 ONE ELSS Tax Saver Nifty 50 Index Fund';

    console.log(`Fetching: ${API_URL}/search?ticker=${encodeURIComponent(fundName)}\n`);

    const response = await axios.get(`${API_URL}/search`, {
      params: { ticker: fundName }
    });

    const data = response.data;

    console.log('📊 Response Structure:');
    console.log(`   ticker: ${data.ticker}`);
    console.log(`   companyName: ${data.companyName}`);
    console.log(`   fundHouse: ${data.fundHouse}`);
    console.log(`   Total holdings: ${data.funds?.length || 0}\n`);

    console.log('📋 First 10 Holdings with Symbol Check:\n');
    console.log('Instrument Name'.padEnd(40), 'Symbol'.padEnd(20), 'Has Symbol?');
    console.log('-'.repeat(80));

    const holdings = data.funds?.slice(0, 10) || [];
    holdings.forEach(h => {
      const hasSymbol = h.symbol ? '✓' : '✗';
      console.log(
        (h.fundName || '').substring(0, 38).padEnd(40),
        (h.symbol || 'NULL').padEnd(20),
        hasSymbol
      );
    });

    // Check specific stocks
    console.log('\n🔍 Checking L&T and Axis Bank specifically:\n');
    const ltHolding = data.funds?.find(h => h.fundName?.includes('Larsen & Toubro'));
    const axisHolding = data.funds?.find(h => h.fundName?.includes('Axis Bank'));

    if (ltHolding) {
      console.log('Larsen & Toubro Limited:');
      console.log(`   fundName: ${ltHolding.fundName}`);
      console.log(`   symbol: ${ltHolding.symbol || 'NULL'}`);
      console.log(`   stockId: ${ltHolding.stockId || 'NULL'}`);
      console.log(`   stockCompanyName: ${ltHolding.stockCompanyName || 'NULL'}\n`);
    }

    if (axisHolding) {
      console.log('Axis Bank Limited:');
      console.log(`   fundName: ${axisHolding.fundName}`);
      console.log(`   symbol: ${axisHolding.symbol || 'NULL'}`);
      console.log(`   stockId: ${axisHolding.stockId || 'NULL'}`);
      console.log(`   stockCompanyName: ${axisHolding.stockCompanyName || 'NULL'}\n`);
    }

    // Summary
    const withSymbol = data.funds?.filter(h => h.symbol).length || 0;
    const total = data.funds?.length || 0;

    console.log('📊 Summary:');
    console.log(`   Total holdings: ${total}`);
    console.log(`   With symbol: ${withSymbol} (${((withSymbol / total) * 100).toFixed(1)}%)`);
    console.log(`   Without symbol: ${total - withSymbol} (${(((total - withSymbol) / total) * 100).toFixed(1)}%)\n`);

    if (withSymbol === 0) {
      console.log('❌ ERROR: No symbols found in API response!');
      console.log('   The backend changes may not have been applied or server needs restart.\n');
    } else if (withSymbol < total * 0.4) {
      console.log('⚠️  WARNING: Less than 40% of holdings have symbols.');
      console.log('   This is expected for debt/bonds, but equity stocks should have symbols.\n');
    } else {
      console.log('✅ Symbols are being returned correctly!\n');
    }

    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    if (error.response) {
      console.error('   Status:', error.response.status);
      console.error('   Data:', error.response.data);
    }
    console.log('\n💡 Make sure the backend server is running on http://localhost:5000');
    process.exit(1);
  }
}

testAPIResponse();
