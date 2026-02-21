import db from './src/db.js';

async function testPortfolioAPI() {
  try {
    console.log('🧪 Testing Portfolio Forensics API Response\n');

    const fundName = '360 ONE ELSS Tax Saver Nifty 50 Index Fund';

    // Simulate the API query
    const holdings = await db.query(`
      SELECT
        mp.instrument_name,
        mp.percent_nav as portfolio_percentage,
        mp.market_value_lacs,
        mp.stock_id,
        s.symbol,
        s.company_name,
        s.sector,
        s.industry,
        qs.overall_quality_score,
        qs.financial_health_score,
        qs.management_quality_score,
        qs.earnings_quality_score,
        qs.piotroski_score,
        qs.altman_z_score
      FROM mutualfund_portfolio mp
      LEFT JOIN stocks s ON s.id = mp.stock_id
      LEFT JOIN stock_quality_scores qs ON qs.stock_id = mp.stock_id
      WHERE mp.fund_name = $1
        AND mp.percent_nav > 0
      ORDER BY mp.market_value_lacs DESC
      LIMIT 10
    `, [fundName]);

    console.log('📊 API Response Preview (first 10 holdings):\n');
    console.log('Instrument Name'.padEnd(40), 'Symbol'.padEnd(20), 'stock_id', 'Quality');
    console.log('-'.repeat(90));

    holdings.rows.forEach(h => {
      const hasSymbol = h.symbol ? '✓' : '✗';
      const hasStockId = h.stock_id ? '✓' : '✗';

      console.log(
        h.instrument_name.substring(0, 38).padEnd(40),
        (h.symbol || 'NULL').padEnd(20),
        `${hasStockId} ${String(h.stock_id || 'NULL').padStart(4)}`,
        String(h.overall_quality_score || '-').padStart(7)
      );
    });

    // Check L&T and Axis Bank specifically
    console.log('\n🔍 L&T and Axis Bank Details:\n');

    const specific = holdings.rows.filter(h =>
      h.instrument_name.includes('Larsen & Toubro') ||
      h.instrument_name.includes('Axis Bank')
    );

    specific.forEach(h => {
      console.log(`${h.instrument_name}:`);
      console.log(`  - stock_id: ${h.stock_id || 'NULL'}`);
      console.log(`  - symbol: ${h.symbol || 'NULL'}`);
      console.log(`  - company_name: ${h.company_name || 'NULL'}`);
      console.log(`  - sector: ${h.sector || 'NULL'}`);
      console.log(`  - quality_score: ${h.overall_quality_score || 'NULL'}\n`);
    });

    // Verify the actual API response format
    console.log('✅ Expected API Response Format:\n');
    const sampleHolding = holdings.rows[0];
    if (sampleHolding && sampleHolding.stock_id && sampleHolding.overall_quality_score !== null) {
      const apiFormat = {
        name: sampleHolding.instrument_name,
        symbol: sampleHolding.symbol,
        sector: sampleHolding.sector,
        industry: sampleHolding.industry,
        weight: parseFloat(sampleHolding.portfolio_percentage),
        scores: {
          overall_quality_score: sampleHolding.overall_quality_score,
          financial_health_score: sampleHolding.financial_health_score,
          management_quality_score: sampleHolding.management_quality_score,
          earnings_quality_score: sampleHolding.earnings_quality_score,
          piotroski_score: sampleHolding.piotroski_score,
          altman_z_score: sampleHolding.altman_z_score
        }
      };

      console.log(JSON.stringify(apiFormat, null, 2));
    }

    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

testPortfolioAPI();
