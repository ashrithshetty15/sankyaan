/**
 * Compute fund-level CAGR using NAV data from mfapi.in (free, no API key needed).
 *
 * Usage:
 *   node compute_fund_cagr_mfapi.js
 *
 * What it does:
 *   1. Gets all distinct fund names from fund_quality_scores
 *   2. Searches mfapi.in for each fund's scheme code (prefers Direct Plan Growth)
 *   3. Fetches full NAV history
 *   4. Computes 1Y, 3Y, 5Y, 10Y CAGR from NAV data
 *   5. Updates fund_quality_scores with the CAGR values + scheme code
 */

import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

// Support DATABASE_URL (Railway/production) or individual vars (local)
const pool = process.env.DATABASE_URL
  ? new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false },
    })
  : new Pool({
      host: process.env.DB_HOST || 'localhost',
      database: process.env.DB_NAME || 'Sankyaan',
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD || 'Sankyaan',
      port: process.env.DB_PORT || 5432,
    });

const MFAPI_BASE = 'https://api.mfapi.in/mf';

// Simple delay to be nice to the free API
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Search mfapi.in for a fund by name.
 * Returns array of { schemeCode, schemeName }.
 */
async function searchMfapi(query) {
  try {
    const url = `${MFAPI_BASE}/search?q=${encodeURIComponent(query)}`;
    const res = await fetch(url);
    if (!res.ok) return [];
    return await res.json();
  } catch (err) {
    console.error(`  Search error for "${query}":`, err.message);
    return [];
  }
}

/**
 * Fetch full NAV history for a scheme code.
 * Returns { meta: {...}, data: [{date, nav}, ...] } sorted newest first.
 */
async function fetchNavHistory(schemeCode) {
  try {
    const res = await fetch(`${MFAPI_BASE}/${schemeCode}`);
    if (!res.ok) return null;
    const json = await res.json();
    if (!json.data || json.data.length === 0) return null;
    return json;
  } catch (err) {
    console.error(`  NAV fetch error for scheme ${schemeCode}:`, err.message);
    return null;
  }
}

/**
 * Parse DD-MM-YYYY date string to Date object.
 */
function parseNavDate(dateStr) {
  const [dd, mm, yyyy] = dateStr.split('-');
  return new Date(parseInt(yyyy), parseInt(mm) - 1, parseInt(dd));
}

/**
 * Find the NAV closest to a target date (looking backwards).
 * NAV data is sorted newest-first from mfapi.in.
 */
function findNavAtDate(navData, targetDate, toleranceDays = 15) {
  const targetTime = targetDate.getTime();
  let bestMatch = null;
  let bestDiff = Infinity;

  for (const entry of navData) {
    const entryDate = parseNavDate(entry.date);
    const diff = targetTime - entryDate.getTime();
    // We want entries on or before the target date, within tolerance
    if (diff >= 0 && diff < bestDiff) {
      bestDiff = diff;
      bestMatch = entry;
    }
  }

  // Check tolerance (convert days to ms)
  if (bestMatch && bestDiff <= toleranceDays * 24 * 60 * 60 * 1000) {
    return parseFloat(bestMatch.nav);
  }
  return null;
}

/**
 * Compute CAGR: ((endNav / startNav) ^ (1/years) - 1) * 100
 */
function computeCAGR(currentNav, oldNav, years) {
  if (!currentNav || !oldNav || oldNav <= 0 || currentNav <= 0) return null;
  return Math.round((Math.pow(currentNav / oldNav, 1 / years) - 1) * 10000) / 100;
}

/**
 * Clean fund name for mfapi.in search.
 * Removes common suffixes/noise to get better search results.
 */
function cleanFundNameForSearch(fundName) {
  let cleaned = fundName
    .replace(/\s*-\s*Direct\s*(Plan)?/gi, '')
    .replace(/\s*-\s*Regular\s*(Plan)?/gi, '')
    .replace(/\s*-\s*Growth\s*(Option)?/gi, '')
    .replace(/\s*-\s*IDCW\s*(Option)?/gi, '')
    .replace(/\s*-\s*Dividend\s*(Option)?/gi, '')
    .replace(/\s*Fund$/i, '')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned;
}

/**
 * From search results, pick the best scheme (Direct Plan + Growth preferred).
 */
function pickBestScheme(results, fundName) {
  if (results.length === 0) return null;

  // Priority: Direct Plan + Growth
  const directGrowth = results.find(r =>
    /direct\s*plan/i.test(r.schemeName) && /growth/i.test(r.schemeName) && !/idcw|dividend/i.test(r.schemeName)
  );
  if (directGrowth) return directGrowth;

  // Fallback: any Growth option
  const growth = results.find(r =>
    /growth/i.test(r.schemeName) && !/idcw|dividend/i.test(r.schemeName)
  );
  if (growth) return growth;

  // Fallback: any Direct Plan
  const direct = results.find(r =>
    /direct/i.test(r.schemeName) && !/idcw|dividend/i.test(r.schemeName)
  );
  if (direct) return direct;

  // Last resort: first result
  return results[0];
}

/**
 * Try multiple search strategies to find a fund.
 */
async function findSchemeCode(fundName, fundHouse) {
  // Strategy 1: Search with cleaned fund name
  const cleaned = cleanFundNameForSearch(fundName);
  let results = await searchMfapi(cleaned);
  await delay(300);

  if (results.length > 0) {
    const match = pickBestScheme(results, fundName);
    if (match) return match;
  }

  // Strategy 2: Search with fund house + key words
  const keyWords = cleaned
    .replace(new RegExp(fundHouse || '', 'gi'), '')
    .trim();
  if (fundHouse && keyWords.length > 3) {
    results = await searchMfapi(`${fundHouse} ${keyWords}`);
    await delay(300);
    if (results.length > 0) {
      const match = pickBestScheme(results, fundName);
      if (match) return match;
    }
  }

  // Strategy 3: Just the first 3-4 significant words
  const words = cleaned.split(' ').filter(w => w.length > 2).slice(0, 4).join(' ');
  if (words !== cleaned && words.length > 5) {
    results = await searchMfapi(words);
    await delay(300);
    if (results.length > 0) {
      const match = pickBestScheme(results, fundName);
      if (match) return match;
    }
  }

  return null;
}

// ───────────── Main ─────────────

async function main() {
  console.log('📈 Computing fund CAGR from mfapi.in NAV data...\n');

  // Ensure mfapi_scheme_code column exists
  await pool.query(`
    ALTER TABLE fund_quality_scores
      ADD COLUMN IF NOT EXISTS mfapi_scheme_code INTEGER
  `);

  // Get all funds from fund_quality_scores
  const fundsResult = await pool.query(`
    SELECT fund_name, scheme_name, fund_house, mfapi_scheme_code
    FROM fund_quality_scores
    ORDER BY fund_name
  `);

  const funds = fundsResult.rows;
  console.log(`Found ${funds.length} funds in fund_quality_scores\n`);

  if (funds.length === 0) {
    console.log('⚠️  No funds found. Run compute_fund_ratings.js first.');
    await pool.end();
    return;
  }

  let updated = 0;
  let skipped = 0;
  let notFound = 0;

  for (let i = 0; i < funds.length; i++) {
    const fund = funds[i];
    const label = fund.scheme_name || fund.fund_name;
    process.stdout.write(`[${i + 1}/${funds.length}] ${label.substring(0, 55).padEnd(55)} `);

    // Step 1: Find scheme code (use cached if available)
    let schemeCode = fund.mfapi_scheme_code;
    let schemeName = null;

    if (!schemeCode) {
      const match = await findSchemeCode(fund.fund_name, fund.fund_house);
      if (!match) {
        console.log('❌ No match found');
        notFound++;
        continue;
      }
      schemeCode = match.schemeCode;
      schemeName = match.schemeName;
    }

    // Step 2: Fetch NAV history
    const navData = await fetchNavHistory(schemeCode);
    await delay(300);

    if (!navData || navData.data.length < 30) {
      console.log(`⚠️  Insufficient NAV data (scheme: ${schemeCode})`);
      skipped++;
      continue;
    }

    // Step 3: Compute CAGR
    const now = new Date();
    const latestNav = parseFloat(navData.data[0].nav);

    const date1y = new Date(now); date1y.setFullYear(date1y.getFullYear() - 1);
    const date3y = new Date(now); date3y.setFullYear(date3y.getFullYear() - 3);
    const date5y = new Date(now); date5y.setFullYear(date5y.getFullYear() - 5);
    const date10y = new Date(now); date10y.setFullYear(date10y.getFullYear() - 10);

    const nav1y = findNavAtDate(navData.data, date1y);
    const nav3y = findNavAtDate(navData.data, date3y);
    const nav5y = findNavAtDate(navData.data, date5y);
    const nav10y = findNavAtDate(navData.data, date10y);

    const cagr1y = computeCAGR(latestNav, nav1y, 1);
    const cagr3y = computeCAGR(latestNav, nav3y, 3);
    const cagr5y = computeCAGR(latestNav, nav5y, 5);
    const cagr10y = computeCAGR(latestNav, nav10y, 10);

    // Step 4: Update DB
    await pool.query(`
      UPDATE fund_quality_scores
      SET cagr_1y = $1, cagr_3y = $2, cagr_5y = $3, cagr_10y = $4,
          mfapi_scheme_code = $5
      WHERE fund_name = $6
    `, [cagr1y, cagr3y, cagr5y, cagr10y, schemeCode, fund.fund_name]);

    const parts = [];
    if (cagr1y != null) parts.push(`1Y:${cagr1y > 0 ? '+' : ''}${cagr1y}%`);
    if (cagr3y != null) parts.push(`3Y:${cagr3y > 0 ? '+' : ''}${cagr3y}%`);
    if (cagr5y != null) parts.push(`5Y:${cagr5y > 0 ? '+' : ''}${cagr5y}%`);
    if (cagr10y != null) parts.push(`10Y:${cagr10y > 0 ? '+' : ''}${cagr10y}%`);

    console.log(`✅ ${parts.join(' | ') || 'no CAGR data'}${schemeName ? ` [${schemeCode}]` : ''}`);
    updated++;
  }

  console.log(`\n${'─'.repeat(60)}`);
  console.log(`✅ Updated: ${updated} funds`);
  console.log(`⚠️  Skipped: ${skipped} (insufficient NAV data)`);
  console.log(`❌ Not found: ${notFound} (no mfapi match)`);
  console.log(`\n🎉 Done! Fund CAGR values are now in fund_quality_scores.`);

  await pool.end();
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
