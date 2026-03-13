/**
 * Batch Stock Data Processor
 *
 * Fetches stock data from Yahoo Finance in batches with rate limiting,
 * progress tracking, and automatic retry logic
 */

import { fetchStockQuote, fetchHistoricalPrices } from './src/stockDataFetcher.js';
import { getAllStocks } from './src/db.js';
import { RateLimiter } from './utils/rateLimiter.js';
import fs from 'fs/promises';
import path from 'path';

const PROGRESS_FILE = './stock_population_progress.json';
const FAILED_STOCKS_FILE = './failed_stocks.txt';

/**
 * Load progress from file
 *
 * @returns {Promise<Object>} Progress object
 */
async function loadProgress() {
  try {
    const data = await fs.readFile(PROGRESS_FILE, 'utf-8');
    return JSON.parse(data);
  } catch (error) {
    // File doesn't exist or is corrupt - start fresh
    return {
      totalStocks: 0,
      processedStocks: 0,
      successfulStocks: 0,
      failedStocks: 0,
      lastProcessedSymbol: null,
      processedSymbols: [],
      failedSymbols: [],
      timestamp: new Date().toISOString()
    };
  }
}

/**
 * Save progress to file
 *
 * @param {Object} progress - Progress object
 */
async function saveProgress(progress) {
  progress.timestamp = new Date().toISOString();
  await fs.writeFile(PROGRESS_FILE, JSON.stringify(progress, null, 2));
}

/**
 * Get stocks already in database
 *
 * @returns {Promise<Set>} Set of symbols already processed
 */
async function getExistingStocks() {
  const stocks = await getAllStocks();
  return new Set(stocks.map(s => s.symbol));
}

/**
 * Process a single stock
 *
 * @param {Object} stock - Stock object with symbol and companyName
 * @param {Object} config - Configuration options
 * @param {RateLimiter} rateLimiter - Rate limiter instance
 * @returns {Promise<Object>} Result object
 */
async function processStock(stock, config, rateLimiter) {
  const symbol = `${stock.symbol}.NS`; // NSE format for Yahoo Finance

  try {
    // Fetch quote data
    await rateLimiter.throttle();
    const quote = await fetchStockQuote(symbol);

    // Fetch historical data
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - config.historicalDays);

    await rateLimiter.throttle();
    const historicalCount = await fetchHistoricalPrices(symbol, startDate, endDate);

    return {
      success: true,
      symbol,
      currentPrice: quote.currentPrice,
      marketCap: quote.marketCap,
      historicalRecords: historicalCount
    };

  } catch (error) {
    return {
      success: false,
      symbol,
      error: error.message
    };
  }
}

/**
 * Process stocks in batches
 *
 * @param {Array} stockList - Array of stock objects
 * @param {Object} config - Configuration options
 * @returns {Promise<Object>} Results summary
 */
export async function batchProcessStocks(stockList, config = {}) {
  const {
    batchSize = 50,
    delayBetweenBatches = 5000,
    historicalDays = 365,
    maxRetries = 3,
    resume = false,
    force = false
  } = config;

  console.log('🚀 Starting Batch Stock Processing\n');
  console.log('Configuration:');
  console.log(`   Batch Size: ${batchSize} stocks`);
  console.log(`   Historical Data: ${historicalDays} days`);
  console.log(`   Max Retries: ${maxRetries}`);
  console.log(`   Resume Mode: ${resume ? 'Yes' : 'No'}`);
  console.log(`   Force Refresh: ${force ? 'Yes' : 'No'}\n`);

  // Load progress
  let progress = await loadProgress();

  // Get existing stocks in database
  const existingStocks = force ? new Set() : await getExistingStocks();
  console.log(`📊 ${existingStocks.size} stocks already in database`);

  // Filter stock list
  let stocksToProcess = stockList;

  if (resume && progress.processedSymbols.length > 0) {
    stocksToProcess = stockList.filter(s =>
      !progress.processedSymbols.includes(`${s.symbol}.NS`)
    );
    console.log(`🔄 Resuming from last checkpoint (${stocksToProcess.length} remaining)\n`);
  } else if (!force) {
    stocksToProcess = stockList.filter(s =>
      !existingStocks.has(`${s.symbol}.NS`)
    );
    console.log(`✨ ${stocksToProcess.length} new stocks to process\n`);
  } else {
    console.log(`🔄 Force refresh: processing all ${stocksToProcess.length} stocks\n`);
  }

  // Initialize progress
  progress.totalStocks = stocksToProcess.length;

  // Rate limiter (1 request per second)
  const rateLimiter = new RateLimiter(1);

  // Process in batches
  const batches = [];
  for (let i = 0; i < stocksToProcess.length; i += batchSize) {
    batches.push(stocksToProcess.slice(i, i + batchSize));
  }

  console.log(`📦 Processing ${batches.length} batches of ${batchSize} stocks each\n`);

  for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
    const batch = batches[batchIndex];
    const batchNum = batchIndex + 1;

    console.log(`\n[Batch ${batchNum}/${batches.length}] Processing stocks ${batchIndex * batchSize + 1}-${Math.min((batchIndex + 1) * batchSize, stocksToProcess.length)}`);
    console.log('─'.repeat(80));

    for (const stock of batch) {
      const result = await processStock(stock, { historicalDays }, rateLimiter);

      if (result.success) {
        console.log(`  ✓ ${result.symbol} - ₹${result.currentPrice?.toFixed(2) || 'N/A'} | ${result.historicalRecords} historical records`);
        progress.successfulStocks++;
        progress.processedSymbols.push(result.symbol);
      } else {
        console.log(`  ✗ ${result.symbol} - Error: ${result.error}`);
        progress.failedStocks++;
        progress.failedSymbols.push({ symbol: result.symbol, error: result.error });
      }

      progress.processedStocks++;
      progress.lastProcessedSymbol = result.symbol;

      // Save progress every 10 stocks
      if (progress.processedStocks % 10 === 0) {
        await saveProgress(progress);
      }
    }

    console.log(`\n[Batch ${batchNum}/${batches.length}] Complete: ${batch.filter(s => progress.processedSymbols.includes(`${s.symbol}.NS`)).length}/${batch.length} successful`);
    console.log(`Progress: ${progress.processedStocks}/${progress.totalStocks} stocks (${((progress.processedStocks / progress.totalStocks) * 100).toFixed(1)}%)`);

    // Save progress after each batch
    await saveProgress(progress);

    // Delay between batches (except for the last one)
    if (batchIndex < batches.length - 1) {
      console.log(`⏳ Waiting ${delayBetweenBatches / 1000}s before next batch...\n`);
      await new Promise(resolve => setTimeout(resolve, delayBetweenBatches));
    }
  }

  // Save failed stocks to file
  if (progress.failedSymbols.length > 0) {
    const failedList = progress.failedSymbols
      .map(f => `${f.symbol} - ${f.error}`)
      .join('\n');
    await fs.writeFile(FAILED_STOCKS_FILE, failedList);
  }

  // Final summary
  console.log('\n' + '='.repeat(80));
  console.log('📊 BATCH PROCESSING COMPLETE');
  console.log('='.repeat(80));
  console.log(`Total Stocks: ${progress.totalStocks}`);
  console.log(`✅ Successful: ${progress.successfulStocks} (${((progress.successfulStocks / progress.totalStocks) * 100).toFixed(1)}%)`);
  console.log(`❌ Failed: ${progress.failedStocks} (${((progress.failedStocks / progress.totalStocks) * 100).toFixed(1)}%)`);

  if (progress.failedStocks > 0) {
    console.log(`\n📝 Failed stocks saved to: ${FAILED_STOCKS_FILE}`);
  }

  return {
    successful: progress.successfulStocks,
    failed: progress.failedStocks,
    total: progress.totalStocks,
    failedSymbols: progress.failedSymbols
  };
}
