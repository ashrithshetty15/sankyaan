import db from '../db.js';

/**
 * Generate the monthly market digest HTML from DB data.
 * Returns a complete HTML email body.
 */
export async function generateDigestHTML() {
  const [topFunds, topStocks, recentTrades, sectorSummary] = await Promise.all([
    getTopFunds(),
    getTopStocks(),
    getRecentBulkTrades(),
    getSectorSummary(),
  ]);

  const today = new Date().toLocaleDateString('en-IN', {
    day: '2-digit', month: 'long', year: 'numeric'
  });

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Sankyaan Market Digest</title>
</head>
<body style="margin:0;padding:0;background:#0f0f1a;font-family:Arial,Helvetica,sans-serif;color:#e0e0e0;">
  <div style="max-width:600px;margin:0 auto;padding:20px;">

    <!-- Header -->
    <div style="text-align:center;padding:20px 0;border-bottom:1px solid #2a2a3e;">
      <h1 style="margin:0;color:#f0c040;font-size:24px;">Sankyaan</h1>
      <p style="margin:4px 0 0;color:#888;font-size:13px;">Monthly Market Digest — ${today}</p>
    </div>

    <!-- Top Funds -->
    <div style="padding:20px 0;">
      <h2 style="color:#f0c040;font-size:16px;margin:0 0 12px;text-transform:uppercase;letter-spacing:1px;">Top Rated Funds</h2>
      <table style="width:100%;border-collapse:collapse;font-size:13px;">
        <tr style="color:#888;text-align:left;">
          <th style="padding:6px 8px;border-bottom:1px solid #2a2a3e;">Fund</th>
          <th style="padding:6px 8px;border-bottom:1px solid #2a2a3e;text-align:right;">Quality</th>
          <th style="padding:6px 8px;border-bottom:1px solid #2a2a3e;text-align:right;">1Y CAGR</th>
        </tr>
        ${topFunds.map(f => `
        <tr>
          <td style="padding:8px;border-bottom:1px solid #1a1a2e;">${f.scheme_name || f.fund_name}</td>
          <td style="padding:8px;border-bottom:1px solid #1a1a2e;text-align:right;color:#3ddc84;">${f.overall_quality_score ?? '-'}</td>
          <td style="padding:8px;border-bottom:1px solid #1a1a2e;text-align:right;">${f.cagr_1y != null ? f.cagr_1y + '%' : '-'}</td>
        </tr>`).join('')}
      </table>
    </div>

    <!-- Top Stocks -->
    <div style="padding:20px 0;border-top:1px solid #2a2a3e;">
      <h2 style="color:#f0c040;font-size:16px;margin:0 0 12px;text-transform:uppercase;letter-spacing:1px;">Top Rated Stocks</h2>
      <table style="width:100%;border-collapse:collapse;font-size:13px;">
        <tr style="color:#888;text-align:left;">
          <th style="padding:6px 8px;border-bottom:1px solid #2a2a3e;">Stock</th>
          <th style="padding:6px 8px;border-bottom:1px solid #2a2a3e;">Sector</th>
          <th style="padding:6px 8px;border-bottom:1px solid #2a2a3e;text-align:right;">Score</th>
        </tr>
        ${topStocks.map(s => `
        <tr>
          <td style="padding:8px;border-bottom:1px solid #1a1a2e;font-weight:600;">${s.company_name || s.symbol}</td>
          <td style="padding:8px;border-bottom:1px solid #1a1a2e;color:#888;font-size:12px;">${s.sector || '-'}</td>
          <td style="padding:8px;border-bottom:1px solid #1a1a2e;text-align:right;color:#3ddc84;">${s.overall_quality_score ?? '-'}</td>
        </tr>`).join('')}
      </table>
    </div>

    <!-- Recent Bulk Trades -->
    ${recentTrades.length > 0 ? `
    <div style="padding:20px 0;border-top:1px solid #2a2a3e;">
      <h2 style="color:#f0c040;font-size:16px;margin:0 0 12px;text-transform:uppercase;letter-spacing:1px;">Notable MF Bulk Trades</h2>
      <table style="width:100%;border-collapse:collapse;font-size:13px;">
        <tr style="color:#888;text-align:left;">
          <th style="padding:6px 8px;border-bottom:1px solid #2a2a3e;">Stock</th>
          <th style="padding:6px 8px;border-bottom:1px solid #2a2a3e;">Fund House</th>
          <th style="padding:6px 8px;border-bottom:1px solid #2a2a3e;text-align:right;">Action</th>
        </tr>
        ${recentTrades.map(t => `
        <tr>
          <td style="padding:8px;border-bottom:1px solid #1a1a2e;font-weight:600;">${t.symbol}</td>
          <td style="padding:8px;border-bottom:1px solid #1a1a2e;color:#888;font-size:12px;">${t.client_name}</td>
          <td style="padding:8px;border-bottom:1px solid #1a1a2e;text-align:right;">
            <span style="color:${t.transaction_type === 'Buy' ? '#3ddc84' : '#ff6b6b'};font-weight:600;">${t.transaction_type}</span>
          </td>
        </tr>`).join('')}
      </table>
    </div>` : ''}

    <!-- Sector Summary -->
    ${sectorSummary.length > 0 ? `
    <div style="padding:20px 0;border-top:1px solid #2a2a3e;">
      <h2 style="color:#f0c040;font-size:16px;margin:0 0 12px;text-transform:uppercase;letter-spacing:1px;">Sector Overview</h2>
      <table style="width:100%;border-collapse:collapse;font-size:13px;">
        <tr style="color:#888;text-align:left;">
          <th style="padding:6px 8px;border-bottom:1px solid #2a2a3e;">Sector</th>
          <th style="padding:6px 8px;border-bottom:1px solid #2a2a3e;text-align:right;">Stocks</th>
          <th style="padding:6px 8px;border-bottom:1px solid #2a2a3e;text-align:right;">Avg Score</th>
        </tr>
        ${sectorSummary.map(s => `
        <tr>
          <td style="padding:8px;border-bottom:1px solid #1a1a2e;">${s.sector}</td>
          <td style="padding:8px;border-bottom:1px solid #1a1a2e;text-align:right;">${s.stock_count}</td>
          <td style="padding:8px;border-bottom:1px solid #1a1a2e;text-align:right;color:#3ddc84;">${s.avg_score}</td>
        </tr>`).join('')}
      </table>
    </div>` : ''}

    <!-- Footer -->
    <div style="padding:20px 0;border-top:1px solid #2a2a3e;text-align:center;">
      <p style="color:#888;font-size:12px;margin:0;">
        You're receiving this because you subscribed to Sankyaan updates.
      </p>
      <p style="margin:8px 0 0;">
        <a href="https://www.sankyaan.com" style="color:#f0c040;text-decoration:none;font-size:12px;">Visit Sankyaan</a>
        &nbsp;|&nbsp;
        <a href="{{unsubscribe_url}}" style="color:#888;text-decoration:none;font-size:12px;">Unsubscribe</a>
      </p>
    </div>

  </div>
</body>
</html>`;
}

async function getTopFunds() {
  const result = await db.query(`
    SELECT fund_name, scheme_name, overall_quality_score, cagr_1y
    FROM fund_quality_scores
    WHERE overall_quality_score IS NOT NULL
    ORDER BY overall_quality_score DESC
    LIMIT 5
  `);
  return result.rows;
}

async function getTopStocks() {
  const result = await db.query(`
    SELECT symbol, company_name, sector, overall_quality_score
    FROM stock_ratings_cache
    WHERE overall_quality_score IS NOT NULL
    ORDER BY overall_quality_score DESC
    LIMIT 5
  `);
  return result.rows;
}

async function getRecentBulkTrades() {
  const result = await db.query(`
    SELECT symbol, client_name, transaction_type, quantity, price,
           (quantity * price) AS amount
    FROM bulk_trades
    WHERE trade_date >= CURRENT_DATE - 30
    ORDER BY (quantity * price) DESC
    LIMIT 5
  `);
  return result.rows;
}

async function getSectorSummary() {
  const result = await db.query(`
    SELECT sector,
           COUNT(*)::integer AS stock_count,
           ROUND(AVG(overall_quality_score)::numeric, 1) AS avg_score
    FROM stock_ratings_cache
    WHERE sector IS NOT NULL AND sector != '' AND overall_quality_score IS NOT NULL
    GROUP BY sector
    HAVING COUNT(*) >= 3
    ORDER BY AVG(overall_quality_score) DESC
    LIMIT 8
  `);
  return result.rows;
}
