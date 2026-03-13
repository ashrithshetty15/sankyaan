import db from './src/db.js';

/**
 * Clean up 360 ONE fund names by removing verbose descriptions
 * Pattern: "Fund Name - Long Description" -> "Fund Name"
 */
async function fix360FundNames() {
  console.log('🔧 Fixing 360 ONE fund names...\n');

  // Mapping of old names to clean names
  const nameUpdates = [
    {
      old: '360 ONE Balanced Hybrid Fund -  An open ended balanced scheme investing in equity and debt instruments',
      new: '360 ONE Balanced Hybrid Fund'
    },
    {
      old: '360 ONE Dynamic Bond Fund  - An Open Ended Dynamic Debt Scheme investing across duration. A relatively high interest rate risk and relatively high credit risk',
      new: '360 ONE Dynamic Bond Fund'
    },
    {
      old: '360 ONE ELSS Tax Saver Nifty 50 Index Fund - An Open Ended Passive Equity Linked Saving Scheme with a statutory lock-in period of 3 years and tax benefit, replicating/tracking the Nifty 50 index)',
      new: '360 ONE ELSS Tax Saver Nifty 50 Index Fund'
    },
    {
      old: '360 ONE FLEXICAP FUND - An Open Ended Dynamic Equity Scheme investing across large cap, mid cap and small cap stocks',
      new: '360 ONE FLEXICAP FUND'
    },
    {
      old: '360 ONE Focused Fund(Formerly Known as 360 ONE Focused Equity Fund)  - An Open Ended Equity Scheme investing in maximum 30 multicap stocks',
      new: '360 ONE Focused Fund(Formerly Known as 360 ONE Focused Equity Fund)'
    },
    {
      old: '360 ONE GOLD ETF (An open-ended exchange traded fund replicating/tracking domestic prices of Gold)',
      new: '360 ONE GOLD ETF'
    },
    {
      old: '360 ONE Liquid Fund (An open ended liquid scheme. A relatively low interest rate risk and relatively moderate credit risk)',
      new: '360 ONE Liquid Fund'
    },
    {
      old: '360 ONE Multi Asset Allocation Fund - An open ended scheme investing in Equity & Equity Related Instruments, Debt & Money Market Securities, Gold/Silver related instruments and in units of REITs & InvITs',
      new: '360 ONE Multi Asset Allocation Fund'
    },
    {
      old: '360 ONE Overnight Fund - An open-ended debt scheme investing in overnight securities. A relatively low interest risk & relatively low credit risk',
      new: '360 ONE Overnight Fund'
    },
    {
      old: '360 ONE QUANT FUND - An Open Ended Equity Scheme investing based on quant theme',
      new: '360 ONE QUANT FUND'
    },
    {
      old: '360 ONE Silver ETF (An open-ended exchange traded fund replicating/tracking domestic prices of Silver)',
      new: '360 ONE Silver ETF'
    }
  ];

  let totalUpdated = 0;

  for (const { old: oldName, new: newName } of nameUpdates) {
    try {
      const result = await db.query(
        `UPDATE mutualfund_portfolio
         SET fund_name = $1
         WHERE fund_name = $2`,
        [newName, oldName]
      );

      console.log(`✓ Updated "${oldName.substring(0, 50)}..." -> "${newName}"`);
      console.log(`  Rows affected: ${result.rowCount}\n`);
      totalUpdated += result.rowCount;
    } catch (error) {
      console.error(`✗ Error updating "${oldName}":`, error.message);
    }
  }

  console.log(`\n✨ Complete! Updated ${totalUpdated} total rows.`);

  // Verify the changes
  const verify = await db.query(`
    SELECT DISTINCT fund_name
    FROM mutualfund_portfolio
    WHERE fund_name LIKE '%360%'
    ORDER BY fund_name
  `);

  console.log(`\n📋 Updated 360 ONE fund names:`);
  verify.rows.forEach((row, i) => {
    console.log(`${i + 1}. ${row.fund_name}`);
  });

  process.exit(0);
}

fix360FundNames();
