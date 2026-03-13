/**
 * NSE Stock List Fetcher
 *
 * Downloads and parses the official NSE EQUITY_L.csv file
 * containing all listed equity stocks on the National Stock Exchange
 */

import fetch from 'node-fetch';
import csvParser from 'csv-parser';
import { Readable } from 'stream';
import fs from 'fs/promises';

const NSE_EQUITY_CSV_URL = 'https://nsearchives.nseindia.com/content/equities/EQUITY_L.csv';
const OUTPUT_FILE = './nse_stock_list.json';

/**
 * Download CSV file with retry logic
 *
 * @param {string} url - URL to download
 * @param {number} maxRetries - Maximum retry attempts
 * @returns {Promise<string>} CSV content as string
 */
async function downloadCSV(url, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`📥 Downloading NSE stock list (attempt ${attempt}/${maxRetries})...`);

      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
          'Accept': 'text/csv',
          'Accept-Language': 'en-US,en;q=0.9',
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const csvText = await response.text();
      console.log(`✅ Downloaded ${csvText.length} bytes`);
      return csvText;

    } catch (error) {
      console.error(`❌ Download failed (attempt ${attempt}):`, error.message);

      if (attempt === maxRetries) {
        throw new Error(`Failed to download CSV after ${maxRetries} attempts: ${error.message}`);
      }

      // Exponential backoff
      const delay = Math.pow(2, attempt) * 1000;
      console.log(`⏳ Retrying in ${delay}ms...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}

/**
 * Parse CSV content and extract stock information
 *
 * @param {string} csvContent - CSV file content
 * @returns {Promise<Array>} Array of stock objects
 */
async function parseCSV(csvContent) {
  return new Promise((resolve, reject) => {
    const stocks = [];
    const stream = Readable.from(csvContent);

    stream
      .pipe(csvParser({
        mapHeaders: ({ header }) => header.trim()
      }))
      .on('data', (row) => {
        // Filter for equity shares only (SERIES = 'EQ')
        // Exclude trade-to-trade segments ('BE', 'BZ')
        const series = (row.SERIES || '').trim();
        if (series === 'EQ') {
          const symbol = (row.SYMBOL || '').trim();
          const companyName = (row['NAME OF COMPANY'] || '').trim();
          const isin = (row['ISIN NUMBER'] || '').trim();
          const listingDate = (row['DATE OF LISTING'] || '').trim();

          // Validate symbol (should be alphanumeric)
          if (symbol && /^[A-Z0-9]+$/i.test(symbol)) {
            stocks.push({
              symbol,
              companyName,
              isin,
              listingDate
            });
          }
        }
      })
      .on('end', () => {
        resolve(stocks);
      })
      .on('error', (error) => {
        reject(error);
      });
  });
}

/**
 * Main function to fetch NSE stock list
 *
 * @returns {Promise<Array>} Array of stock objects
 */
export async function fetchNSEStockList() {
  try {
    console.log('🚀 Starting NSE Stock List Fetch\n');

    // Download CSV
    const csvContent = await downloadCSV(NSE_EQUITY_CSV_URL);

    // Parse CSV
    console.log('📊 Parsing CSV data...');
    const stocks = await parseCSV(csvContent);
    console.log(`✅ Found ${stocks.length} equity stocks\n`);

    // Save to file for debugging/resume capability
    await fs.writeFile(OUTPUT_FILE, JSON.stringify(stocks, null, 2));
    console.log(`💾 Saved stock list to ${OUTPUT_FILE}`);

    // Show sample
    console.log('\n📋 Sample stocks:');
    stocks.slice(0, 5).forEach((stock, index) => {
      console.log(`   ${index + 1}. ${stock.symbol} - ${stock.companyName}`);
    });
    console.log(`   ... and ${stocks.length - 5} more\n`);

    return stocks;

  } catch (error) {
    console.error('❌ Error fetching NSE stock list:', error.message);
    throw error;
  }
}

// Run if executed directly
if (import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/')}`) {
  fetchNSEStockList()
    .then(() => {
      console.log('✨ NSE stock list fetch complete!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Fatal error:', error);
      process.exit(1);
    });
}
