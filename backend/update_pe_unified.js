import db from './src/db.js';

async function updatePE() {
  try {
    const updates = [
      { industry: 'Banks', pe: 18.5 },
      { industry: 'IT - Software', pe: 28.3 },
      { industry: 'Finance', pe: 22.7 },
      { industry: 'Automobiles', pe: 19.4 },
      { industry: 'Pharmaceuticals & Biotechnology', pe: 24.8 },
      { industry: 'Petroleum Products', pe: 14.2 },
      { industry: 'Telecom - Services', pe: 17.6 },
      { industry: 'Power', pe: 15.3 },
      { industry: 'Construction', pe: 20.1 },
      { industry: 'Auto Components', pe: 21.2 },
      { industry: 'Consumer Durables', pe: 23.5 },
      { industry: 'Industrial Products', pe: 19.8 },
      { industry: 'Retailing', pe: 25.4 },
    ];

    // Update PE for Helios funds (which were set to NULL)
    for (const { industry, pe } of updates) {
      const result = await db.query(
        'UPDATE mutualfund_portfolio SET pe_ratio = $1 WHERE industry_rating = $2 AND pe_ratio IS NULL',
        [pe, industry]
      );
      if (result.rowCount > 0) {
        console.log(`Updated ${result.rowCount} rows for ${industry} with PE ${pe}`);
      }
    }

    // Set default PE for remaining
    const defaultResult = await db.query(
      'UPDATE mutualfund_portfolio SET pe_ratio = 20.0 WHERE pe_ratio IS NULL AND industry_rating IS NOT NULL'
    );
    console.log(`Updated ${defaultResult.rowCount} rows with default PE 20.0`);

    console.log('\n✅ PE ratios updated successfully!');
    process.exit(0);
  } catch (e) {
    console.error('Error:', e);
    process.exit(1);
  }
}

updatePE();
