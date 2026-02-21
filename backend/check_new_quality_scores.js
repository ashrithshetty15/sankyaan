import db from './src/db.js';

async function checkNewQualityScores() {
  try {
    console.log('📊 Sample Quality Scores (New Weighted Formula)\n');

    // Check sample scores
    const result = await db.query(`
      SELECT
        s.symbol,
        s.company_name,
        sqs.piotroski_score,
        sqs.magic_formula_score,
        sqs.canslim_score,
        sqs.altman_z_score,
        sqs.overall_quality_score
      FROM stock_quality_scores sqs
      JOIN stocks s ON s.id = sqs.stock_id
      WHERE s.symbol IN ('RELIANCE.NS', 'TCS.NS', 'INFY.NS', 'HDFCBANK.NS', 'WIPRO.NS')
      ORDER BY s.symbol
    `);

    console.log('Symbol'.padEnd(15), 'Piotr', 'Magic', 'CANS', 'AltZ', 'Overall', 'Breakdown');
    console.log('-'.repeat(100));

    result.rows.forEach(r => {
      const piotr = r.piotroski_score || 0;
      const magic = r.magic_formula_score ? parseFloat(r.magic_formula_score) : 0;
      const canslim = r.canslim_score ? parseFloat(r.canslim_score) : 0;
      const altZ = r.altman_z_score ? parseFloat(r.altman_z_score) : 0;
      const overall = r.overall_quality_score || 0;

      // Calculate component points
      const piotrPoints = (piotr / 9) * 25;
      const magicPoints = (magic / 100) * 25;
      const canslimPoints = (canslim / 100) * 25;

      let altmanPoints = 0;
      if (altZ < 0) altmanPoints = 0;
      else if (altZ < 1.8) altmanPoints = (altZ / 1.8) * 10;
      else if (altZ < 3.0) altmanPoints = 10 + ((altZ - 1.8) / 1.2) * 7;
      else if (altZ < 6.0) altmanPoints = 17 + ((altZ - 3.0) / 3.0) * 8;
      else altmanPoints = 25;

      console.log(
        r.symbol.padEnd(15),
        String(piotr).padStart(5),
        String(magic.toFixed(0)).padStart(5),
        String(canslim.toFixed(0)).padStart(4),
        String(altZ.toFixed(1)).padStart(5),
        String(overall).padStart(7),
        `(${piotrPoints.toFixed(0)}+${magicPoints.toFixed(0)}+${canslimPoints.toFixed(0)}+${altmanPoints.toFixed(0)})`
      );
    });

    // Overall stats
    const stats = await db.query(`
      SELECT
        COUNT(*) as total,
        AVG(overall_quality_score) as avg_score,
        MIN(overall_quality_score) as min_score,
        MAX(overall_quality_score) as max_score,
        COUNT(*) FILTER (WHERE overall_quality_score >= 75) as excellent,
        COUNT(*) FILTER (WHERE overall_quality_score >= 50 AND overall_quality_score < 75) as good,
        COUNT(*) FILTER (WHERE overall_quality_score >= 25 AND overall_quality_score < 50) as average,
        COUNT(*) FILTER (WHERE overall_quality_score < 25) as poor
      FROM stock_quality_scores
      WHERE overall_quality_score IS NOT NULL
    `);

    const s = stats.rows[0];
    console.log('\n📈 Overall Quality Score Distribution:');
    console.log(`   Total Stocks: ${s.total}`);
    console.log(`   Average: ${parseFloat(s.avg_score).toFixed(1)}/100`);
    console.log(`   Range: ${s.min_score} - ${s.max_score}`);
    console.log(`\n   Grade Distribution:`);
    console.log(`   🌟 Excellent (75-100): ${s.excellent} (${(s.excellent / s.total * 100).toFixed(1)}%)`);
    console.log(`   ✅ Good (50-74): ${s.good} (${(s.good / s.total * 100).toFixed(1)}%)`);
    console.log(`   ⚠️  Average (25-49): ${s.average} (${(s.average / s.total * 100).toFixed(1)}%)`);
    console.log(`   ❌ Poor (0-24): ${s.poor} (${(s.poor / s.total * 100).toFixed(1)}%)`);

    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

checkNewQualityScores();
