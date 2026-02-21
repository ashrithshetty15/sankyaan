/**
 * NSE Stock Population Orchestrator
 *
 * Main script to populate all NSE stocks into the database
 * Coordinates: downloading stock list, fetching data, generating fundamentals, calculating quality scores
 */

import { Command } from 'commander';
import { fetchNSEStockList } from './fetch_nse_stock_list.js';
import { batchProcessStocks } from './batch_processor.js';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

const program = new Command();

/**
 * Run a Node.js script
 *
 * @param {string} scriptPath - Path to the script
 * @param {Array} args - Command-line arguments
 * @returns {Promise<void>}
 */
async function runScript(scriptPath, args = []) {
  const command = `node ${scriptPath} ${args.join(' ')}`;
  console.log(`\n🔧 Running: ${command}\n`);

  return new Promise((resolve, reject) => {
    const child = exec(command, { cwd: process.cwd() });

    child.stdout.on('data', (data) => process.stdout.write(data));
    child.stderr.on('data', (data) => process.stderr.write(data));

    child.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Script exited with code ${code}`));
      }
    });
  });
}

/**
 * Main orchestration function
 *
 * @param {Object} options - Command-line options
 */
async function populateAllNSEStocks(options) {
  const startTime = Date.now();

  try {
    console.log('🚀 NSE STOCK POPULATION PROCESS');
    console.log('='.repeat(80));
    console.log(`Started: ${new Date().toLocaleString()}`);
    console.log('='.repeat(80) + '\n');

    // Phase 1: Download NSE stock list
    if (!options.phase || options.phase === 'list' || options.phase === 'quotes') {
      console.log('📥 PHASE 1: Downloading NSE Stock List');
      console.log('─'.repeat(80));

      const stockList = await fetchNSEStockList();
      console.log(`✅ Phase 1 Complete: ${stockList.length} stocks found\n`);

      // Phase 2: Fetch stock data from Yahoo Finance
      if (!options.phase || options.phase === 'quotes') {
        console.log('📊 PHASE 2: Fetching Stock Data from Yahoo Finance');
        console.log('─'.repeat(80));
        console.log(`⏱️  Estimated time: ~${Math.ceil(stockList.length / 30)} minutes\n`);

        const results = await batchProcessStocks(stockList, {
          batchSize: options.batchSize || 50,
          delayBetweenBatches: options.delayBetweenBatches || 5000,
          historicalDays: options.historicalDays || 365,
          resume: options.resume || false,
          force: options.force || false
        });

        console.log(`\n✅ Phase 2 Complete: ${results.successful} stocks processed\n`);
      }
    }

    // Phase 3: Generate fundamental data
    if (!options.phase || options.phase === 'fundamentals') {
      console.log('💰 PHASE 3: Generating Fundamental Data');
      console.log('─'.repeat(80));

      try {
        await runScript('generate_sample_fundamentals.js', ['--all']);
        console.log('✅ Phase 3 Complete: Fundamental data generated\n');
      } catch (error) {
        console.log(`⚠️  Phase 3: ${error.message}`);
        console.log('Note: Run "node generate_sample_fundamentals.js --all" manually if needed\n');
      }
    }

    // Phase 4: Calculate quality scores
    if (!options.phase || options.phase === 'quality-scores') {
      console.log('🎯 PHASE 4: Calculating Quality Scores');
      console.log('─'.repeat(80));

      try {
        await runScript('calculate_quality_scores.js', ['--all']);
        console.log('✅ Phase 4 Complete: Quality scores calculated\n');
      } catch (error) {
        console.log(`⚠️  Phase 4: ${error.message}`);
        console.log('Note: Run "node calculate_quality_scores.js" manually if needed\n');
      }
    }

    // Final summary
    const elapsedTime = Math.floor((Date.now() - startTime) / 1000);
    const minutes = Math.floor(elapsedTime / 60);
    const seconds = elapsedTime % 60;

    console.log('\n' + '='.repeat(80));
    console.log('🎉 NSE STOCK POPULATION COMPLETE!');
    console.log('='.repeat(80));
    console.log(`Completed: ${new Date().toLocaleString()}`);
    console.log(`Total Time: ${minutes}m ${seconds}s`);
    console.log('='.repeat(80));
    console.log('\n✨ Your stock database is now populated with NSE stocks!');
    console.log('📊 You can now view all stocks at: http://localhost:3001 (Stocks tab)\n');

  } catch (error) {
    console.error('\n❌ FATAL ERROR:', error.message);
    console.error('\nStack trace:');
    console.error(error.stack);
    process.exit(1);
  }
}

// Configure CLI
program
  .name('populate-all-nse-stocks')
  .description('Populate all NSE stocks into the database')
  .version('1.0.0');

program
  .option('--all', 'Run all phases (default)')
  .option('--resume', 'Resume from last checkpoint')
  .option('--force', 'Force refresh even if stock exists')
  .option('--phase <phase>', 'Run specific phase only (quotes, fundamentals, quality-scores)')
  .option('--batch-size <size>', 'Number of stocks per batch', parseInt)
  .option('--delay-between-batches <ms>', 'Delay between batches in milliseconds', parseInt)
  .option('--historical-days <days>', 'Number of days of historical data', parseInt)
  .action(populateAllNSEStocks);

program.parse();
