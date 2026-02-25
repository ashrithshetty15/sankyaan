import React, { useState, useEffect } from 'react';
import axios from 'axios';
import './FundComparison.css';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

const getScoreColor = (score) => {
  if (score == null) return '#545f72';
  if (score >= 80) return '#22c55e';
  if (score >= 60) return '#eab308';
  if (score >= 40) return '#f97316';
  return '#ef4444';
};

const getReturnColor = (val) => {
  if (val == null) return '#545f72';
  return val >= 0 ? '#22c55e' : '#ef4444';
};

const SECTOR_COLORS = [
  '#2E86AB', '#FF6B6B', '#FFD93D', '#6BCB77', '#4D96FF',
  '#FF8C42', '#9B5DE5', '#00C2A8', '#F15BB5', '#7BD389'
];

export default function FundComparison() {
  const [fundHouses, setFundHouses] = useState([]);
  const [allTickers, setAllTickers] = useState([]);
  const [slots, setSlots] = useState([
    { fundHouse: '', search: '', selectedFund: null, suggestions: [], showDropdown: false },
    { fundHouse: '', search: '', selectedFund: null, suggestions: [], showDropdown: false },
  ]);
  const [comparisonData, setComparisonData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Fetch fund houses on mount
  useEffect(() => {
    axios.get(`${API_URL}/fundhouses`).then(res => setFundHouses(res.data.fundHouses || [])).catch(() => {});
    axios.get(`${API_URL}/tickers`).then(res => setAllTickers(res.data.tickersWithFunds || [])).catch(() => {});
  }, []);

  const updateSlot = (idx, updates) => {
    setSlots(prev => prev.map((s, i) => i === idx ? { ...s, ...updates } : s));
  };

  const handleSearchChange = (idx, value) => {
    const slot = slots[idx];
    const filtered = allTickers.filter(t => {
      const matchesHouse = !slot.fundHouse || t.fund_house === slot.fundHouse;
      const matchesSearch = !value || t.fund_name.toLowerCase().includes(value.toLowerCase()) ||
        (t.ticker && t.ticker.toLowerCase().includes(value.toLowerCase()));
      return matchesHouse && matchesSearch;
    }).slice(0, 15);
    updateSlot(idx, { search: value, suggestions: filtered, showDropdown: true, selectedFund: null });
  };

  const selectFund = (idx, ticker) => {
    const fund = allTickers.find(t => t.ticker === ticker.ticker);
    updateSlot(idx, {
      selectedFund: fund,
      search: fund?.fund_name || fund?.ticker || '',
      showDropdown: false,
      suggestions: []
    });
  };

  const removeSlot = (idx) => {
    if (slots.length <= 2) {
      updateSlot(idx, { fundHouse: '', search: '', selectedFund: null, suggestions: [], showDropdown: false });
    } else {
      setSlots(prev => prev.filter((_, i) => i !== idx));
    }
    setComparisonData(null);
  };

  const addSlot = () => {
    if (slots.length < 3) {
      setSlots(prev => [...prev, { fundHouse: '', search: '', selectedFund: null, suggestions: [], showDropdown: false }]);
    }
  };

  const canCompare = slots.filter(s => s.selectedFund).length >= 2;

  const handleCompare = async () => {
    const selectedFunds = slots.filter(s => s.selectedFund).map(s => s.selectedFund.ticker);
    if (selectedFunds.length < 2) return;

    setLoading(true);
    setError(null);
    try {
      const res = await axios.get(`${API_URL}/fund-comparison`, {
        params: { tickers: selectedFunds.join(',') }
      });
      setComparisonData(res.data);
    } catch (err) {
      setError('Failed to load comparison data');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fund-comparison">
      {/* Fund Selector */}
      <div className="comparison-selector">
        <div className="selector-slots">
          {slots.map((slot, idx) => (
            <div key={idx} className="selector-slot">
              <div className="slot-header">
                <span className="slot-label">Fund {idx + 1}</span>
                <button className="slot-remove" onClick={() => removeSlot(idx)} title="Clear">✕</button>
              </div>

              {/* Fund house filter */}
              <select
                className="slot-fund-house"
                value={slot.fundHouse}
                onChange={(e) => {
                  updateSlot(idx, { fundHouse: e.target.value, search: '', selectedFund: null });
                }}
              >
                <option value="">All Fund Houses</option>
                {fundHouses.map(h => <option key={h} value={h}>{h}</option>)}
              </select>

              {/* Search input */}
              <div className="slot-search-wrap">
                <input
                  type="text"
                  className="slot-search-input"
                  placeholder="Search fund..."
                  value={slot.search}
                  onChange={(e) => handleSearchChange(idx, e.target.value)}
                  onFocus={() => {
                    if (slot.search || !slot.selectedFund) {
                      handleSearchChange(idx, slot.search);
                    }
                  }}
                  onBlur={() => setTimeout(() => updateSlot(idx, { showDropdown: false }), 200)}
                />
                {slot.showDropdown && slot.suggestions.length > 0 && (
                  <div className="slot-dropdown">
                    {slot.suggestions.map(t => (
                      <div
                        key={t.ticker}
                        className="slot-dropdown-item"
                        onMouseDown={() => selectFund(idx, t)}
                      >
                        <div className="dropdown-fund-name">{t.fund_name}</div>
                        <div className="dropdown-fund-house">{t.fund_house}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {slot.selectedFund && (
                <div className="slot-selected">
                  {slot.selectedFund.fund_name}
                </div>
              )}
            </div>
          ))}

          {slots.length < 3 && (
            <button className="add-slot-btn" onClick={addSlot}>
              + Add Fund
            </button>
          )}
        </div>

        <button
          className={`compare-btn ${canCompare ? 'active' : ''}`}
          onClick={handleCompare}
          disabled={!canCompare || loading}
        >
          {loading ? 'Comparing...' : 'Compare'}
        </button>
      </div>

      {error && <div className="comparison-error">{error}</div>}

      {/* Comparison Results */}
      {comparisonData && (
        <div className="comparison-results">

          {/* Fund Headers */}
          <div className="comparison-row fund-headers" style={{ gridTemplateColumns: `200px repeat(${comparisonData.funds.length}, 1fr)` }}>
            <div className="row-label"></div>
            {comparisonData.funds.map((fund, i) => (
              <div key={i} className="fund-header-cell">
                <div className="fund-header-name">{fund.schemeName || fund.fundName}</div>
                <div className="fund-header-house">{fund.fundHouse}</div>
                {fund.fundManager && (
                  <div className="fund-header-manager">
                    {fund.fundManager.split(';').map(n => n.trim()).join(' | ')}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Overall Quality Score */}
          <div className="comparison-section-title">Quality Scores</div>
          <div className="comparison-row" style={{ gridTemplateColumns: `200px repeat(${comparisonData.funds.length}, 1fr)` }}>
            <div className="row-label">Overall Quality</div>
            {comparisonData.funds.map((fund, i) => {
              const val = fund.scores.overall_quality_score;
              return (
                <div key={i} className="score-cell">
                  <div className="score-big" style={{ color: getScoreColor(val) }}>
                    {val != null ? Math.round(val) : 'N/A'}
                  </div>
                  <div className="score-max">/100</div>
                  {val != null && (
                    <div className="score-bar">
                      <div className="score-bar-fill" style={{ width: `${val}%`, background: getScoreColor(val) }}></div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* 5-Pillar Scores */}
          {[
            { key: 'profitability_score', label: 'Profitability' },
            { key: 'financial_strength_score', label: 'Financial Strength' },
            { key: 'earnings_quality_score_v2', label: 'Earnings Quality' },
            { key: 'growth_score', label: 'Growth' },
            { key: 'valuation_score', label: 'Valuation' },
          ].map(({ key, label }) => (
            <div key={key} className="comparison-row" style={{ gridTemplateColumns: `200px repeat(${comparisonData.funds.length}, 1fr)` }}>
              <div className="row-label">{label}</div>
              {comparisonData.funds.map((fund, i) => {
                const val = fund.scores[key];
                return (
                  <div key={i} className="score-cell mini">
                    <div className="score-value" style={{ color: getScoreColor(val) }}>
                      {val != null ? Math.round(val) : 'N/A'}
                    </div>
                    {val != null && (
                      <div className="score-bar">
                        <div className="score-bar-fill" style={{ width: `${val}%`, background: getScoreColor(val) }}></div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ))}

          {/* Expense Ratio */}
          <div className="comparison-row" style={{ gridTemplateColumns: `200px repeat(${comparisonData.funds.length}, 1fr)` }}>
            <div className="row-label">Expense Ratio</div>
            {comparisonData.funds.map((fund, i) => {
              const er = fund.expenseRatio;
              const erColor = er == null ? '#545f72' : er <= 0.5 ? '#22c55e' : er <= 1.0 ? '#eab308' : er <= 1.5 ? '#f97316' : '#ef4444';
              return (
                <div key={i} className="score-cell mini">
                  <div className="score-value" style={{ color: erColor }}>
                    {er != null ? `${er.toFixed(2)}%` : 'N/A'}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Piotroski & Altman Z */}
          <div className="comparison-row" style={{ gridTemplateColumns: `200px repeat(${comparisonData.funds.length}, 1fr)` }}>
            <div className="row-label">Piotroski F-Score</div>
            {comparisonData.funds.map((fund, i) => {
              const val = fund.scores.piotroski_score;
              return (
                <div key={i} className="score-cell mini">
                  <div className="score-value" style={{ color: val >= 7 ? '#22c55e' : val >= 5 ? '#eab308' : '#ef4444' }}>
                    {val != null ? val.toFixed(1) : 'N/A'}<span className="score-suffix">/9</span>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="comparison-row" style={{ gridTemplateColumns: `200px repeat(${comparisonData.funds.length}, 1fr)` }}>
            <div className="row-label">Altman Z-Score</div>
            {comparisonData.funds.map((fund, i) => {
              const val = fund.scores.altman_z_score;
              return (
                <div key={i} className="score-cell mini">
                  <div className="score-value" style={{ color: val >= 3 ? '#22c55e' : val >= 1.8 ? '#eab308' : '#ef4444' }}>
                    {val != null ? val.toFixed(2) : 'N/A'}
                  </div>
                </div>
              );
            })}
          </div>

          {/* CAGR Returns */}
          <div className="comparison-section-title">Returns (CAGR)</div>
          {[
            { key: 'cagr_1y', label: '1 Year' },
            { key: 'cagr_3y', label: '3 Year' },
            { key: 'cagr_5y', label: '5 Year' },
          ].map(({ key, label }) => (
            <div key={key} className="comparison-row" style={{ gridTemplateColumns: `200px repeat(${comparisonData.funds.length}, 1fr)` }}>
              <div className="row-label">{label}</div>
              {comparisonData.funds.map((fund, i) => {
                const val = fund.cagr[key];
                return (
                  <div key={i} className="score-cell mini">
                    <div className="cagr-val" style={{ color: getReturnColor(val) }}>
                      {val != null ? `${val >= 0 ? '+' : ''}${val.toFixed(1)}%` : 'N/A'}
                    </div>
                  </div>
                );
              })}
            </div>
          ))}

          {/* Sector Exposure */}
          <div className="comparison-section-title">Sector Exposure (Top 5)</div>
          <div className="comparison-row sectors-row" style={{ gridTemplateColumns: `200px repeat(${comparisonData.funds.length}, 1fr)` }}>
            <div className="row-label"></div>
            {comparisonData.funds.map((fund, i) => (
              <div key={i} className="sector-cell">
                {fund.sectors.slice(0, 5).map((sec, j) => (
                  <div key={j} className="sector-item">
                    <div className="sector-bar-wrap">
                      <div className="sector-bar-bg">
                        <div
                          className="sector-bar-fill"
                          style={{ width: `${Math.min(sec.percentage * 2, 100)}%`, background: SECTOR_COLORS[j] }}
                        ></div>
                      </div>
                      <span className="sector-pct">{sec.percentage.toFixed(1)}%</span>
                    </div>
                    <div className="sector-name">{sec.sector}</div>
                  </div>
                ))}
              </div>
            ))}
          </div>

          {/* Top Holdings */}
          <div className="comparison-section-title">Top 10 Holdings</div>
          <div className="comparison-row holdings-row" style={{ gridTemplateColumns: `200px repeat(${comparisonData.funds.length}, 1fr)` }}>
            <div className="row-label"></div>
            {comparisonData.funds.map((fund, i) => (
              <div key={i} className="holdings-cell">
                {fund.topHoldings.map((h, j) => (
                  <div key={j} className="holding-item">
                    <div className="holding-name">{h.name}</div>
                    <div className="holding-pct">{h.percentage.toFixed(2)}%</div>
                  </div>
                ))}
              </div>
            ))}
          </div>

          {/* Holdings Overlap */}
          {comparisonData.overlap && comparisonData.overlap.commonCount > 0 && (
            <>
              <div className="comparison-section-title">
                Holdings Overlap — {comparisonData.overlap.commonCount} stocks in common ({comparisonData.overlap.overlapPercentage}%)
              </div>
              <div className="overlap-grid">
                {comparisonData.overlap.commonStocks.slice(0, 15).map((stock, i) => (
                  <div key={i} className="overlap-item">
                    <div className="overlap-name">{stock.name}</div>
                    <div className="overlap-weights">
                      {Object.entries(stock.weights).map(([fund, pct], j) => (
                        <span key={j} className="overlap-weight" style={{ color: SECTOR_COLORS[j] }}>
                          {pct.toFixed(1)}%
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
