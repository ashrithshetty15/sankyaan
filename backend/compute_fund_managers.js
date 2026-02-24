/**
 * Fetch fund manager names from Kuvera API for all mutual funds.
 *
 * Usage:
 *   node compute_fund_managers.js
 *
 * Pipeline:
 *   1. Gets all funds from fund_quality_scores that have mfapi_scheme_code
 *   2. Fetches ISIN from mfapi.in using scheme code
 *   3. Uses ISIN to query Kuvera API for fund_manager field
 *   4. Updates fund_quality_scores with fund_manager name(s)
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
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Fetch ISIN from mfapi.in using scheme code.
 * The meta field contains isin_growth and isin_div_reinvestment.
 */
async function fetchIsinFromMfapi(schemeCode) {
  try {
    const res = await fetch(`${MFAPI_BASE}/${schemeCode}`);
    if (!res.ok) return null;
    const json = await res.json();
    return json?.meta?.isin_growth || json?.meta?.isin_div_reinvestment || null;
  } catch (err) {
    console.error(`  ISIN fetch error for scheme ${schemeCode}:`, err.message);
    return null;
  }
}

/**
 * Fetch fund manager name from Kuvera API using ISIN.
 * mf.captnemo.in/kuvera/{ISIN} redirects to api.kuvera.in.
 */
async function fetchFundDataFromKuvera(isin) {
  try {
    const url = `https://mf.captnemo.in/kuvera/${isin}`;
    const res = await fetch(url, {
      headers: { 'Accept': 'application/json' },
      redirect: 'follow'
    });
    if (!res.ok) return null;

    const text = await res.text();
    // Handle redirect text response from captnemo proxy
    if (text.startsWith('Redirecting')) {
      const redirectUrl = text.split('to ')[1]?.trim();
      if (redirectUrl) {
        const res2 = await fetch(redirectUrl, { headers: { 'Accept': 'application/json' } });
        if (!res2.ok) return null;
        const data2 = await res2.json();
        const fund2 = Array.isArray(data2) ? data2[0] : data2;
        return fund2 ? { fundManager: fund2.fund_manager || null, startDate: fund2.start_date || null } : null;
      }
      return null;
    }

    const data = JSON.parse(text);
    const fund = Array.isArray(data) ? data[0] : data;
    if (!fund) return null;

    return { fundManager: fund.fund_manager || null, startDate: fund.start_date || null };
  } catch (err) {
    console.error(`  Kuvera fetch error for ISIN ${isin}:`, err.message);
    return null;
  }
}

// ───────────── Main ─────────────

async function main() {
  console.log('Fetching fund managers from Kuvera API...\n');

  // Ensure columns exist
  await pool.query(`
    ALTER TABLE fund_quality_scores
      ADD COLUMN IF NOT EXISTS fund_manager TEXT,
      ADD COLUMN IF NOT EXISTS fund_manager_updated_at TIMESTAMP,
      ADD COLUMN IF NOT EXISTS fund_start_date DATE
  `);

  // Get all funds with mfapi_scheme_code
  const fundsResult = await pool.query(`
    SELECT fund_name, scheme_name, fund_house, mfapi_scheme_code,
           fund_manager, fund_manager_updated_at
    FROM fund_quality_scores
    WHERE mfapi_scheme_code IS NOT NULL
    ORDER BY fund_name
  `);

  const funds = fundsResult.rows;
  console.log(`Found ${funds.length} funds with mfapi_scheme_code\n`);

  if (funds.length === 0) {
    console.log('No funds found. Run compute_fund_cagr_mfapi.js first.');
    await pool.end();
    return;
  }

  let updated = 0;
  let skipped = 0;
  let notFound = 0;

  for (let i = 0; i < funds.length; i++) {
    const fund = funds[i];
    const label = (fund.scheme_name || fund.fund_name).substring(0, 55).padEnd(55);
    process.stdout.write(`[${i + 1}/${funds.length}] ${label} `);

    // Skip if recently updated (within last 30 days)
    if (fund.fund_manager && fund.fund_manager_updated_at) {
      const daysSinceUpdate = (Date.now() - new Date(fund.fund_manager_updated_at).getTime()) / (1000 * 60 * 60 * 24);
      if (daysSinceUpdate < 30) {
        console.log(`-- skipped (${Math.round(daysSinceUpdate)}d ago): ${fund.fund_manager}`);
        skipped++;
        continue;
      }
    }

    // Step 1: Get ISIN from mfapi.in
    const isin = await fetchIsinFromMfapi(fund.mfapi_scheme_code);
    await delay(300);

    if (!isin) {
      console.log('-- no ISIN found');
      notFound++;
      continue;
    }

    // Step 2: Get fund_manager + start_date from Kuvera
    const kuveraData = await fetchFundDataFromKuvera(isin);
    await delay(300);

    if (!kuveraData || !kuveraData.fundManager) {
      console.log(`-- no fund manager found (ISIN: ${isin})`);
      notFound++;
      continue;
    }

    // Step 3: Update DB
    await pool.query(`
      UPDATE fund_quality_scores
      SET fund_manager = $1, fund_manager_updated_at = NOW(),
          fund_start_date = COALESCE($3::date, fund_start_date)
      WHERE fund_name = $2
    `, [kuveraData.fundManager, fund.fund_name, kuveraData.startDate]);

    console.log(`-> ${kuveraData.fundManager}${kuveraData.startDate ? ` (since ${kuveraData.startDate})` : ''}`);
    updated++;
  }

  console.log(`\n${'─'.repeat(60)}`);
  console.log(`Updated: ${updated} funds`);
  console.log(`Skipped: ${skipped} (recently updated)`);
  console.log(`Not found: ${notFound}`);
  console.log(`\nDone! Fund manager data is now in fund_quality_scores.`);

  await pool.end();
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
