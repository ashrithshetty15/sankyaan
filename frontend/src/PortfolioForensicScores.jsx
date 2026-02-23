import React, { useState, useEffect } from 'react';
import axios from 'axios';
import './StockDetail.css'; // Reuse the same styles

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

export default function PortfolioForensicScores({ ticker }) {
  const [forensicData, setForensicData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchForensicScores = async () => {
      if (!ticker) return;

      setLoading(true);
      setError(null);

      try {
        console.log(`📊 Fetching forensic scores for portfolio: ${ticker}`);
        const response = await axios.get(`${API_URL}/portfolio-forensics/${ticker}`);
        console.log('✅ Forensic scores:', response.data);
        setForensicData(response.data);
      } catch (err) {
        console.error('❌ Failed to fetch forensic scores:', err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchForensicScores();
  }, [ticker]);

  if (loading) {
    return (
      <div className="forensic-loading">
        <div className="loading-spinner"></div>
        <p>Calculating portfolio forensic scores...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="forensic-error">
        <p>❌ Failed to load forensic scores</p>
        <p className="error-detail">{error}</p>
      </div>
    );
  }

  if (!forensicData || !forensicData.scores) {
    return null; // Don't show anything if there's no data
  }

  if (forensicData.scoredHoldings === 0) {
    return (
      <div className="forensic-no-data">
        <p>⚠️ Unable to calculate forensic scores - no holdings matched with stock database</p>
        <p className="no-data-detail">This portfolio's holdings could not be linked to stocks in our database.</p>
      </div>
    );
  }

  // Low coverage warning
  const coveragePercent = parseFloat(forensicData.coveragePercentage);
  const hasLowCoverage = coveragePercent < 50;

  const getScoreClass = (score) => {
    if (score >= 80) return 'good';
    if (score >= 60) return 'medium';
    return 'poor';
  };

  const getQualityDescription = (score) => {
    if (score >= 80) return 'Excellent';
    if (score >= 70) return 'Good';
    if (score >= 50) return 'Average';
    return 'Below Average';
  };

  const getPiotroskiDescription = (score) => {
    if (score >= 7) return 'Strong';
    if (score >= 5) return 'Moderate';
    return 'Weak';
  };

  const getAltmanDescription = (score) => {
    if (score >= 3.0) return 'Safe Zone';
    if (score >= 1.8) return 'Grey Zone';
    return 'Distress Zone';
  };

  const scores = forensicData.scores;
  const cagr = forensicData.cagr || {};

  const getReturnColor = (value) => {
    if (value == null) return undefined;
    return value >= 0 ? '#22c55e' : '#ef4444';
  };

  const getReturnClass = (value) => {
    if (value == null) return '';
    return value >= 0 ? 'good' : 'poor';
  };

  const hasAnyCagr = cagr.cagr_1y != null || cagr.cagr_3y != null || cagr.cagr_5y != null || cagr.cagr_10y != null;

  return (
    <div className="forensic-scores-section">
      {/* Section Header */}
      <div className="section-header">
        <div className="section-icon">🔍</div>
        <div className="section-title">
          <h2>Portfolio Quality & Forensic Scores</h2>
          <p>Weighted average based on {forensicData.scoredHoldings} holdings ({forensicData.coveragePercentage}% coverage)</p>
          {hasLowCoverage && (
            <p className="coverage-warning">
              ⚠️ Low coverage - scores may not be fully representative of the entire portfolio
            </p>
          )}
        </div>
        {scores.overall_quality_score !== null && (
          <div className={`section-badge badge-${getScoreClass(scores.overall_quality_score)}`}>
            ⭐ {getQualityDescription(scores.overall_quality_score)}
          </div>
        )}
      </div>

      {/* Fund Manager */}
      {forensicData.fundManager && (
        <div className="fund-manager-row">
          <span className="fund-manager-label">
            Fund Manager{forensicData.fundManager.includes(';') ? 's' : ''}:
          </span>
          <span className="fund-manager-names">
            {forensicData.fundManager.split(';').map(name => name.trim()).join(' | ')}
          </span>
        </div>
      )}

      {/* Main Grid */}
      <div className="scores-grid">

        {/* PRIMARY SCORE (Featured) */}
        <div className={`primary-score score-bg-${getScoreClass(scores.overall_quality_score || 0)}`}>
          <div className="primary-label">Overall Quality Score</div>
          <div className="primary-value-wrap">
            <div className={`primary-score-num score-${getScoreClass(scores.overall_quality_score || 0)}`}>
              {scores.overall_quality_score !== null ? Math.round(scores.overall_quality_score) : 'N/A'}
            </div>
            <div className="primary-score-max">/100</div>
          </div>
          <div className={`primary-rating rating-${getScoreClass(scores.overall_quality_score || 0)}`}>
            {scores.overall_quality_score !== null ? getQualityDescription(scores.overall_quality_score) : 'Not Available'}
          </div>

          <div className="gauge-bar">
            <div
              className={`gauge-fill fill-${getScoreClass(scores.overall_quality_score || 0)}`}
              style={{ width: `${scores.overall_quality_score || 0}%` }}
            ></div>
          </div>
          <div className="gauge-markers">
            <span>0</span>
            <span>25</span>
            <span>50</span>
            <span>75</span>
            <span>100</span>
          </div>
        </div>

        {/* SECONDARY METRICS */}
        <div className="secondary-grid">
          <div className="metric-card">
            <div className={`metric-icon ${scores.piotroski_score >= 7 ? 'excellent' : 'warning'}`}>
              📊
            </div>
            <div className="metric-info">
              <div className="metric-label">Piotroski F-Score</div>
              <div className={`metric-value ${scores.piotroski_score >= 7 ? 'excellent' : 'warning'}`}>
                {scores.piotroski_score !== null ? `${Math.round(scores.piotroski_score)}/9` : 'N/A'}
              </div>
            </div>
            {scores.piotroski_score !== null && (
              <div className={`metric-badge ${scores.piotroski_score >= 7 ? 'excellent' : 'warning'}`}>
                {getPiotroskiDescription(scores.piotroski_score)}
              </div>
            )}
          </div>

          <div className="metric-card">
            <div className={`metric-icon ${scores.altman_z_score >= 3.0 ? 'excellent' : 'warning'}`}>
              ⚠️
            </div>
            <div className="metric-info">
              <div className="metric-label">Altman Z-Score</div>
              <div className={`metric-value ${scores.altman_z_score >= 3.0 ? 'excellent' : 'warning'}`}>
                {scores.altman_z_score != null && !isNaN(parseFloat(scores.altman_z_score)) ? parseFloat(scores.altman_z_score).toFixed(2) : 'N/A'}
              </div>
            </div>
            {scores.altman_z_score !== null && !isNaN(parseFloat(scores.altman_z_score)) && (
              <div className={`metric-badge ${scores.altman_z_score >= 3.0 ? 'excellent' : 'warning'}`}>
                {getAltmanDescription(scores.altman_z_score)}
              </div>
            )}
          </div>
        </div>

      </div>

      {/* 5-PILLAR DETAILED METRICS */}
      <div className="detailed-row">
        {[
          { key: 'profitability_score', label: 'Profitability', desc: 'ROE, ROCE, Operating & Net Margins', icons: ['💚', '💛', '❤️'] },
          { key: 'financial_strength_score', label: 'Financial Strength', desc: 'Piotroski, Altman-Z, D/E ratio, Interest Coverage', icons: ['🛡️', '⚠️', '🔴'] },
          { key: 'earnings_quality_score_v2', label: 'Earnings Quality', desc: 'Cash flow quality, FCF Yield, Accruals ratio', icons: ['✨', '⭐', '💫'] },
          { key: 'growth_score', label: 'Growth', desc: 'Revenue & EPS Growth YoY, Margin Expansion', icons: ['📈', '📊', '📉'] },
          { key: 'valuation_score', label: 'Valuation', desc: 'PE ratio, PB ratio, Earnings Yield', icons: ['💰', '💵', '💸'] },
        ].map(({ key, label, desc, icons }) => {
          const val = scores[key] != null ? parseFloat(scores[key]) : null;
          return (
            <div key={key} className="detail-card">
              <div className="detail-header">
                <div className="detail-label">{label}</div>
                <div className="detail-trend">
                  {val >= 80 ? icons[0] : val >= 60 ? icons[1] : icons[2]}
                </div>
              </div>
              <div className="detail-score-wrap">
                <div className={`detail-score ${getScoreClass(val || 0)}`}>
                  {val !== null ? Math.round(val) : 'N/A'}
                </div>
                <div className="detail-max">/100</div>
              </div>
              <div className="detail-desc">{desc}</div>
              {val !== null && (
                <div className="mini-gauge">
                  <div
                    className={`mini-gauge-fill ${getScoreClass(val)}`}
                    style={{ width: `${val}%` }}
                  ></div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* CAGR / Returns Section */}
      {hasAnyCagr && (
        <>
          <div className="cagr-section-header">
            <span className="cagr-icon">📈</span>
            <span className="cagr-title">Fund Returns (CAGR)</span>
          </div>
          <div className="cagr-cards-row">
            {[
              { key: 'cagr_1y', label: '1 Year' },
              { key: 'cagr_3y', label: '3 Year' },
              { key: 'cagr_5y', label: '5 Year' },
              { key: 'cagr_10y', label: '10 Year' },
            ].map(({ key, label }) => {
              const val = cagr[key] != null ? parseFloat(cagr[key]) : null;
              return (
                <div key={key} className="cagr-card">
                  <div className="cagr-label">{label}</div>
                  <div
                    className={`cagr-value ${getReturnClass(val)}`}
                    style={{ color: getReturnColor(val) }}
                  >
                    {val != null ? `${val >= 0 ? '+' : ''}${val.toFixed(1)}%` : 'N/A'}
                  </div>
                  <div className="cagr-sublabel">CAGR</div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
