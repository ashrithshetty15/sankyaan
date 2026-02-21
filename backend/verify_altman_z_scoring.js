import db from './src/db.js';

async function verifyAltmanZScoring() {
  try {
    console.log('📊 Verifying Altman Z-Score Normalization\n');

    // Get stocks with different Z-score ranges
    const result = await db.query(`
      SELECT
        s.symbol,
        s.company_name,
        sqs.altman_z_score,
        sqs.overall_quality_score,
        CASE
          WHEN sqs.altman_z_score < 1.81 THEN 'Distress'
          WHEN sqs.altman_z_score <= 2.99 THEN 'Grey'
          ELSE 'Safe'
        END as zone
      FROM stock_quality_scores sqs
      JOIN stocks s ON s.id = sqs.stock_id
      WHERE sqs.altman_z_score IS NOT NULL
      ORDER BY sqs.altman_z_score
      LIMIT 30
    `);

    console.log('Symbol'.padEnd(18), 'Z-Score', 'Zone'.padEnd(10), 'Z Points', 'Overall');
    console.log('-'.repeat(70));

    result.rows.forEach(r => {
      const z = parseFloat(r.altman_z_score);

      // Calculate Altman points using the new formula
      let altmanPoints = 0;
      if (z < 0) {
        altmanPoints = 0;
      } else if (z < 1.81) {
        altmanPoints = (z / 1.81) * 7; // Distress: 0-7 points
      } else if (z <= 2.99) {
        altmanPoints = 8 + ((z - 1.81) / (2.99 - 1.81)) * 16; // Grey: 8-24 points
      } else {
        altmanPoints = 25; // Safe: 25 points
      }

      console.log(
        r.symbol.padEnd(18),
        z.toFixed(2).padStart(7),
        r.zone.padEnd(10),
        altmanPoints.toFixed(1).padStart(8),
        String(r.overall_quality_score || '-').padStart(7)
      );
    });

    // Distribution by zone
    console.log('\n📈 Distribution by Altman Z Zone:\n');
    const distribution = await db.query(`
      SELECT
        CASE
          WHEN altman_z_score < 1.81 THEN 'Distress (Z < 1.81)'
          WHEN altman_z_score <= 2.99 THEN 'Grey (1.81-2.99)'
          ELSE 'Safe (Z > 2.99)'
        END as zone,
        COUNT(*) as count,
        AVG(altman_z_score) as avg_z,
        MIN(altman_z_score) as min_z,
        MAX(altman_z_score) as max_z
      FROM stock_quality_scores
      WHERE altman_z_score IS NOT NULL
      GROUP BY 1
      ORDER BY 1
    `);

    distribution.rows.forEach(r => {
      console.log(`${r.zone.padEnd(25)} ${String(r.count).padStart(5)} stocks  Avg Z: ${parseFloat(r.avg_z).toFixed(2)}`);
    });

    // Sample calculation examples
    console.log('\n📝 Sample Z-Score Point Calculations:\n');
    const examples = [
      { z: -2.0, expected: 0 },
      { z: 0.5, expected: '1.9 (0.5/1.81 * 7)' },
      { z: 1.0, expected: '3.9 (1.0/1.81 * 7)' },
      { z: 1.8, expected: '7.0 (1.8/1.81 * 7)' },
      { z: 1.81, expected: '8.0 (Grey zone starts)' },
      { z: 2.0, expected: '10.6 (8 + 0.19/1.18 * 16)' },
      { z: 2.5, expected: '17.3 (8 + 0.69/1.18 * 16)' },
      { z: 2.99, expected: '24.0 (8 + 1.18/1.18 * 16)' },
      { z: 3.0, expected: '25.0 (Safe zone)' },
      { z: 5.0, expected: '25.0 (Safe zone)' },
      { z: 10.0, expected: '25.0 (Safe zone)' }
    ];

    console.log('Z-Score  →  Points  (Formula)');
    console.log('-'.repeat(50));
    examples.forEach(ex => {
      const z = ex.z;
      let points = 0;
      if (z < 0) points = 0;
      else if (z < 1.81) points = (z / 1.81) * 7;
      else if (z <= 2.99) points = 8 + ((z - 1.81) / 1.18) * 16;
      else points = 25;

      console.log(`${String(z).padStart(7)}  →  ${points.toFixed(1).padStart(5)}  ${ex.expected}`);
    });

    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

verifyAltmanZScoring();
