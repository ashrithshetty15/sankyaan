/**
 * fundChanges.js - GET /api/fund-changes/:fundName
 * Compares two consecutive monthly portfolios, returns added/removed/changed holdings.
 */
import pool from '../db.js';

const TABLE_MAP = [
  ['360 one','portfolio_360_one'],['aditya birla','portfolio_aditya_birla_sun_life'],
  ['axis','portfolio_axis'],['bajaj','portfolio_bajaj_finserv'],
  ['bank of india','portfolio_bank_of_india'],['baroda bnp','portfolio_baroda_bnp_paribas'],
  ['baroda','portfolio_baroda_bnp_paribas'],['canara robeco','portfolio_canara_robeco'],
  ['dsp','portfolio_dsp'],['edelweiss','portfolio_edelweiss'],
  ['franklin','portfolio_franklin_templeton'],['groww','portfolio_groww'],
  ['hdfc','portfolio_hdfc'],['helios','portfolio_helios'],
  ['hsbc','portfolio_hsbc'],['icici prudential','portfolio_icici_prudential'],
  ['icici','portfolio_icici_prudential'],['invesco','portfolio_invesco'],
  ['iti','portfolio_iti'],['jm financial','portfolio_jm_financial'],
  ['kotak','portfolio_kotak_mahindra'],['lic','portfolio_lic'],
  ['mahindra','portfolio_mahindra'],['mirae','portfolio_mirae_asset'],
  ['motilal','portfolio_motilal_oswal'],['navi','portfolio_navi'],
  ['nippon','portfolio_nippon_india'],['nj mutual','portfolio_nj'],
  ['old bridge','portfolio_old_bridge'],['pgim','portfolio_pgim_india'],
  ['ppfas','portfolio_ppfas'],['parag parikh','portfolio_ppfas'],
  ['quant mutual','portfolio_quant'],['quantum','portfolio_quantum'],
  ['samco','portfolio_samco'],['sbi','portfolio_sbi'],
  ['shriram','portfolio_shriram'],['sundaram','portfolio_sundaram'],
  ['tata','portfolio_tata'],['trust','portfolio_trust'],
  ['union','portfolio_union'],['uti','portfolio_uti'],
  ['whiteoak capital','portfolio_whiteoak_capital'],
  ['whiteoak','portfolio_whiteoak'],['zerodha','portfolio_zerodha'],
];

function resolveTable(fundName) {
  const lower = fundName.toLowerCase();
  for (const [kw, tbl] of TABLE_MAP) { if (lower.includes(kw)) return tbl; }
  return null;
}

async function tableExists(client, tableName) {
  const r = await client.query(
    "SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=$1 LIMIT 1",
    [tableName]
  );
  return r.rows.length > 0;
}

const norm = s => s.trim().toUpperCase().replace(/\s+/g, ' ');

export async function getFundChanges(req, res) {
  const fundName = decodeURIComponent(req.params.fundName);
  const client = await pool.connect();
  try {
    const tableName = resolveTable(fundName);
    if (!tableName || !(await tableExists(client, tableName))) {
      return res.json({ available: false, reason: 'No historical data available yet' });
    }

    const schemeKey = '%' + fundName.split(' ').slice(0, 3).join(' ').toLowerCase() + '%';

    // Get two most recent dates
    let datesQ = await client.query(
      'SELECT DISTINCT portfolio_date FROM ' + tableName +
      ' WHERE portfolio_date IS NOT NULL AND LOWER(scheme_name) LIKE $1 ORDER BY portfolio_date DESC LIMIT 2',
      [schemeKey]
    );
    let dates = datesQ.rows.map(r => r.portfolio_date);
    if (dates.length < 2) {
      datesQ = await client.query(
        'SELECT DISTINCT portfolio_date FROM ' + tableName +
        ' WHERE portfolio_date IS NOT NULL ORDER BY portfolio_date DESC LIMIT 2'
      );
      dates = datesQ.rows.map(r => r.portfolio_date);
    }
    if (dates.length < 2) {
      return res.json({ available: false, reason: 'Only one month of data available' });
    }

    const [newDate, oldDate] = dates;

    const selectSql =
      'SELECT instrument_name, isin, section, industry_rating, pct_to_nav, asset_type FROM ' + tableName +
      ' WHERE portfolio_date = $1 AND LOWER(scheme_name) LIKE $2 AND pct_to_nav IS NOT NULL ORDER BY pct_to_nav DESC';
    const selectAll =
      'SELECT instrument_name, isin, section, industry_rating, pct_to_nav, asset_type FROM ' + tableName +
      ' WHERE portfolio_date = $1 AND pct_to_nav IS NOT NULL ORDER BY pct_to_nav DESC';

    let [oldR, newR] = await Promise.all([
      client.query(selectSql, [oldDate, schemeKey]),
      client.query(selectSql, [newDate, schemeKey]),
    ]);
    if (!oldR.rows.length && !newR.rows.length) {
      [oldR, newR] = await Promise.all([
        client.query(selectAll, [oldDate]),
        client.query(selectAll, [newDate]),
      ]);
    }

    const oldMap = new Map(oldR.rows.map(r => [norm(r.instrument_name), r]));
    const newMap = new Map(newR.rows.map(r => [norm(r.instrument_name), r]));
    const added = [], removed = [], increased = [], decreased = [];

    for (const key of new Set([...oldMap.keys(), ...newMap.keys()])) {
      const inOld = oldMap.has(key), inNew = newMap.has(key);
      if (inNew && !inOld) {
        const r = newMap.get(key);
        added.push({ name: r.instrument_name, isin: r.isin || '', industry: r.industry_rating || '', pctNav: parseFloat(r.pct_to_nav) || 0, assetType: r.asset_type || 'Equity' });
      } else if (inOld && !inNew) {
        const r = oldMap.get(key);
        removed.push({ name: r.instrument_name, isin: r.isin || '', industry: r.industry_rating || '', pctNav: parseFloat(r.pct_to_nav) || 0, assetType: r.asset_type || 'Equity' });
      } else {
        const op = parseFloat(oldMap.get(key).pct_to_nav) || 0;
        const np = parseFloat(newMap.get(key).pct_to_nav) || 0;
        const d = np - op;
        if (Math.abs(d) >= 0.01) {
          const r = newMap.get(key);
          const e = { name: r.instrument_name, isin: r.isin || '', industry: r.industry_rating || '', oldPct: op, newPct: np, delta: d, assetType: r.asset_type || 'Equity' };
          (d > 0 ? increased : decreased).push(e);
        }
      }
    }

    added.sort((a, b) => b.pctNav - a.pctNav);
    removed.sort((a, b) => b.pctNav - a.pctNav);
    increased.sort((a, b) => b.delta - a.delta);
    decreased.sort((a, b) => a.delta - b.delta);

    return res.json({ available: true, oldDate, newDate, added, removed, increased, decreased, totalOld: oldR.rows.length, totalNew: newR.rows.length });
  } catch (err) {
    console.error('[fund-changes]', err.message);
    return res.json({ available: false, reason: 'Error computing changes' });
  } finally {
    client.release();
  }
}
