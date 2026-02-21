import db from './src/db.js';
import { spawn } from 'child_process';

async function recalculateQualityScores() {
  try {
    console.log('🗑️  Deleting existing quality scores to recalculate with new formula...\n');

    const result = await db.query('DELETE FROM stock_quality_scores');
    console.log(`✅ Deleted ${result.rowCount} records\n`);

    console.log('🔄 Recalculating with new weighted formula...\n');
    console.log('─'.repeat(70) + '\n');

    // Run calculate_quality_scores_fmp.js
    const calculate = spawn('node', ['calculate_quality_scores_fmp.js'], {
      cwd: process.cwd(),
      stdio: 'inherit'
    });

    calculate.on('close', (code) => {
      if (code === 0) {
        console.log('\n✅ Recalculation complete!');
      } else {
        console.error(`\n❌ Calculation failed with code ${code}`);
      }
      process.exit(code);
    });

  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

recalculateQualityScores();
