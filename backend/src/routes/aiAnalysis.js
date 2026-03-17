import axios from 'axios';
import db from '../db.js';
import { getStockData } from '../stockDataFetcher.js';

const CACHE_TTL = 60 * 60 * 1000; // 1 hour
const stockReportCache = new Map(); // symbol → { report, fetchedAt }
const fundReportCache = new Map();  // ticker → { report, fetchedAt }

async function callClaude(prompt) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set');

  const resp = await axios.post(
    'https://api.anthropic.com/v1/messages',
    {
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 500,
      messages: [{ role: 'user', content: prompt }],
    },
    {
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      timeout: 30000,
    }
  );
  return resp.data?.content?.[0]?.text || null;
}

function fmt(v, d = 1) { return v != null ? Number(v).toFixed(d) : 'N/A'; }
function fmtCr(v) { return v != null ? `₹${(v / 10000000).toFixed(0)} Cr` : 'N/A'; }

/**
 * GET /api/stock-ai-report?symbol=RELIANCE&force=1
 */
export async function getStockAIReport(req, res) {
  const { symbol, force } = req.query;
  if (!symbol) return res.status(400).json({ error: 'symbol required' });

  const key = symbol.toUpperCase();
  const now = Date.now();
  const cached = stockReportCache.get(key);
  if (!force && cached && (now - cached.fetchedAt) < CACHE_TTL) {
    return res.json(cached);
  }

  try {
    const stock = await getStockData(key);
    if (!stock) return res.status(404).json({ error: 'Stock not found' });

    const { fundamentals: f = {}, qualityScores: q = {}, shareholding: s = {}, company_name, sector, industry, current_price, market_cap } = stock;

    const prompt = `You are a professional Indian equity analyst. Write a concise investment analysis for ${company_name || key} (${key}), a ${sector || ''} company.

FINANCIALS:
- Market Cap: ${fmtCr(market_cap)} | Price: ₹${fmt(current_price, 2)}
- PE: ${fmt(f.pe_ratio)} | PB: ${fmt(f.pb_ratio)} | EPS: ${fmt(f.eps, 2)}
- ROE: ${fmt(f.roe)}% | ROA: ${fmt(f.roa)}% | Debt/Equity: ${fmt(f.debt_to_equity)}
- Net Margin: ${fmt(f.net_margin)}% | Revenue: ${fmtCr(f.revenue)}

QUALITY SCORES:
- Overall Quality: ${q.overall_quality_score ?? 'N/A'}/100 | Piotroski F-Score: ${q.piotroski_score ?? 'N/A'}/9 | Altman Z: ${fmt(q.altman_z_score)}
- Profitability: ${q.profitability_score ?? 'N/A'} | Financial Strength: ${q.financial_strength_score ?? 'N/A'} | Growth: ${q.growth_score ?? 'N/A'} | Valuation: ${q.valuation_score ?? 'N/A'}

SHAREHOLDING:
- Promoters: ${fmt(s.promoter_holding)}% | FII: ${fmt(s.fii_holding)}% | DII: ${fmt(s.dii_holding)}% | Public: ${fmt(s.public_holding)}%

Write exactly 3 paragraphs:
1. Business quality and financial health — what the scores and fundamentals reveal
2. Valuation and current price positioning — PE/PB context, strengths from shareholding
3. Key risks and overall investment suitability for a retail investor

Under 200 words. Confident analyst tone, use specific numbers, no bullet points.`;

    let report = null;
    let reportError = null;
    try {
      report = await callClaude(prompt);
    } catch (e) {
      reportError = e.response?.data?.error?.message || e.message;
    }

    const result = { symbol: key, company_name, report, reportError, generatedAt: new Date().toISOString() };
    stockReportCache.set(key, { ...result, fetchedAt: now });
    res.json(result);
  } catch (err) {
    console.error('Stock AI report error:', err.message);
    res.status(500).json({ error: 'Failed to generate report' });
  }
}

/**
 * GET /api/fund-ai-report?ticker=HDFC_MID_CAP&force=1
 */
export async function getFundAIReport(req, res) {
  const { ticker, force } = req.query;
  if (!ticker) return res.status(400).json({ error: 'ticker required' });

  const now = Date.now();
  const cached = fundReportCache.get(ticker);
  if (!force && cached && (now - cached.fetchedAt) < CACHE_TTL) {
    return res.json(cached);
  }

  try {
    // Fetch quality scores from DB
    const scoreResult = await db.query(
      `SELECT scheme_name, fund_house, fund_manager, scored_holdings, coverage_pct,
              overall_quality_score, piotroski_score, altman_z_score,
              profitability_score, financial_strength_score, earnings_quality_score_v2,
              growth_score, valuation_score, cagr_1y, cagr_3y, cagr_5y, cagr_10y, expense_ratio
       FROM fund_quality_scores WHERE fund_name = $1 LIMIT 1`,
      [ticker]
    );

    if (scoreResult.rows.length === 0) {
      return res.status(404).json({ error: 'Fund not found' });
    }
    const f = scoreResult.rows[0];

    // Fetch top 5 holdings from portfolio
    const holdingsResult = await db.query(
      `SELECT stock_name, percentage_of_total_portfolio
       FROM portfolio WHERE ticker = $1 AND asset_type = 'Equity'
       ORDER BY percentage_of_total_portfolio DESC LIMIT 5`,
      [ticker]
    );
    const topHoldings = holdingsResult.rows
      .map(h => `${h.stock_name} (${fmt(h.percentage_of_total_portfolio)}%)`)
      .join(', ') || 'N/A';

    const prompt = `You are a professional Indian mutual fund analyst. Write a concise analysis for ${f.scheme_name || ticker}.

FUND DATA:
- Fund House: ${f.fund_house || 'N/A'} | Fund Manager: ${f.fund_manager || 'N/A'}
- Expense Ratio: ${fmt(f.expense_ratio, 2)}% | Holdings Analyzed: ${f.scored_holdings ?? 'N/A'} (${fmt(f.coverage_pct, 0)}% coverage)
- CAGR: 1Y: ${fmt(f.cagr_1y)}% | 3Y: ${fmt(f.cagr_3y)}% | 5Y: ${fmt(f.cagr_5y)}%${f.cagr_10y ? ` | 10Y: ${fmt(f.cagr_10y)}%` : ''}

PORTFOLIO QUALITY SCORES:
- Overall Quality: ${f.overall_quality_score ?? 'N/A'}/100 | Piotroski: ${fmt(f.piotroski_score, 2)}/9 | Altman Z: ${fmt(f.altman_z_score)}
- Profitability: ${f.profitability_score ?? 'N/A'} | Financial Strength: ${f.financial_strength_score ?? 'N/A'} | Growth: ${f.growth_score ?? 'N/A'} | Valuation: ${f.valuation_score ?? 'N/A'}

TOP HOLDINGS: ${topHoldings}

Write exactly 3 paragraphs:
1. Portfolio quality — what the quality scores reveal about the stocks this fund holds
2. Performance analysis — CAGR across periods, expense ratio impact, consistency assessment
3. Suitability — which investor profile fits this fund, risk considerations, overall verdict

Under 200 words. Confident analyst tone, specific numbers, no bullet points.`;

    let report = null;
    let reportError = null;
    try {
      report = await callClaude(prompt);
    } catch (e) {
      reportError = e.response?.data?.error?.message || e.message;
    }

    const result = { ticker, scheme_name: f.scheme_name, report, reportError, generatedAt: new Date().toISOString() };
    fundReportCache.set(ticker, { ...result, fetchedAt: now });
    res.json(result);
  } catch (err) {
    console.error('Fund AI report error:', err.message);
    res.status(500).json({ error: 'Failed to generate fund report' });
  }
}
