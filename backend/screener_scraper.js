import axios from 'axios';
import * as cheerio from 'cheerio';
import db from './src/db.js';

/**
 * Scrape comprehensive financial data from Screener.in for a single stock
 */
export async function scrapeScreenerData(symbol) {
  try {
    // Remove .NS suffix for Screener.in
    const cleanSymbol = symbol.replace('.NS', '');
    const url = `https://www.screener.in/company/${cleanSymbol}/`;

    // Fetch the page with headers to avoid being blocked
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Connection': 'keep-alive',
      },
      timeout: 15000
    });

    const $ = cheerio.load(response.data);

    const data = {
      symbol: symbol,
      companyName: null,
      marketCap: null,
      currentPrice: null,
      pe: null,
      pb: null,
      dividendYield: null,
      roe: null,
      roa: null,
      debtToEquity: null,
      currentRatio: null,
      revenue: null,
      operatingProfit: null,
      netProfit: null,
      eps: null,
      totalAssets: null,
      totalLiabilities: null,
      shareholdersEquity: null,
      promoterHolding: null,
      fiiHolding: null,
      diiHolding: null,
      publicHolding: null
    };

    // Extract company name
    data.companyName = $('h1').first().text().trim() || cleanSymbol;

    // Extract ratios from #top-ratios section
    $('#top-ratios li').each((i, el) => {
      const text = $(el).text().trim();

      // Market Cap
      const marketCapMatch = text.match(/Market Cap[\s\S]*?([\d,\.]+)\s*Cr\./);
      if (marketCapMatch) {
        data.marketCap = parseFloat(marketCapMatch[1].replace(/,/g, '')) * 10000000; // Convert Cr to actual value
      }

      // Current Price
      const priceMatch = text.match(/Current Price[\s\S]*?₹([\d,\.]+)/);
      if (priceMatch) {
        data.currentPrice = parseFloat(priceMatch[1].replace(/,/g, ''));
      }

      // Stock P/E
      const peMatch = text.match(/Stock P\/E[\s\S]*?([\d,\.]+)/);
      if (peMatch) {
        data.pe = parseFloat(peMatch[1].replace(/,/g, ''));
      }

      // Book Value
      const pbMatch = text.match(/Price to book value[\s\S]*?([\d,\.]+)/);
      if (pbMatch) {
        data.pb = parseFloat(pbMatch[1].replace(/,/g, ''));
      }

      // Dividend Yield
      const divMatch = text.match(/Dividend Yield[\s\S]*?([\d,\.]+)%/);
      if (divMatch) {
        data.dividendYield = parseFloat(divMatch[1].replace(/,/g, ''));
      }

      // ROE
      const roeMatch = text.match(/ROCE[\s\S]*?(\d+)%[\s\S]*?ROE[\s\S]*?(\d+)%/) || text.match(/ROE[\s\S]*?([\d,\.]+)%/);
      if (roeMatch) {
        data.roe = parseFloat((roeMatch[2] || roeMatch[1]).replace(/,/g, ''));
      }

      // Debt to Equity
      const debtMatch = text.match(/Debt to equity[\s\S]*?([\d,\.]+)/);
      if (debtMatch) {
        data.debtToEquity = parseFloat(debtMatch[1].replace(/,/g, ''));
      }
    });

    // Extract from compounded table (has ROE, ROCE, etc.)
    $('section#analysis table').first().find('tr').each((i, row) => {
      const cells = $(row).find('td');
      if (cells.length >= 2) {
        const metric = $(cells[0]).text().trim();
        const value = $(cells[cells.length - 1]).text().trim(); // Latest value (last column)

        if (metric === 'ROE %' && !data.roe) {
          const match = value.match(/([\d,\.]+)%?/);
          if (match) data.roe = parseFloat(match[1].replace(/,/g, ''));
        }
      }
    });

    // Extract quarterly results (latest quarter)
    const resultsTable = $('section#quarters table').first();
    if (resultsTable.length > 0) {
      resultsTable.find('tbody tr').each((i, row) => {
        const cells = $(row).find('td');
        if (cells.length >= 2) {
          const metric = $(cells[0]).text().trim();
          const value = $(cells[1]).text().trim(); // Latest quarter

          if (metric.includes('Sales')) {
            const match = value.match(/([\d,\.]+)/);
            if (match) data.revenue = parseFloat(match[1].replace(/,/g, '')) * 10000000; // Convert Cr to actual
          } else if (metric.includes('Operating Profit')) {
            const match = value.match(/([\d,\.]+)/);
            if (match) data.operatingProfit = parseFloat(match[1].replace(/,/g, '')) * 10000000;
          } else if (metric.includes('Net Profit')) {
            const match = value.match(/([\d,\.]+)/);
            if (match) data.netProfit = parseFloat(match[1].replace(/,/g, '')) * 10000000;
          } else if (metric.includes('EPS in Rs')) {
            const match = value.match(/([\d,\.]+)/);
            if (match) data.eps = parseFloat(match[1].replace(/,/g, ''));
          }
        }
      });
    }

    // Extract balance sheet data
    $('section#balance-sheet table').first().find('tbody tr').each((i, row) => {
      const cells = $(row).find('td');
      if (cells.length >= 2) {
        const metric = $(cells[0]).text().trim();
        const value = $(cells[1]).text().trim(); // Latest value

        if (metric.includes('Total Assets')) {
          const match = value.match(/([\d,\.]+)/);
          if (match) data.totalAssets = parseFloat(match[1].replace(/,/g, '')) * 10000000;
        } else if (metric.includes('Total Liabilities')) {
          const match = value.match(/([\d,\.]+)/);
          if (match) data.totalLiabilities = parseFloat(match[1].replace(/,/g, '')) * 10000000;
        } else if (metric.includes('Shareholders funds') || metric.includes('Total Equity')) {
          const match = value.match(/([\d,\.]+)/);
          if (match) data.shareholdersEquity = parseFloat(match[1].replace(/,/g, '')) * 10000000;
        }
      }
    });

    // Calculate Current Ratio from balance sheet if available
    let currentAssets = null;
    let currentLiabilities = null;
    $('section#balance-sheet table').first().find('tbody tr').each((i, row) => {
      const cells = $(row).find('td');
      if (cells.length >= 2) {
        const metric = $(cells[0]).text().trim();
        const value = $(cells[1]).text().trim();

        if (metric.includes('Current Assets')) {
          const match = value.match(/([\d,\.]+)/);
          if (match) currentAssets = parseFloat(match[1].replace(/,/g, ''));
        } else if (metric.includes('Current Liabilities')) {
          const match = value.match(/([\d,\.]+)/);
          if (match) currentLiabilities = parseFloat(match[1].replace(/,/g, ''));
        }
      }
    });
    if (currentAssets && currentLiabilities && currentLiabilities > 0) {
      data.currentRatio = currentAssets / currentLiabilities;
    }

    // Extract shareholding pattern
    let shareholdingFound = false;
    $('section').each((i, section) => {
      const heading = $(section).find('h2').text();
      if (heading.includes('Shareholding Pattern')) {
        $(section).find('table tr').each((i, row) => {
          const cells = $(row).find('td');
          if (cells.length >= 2) {
            const category = $(cells[0]).text().trim();
            const percentage = $(cells[cells.length - 1]).text().trim();
            const match = percentage.match(/([\d,\.]+)%?/);

            if (match && !shareholdingFound) {
              const value = parseFloat(match[1].replace(/,/g, ''));

              if (category.includes('Promoters') && !data.promoterHolding) {
                data.promoterHolding = value;
              } else if (category.includes('FII') && !data.fiiHolding) {
                data.fiiHolding = value;
              } else if (category.includes('DII') && !data.diiHolding) {
                data.diiHolding = value;
              } else if (category.includes('Public') && !data.publicHolding) {
                data.publicHolding = value;
              }
            }
          }
        });
      }
    });

    // Calculate ROA if we have net income and total assets
    if (data.netProfit && data.totalAssets && !data.roa) {
      data.roa = (data.netProfit / data.totalAssets) * 100;
    }

    return data;

  } catch (error) {
    if (error.response?.status === 404) {
      console.log(`   ⚠️  Stock ${symbol} not found on Screener.in`);
      return null;
    }
    throw error;
  }
}

/**
 * Save scraped data to database
 */
export async function saveScreenerData(data) {
  if (!data) return;

  try {
    // Get stock ID
    const stockResult = await db.query(
      'SELECT id FROM stocks WHERE symbol = $1',
      [data.symbol]
    );

    if (stockResult.rows.length === 0) {
      throw new Error(`Stock ${data.symbol} not found in database`);
    }

    const stockId = stockResult.rows[0].id;

    // Update stock with market cap if available
    if (data.marketCap) {
      await db.query(
        'UPDATE stocks SET market_cap = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
        [data.marketCap, stockId]
      );
    }

    // Insert fundamentals
    if (data.revenue || data.netProfit) {
      await db.query(`
        INSERT INTO stock_fundamentals (
          stock_id, period_type, fiscal_year, fiscal_quarter,
          revenue, operating_income, net_income, eps,
          total_assets, total_liabilities, shareholders_equity,
          pe_ratio, pb_ratio, roe, roa,
          debt_to_equity, current_ratio,
          gross_margin, operating_margin, net_margin
        ) VALUES (
          $1, 'Q', EXTRACT(YEAR FROM CURRENT_DATE)::INTEGER, EXTRACT(QUARTER FROM CURRENT_DATE)::INTEGER,
          $2, $3, $4, $5,
          $6, $7, $8,
          $9, $10, $11, $12,
          $13, $14,
          NULL, $15, $16
        )
      `, [
        stockId,
        data.revenue, data.operatingProfit, data.netProfit, data.eps,
        data.totalAssets, data.totalLiabilities, data.shareholdersEquity,
        data.pe, data.pb, data.roe, data.roa,
        data.debtToEquity, data.currentRatio,
        data.operatingProfit && data.revenue ? (data.operatingProfit / data.revenue * 100) : null,
        data.netProfit && data.revenue ? (data.netProfit / data.revenue * 100) : null
      ]);
    }

    // Insert shareholding pattern
    if (data.promoterHolding !== null) {
      await db.query(`
        INSERT INTO shareholding_pattern (
          stock_id, date, promoter_holding, fii_holding, dii_holding, public_holding
        ) VALUES ($1, CURRENT_DATE, $2, $3, $4, $5)
      `, [
        stockId,
        data.promoterHolding,
        data.fiiHolding,
        data.diiHolding,
        data.publicHolding
      ]);
    }

  } catch (error) {
    console.error(`Error saving data for ${data.symbol}:`, error.message);
    throw error;
  }
}
