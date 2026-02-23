import React, { useState, useEffect } from 'react';
import axios from 'axios';
import './PortfolioOverlap.css';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

const FUND_COLORS = ['#4D96FF', '#FF6B6B', '#6BCB77', '#FFD93D', '#9B5DE5'];

const getOverlapColor = (pct) => {
  if (pct >= 60) return '#ef4444';
  if (pct >= 40) return '#f97316';
  if (pct >= 20) return '#eab308';
  return '#22c55e';
};

const getDivColor = (score) => {
  if (score >= 80) return '#22c55e';
  if (score >= 60) return '#eab308';
  if (score >= 40) return '#f97316';
  return '#ef4444';
};

const getOverlapBg = (pct) => {
  if (pct >= 60) return 'rgba(239, 68, 68, 0.15)';
  if (pct >= 40) return 'rgba(249, 115, 22, 0.15)';
  if (pct >= 20) return 'rgba(234, 179, 8, 0.12)';
  return 'rgba(34, 197, 94, 0.1)';
};

const shortName = (name) => {
  const words = name.split(/\s+/);
  return words.length > 4 ? words.slice(0, 4).join(' ') + '...' : name;
};

const getPairPct = (matrix, a, b) => matrix[a]?.[b] ?? matrix[b]?.[a] ?? null;

export default function PortfolioOverlap() {
  const [fundHouses, setFundHouses] = useState([]);
  const [allTickers, setAllTickers] = useState([]);
  const [slots, setSlots] = useState([
    { fundHouse: '', search: '', selectedFund: null, suggestions: [], showDropdown: false },
    { fundHouse: '', search: '', selectedFund: null, suggestions: [], showDropdown: false },
  ]);
  const [overlapData, setOverlapData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [expandedPair, setExpandedPair] = useState(null);
  const [expandedUnique, setExpandedUnique] = useState(null);

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
    setOverlapData(null);
  };

  const addSlot = () => {
    if (slots.length < 5) {
      setSlots(prev => [...prev, { fundHouse: '', search: '', selectedFund: null, suggestions: [], showDropdown: false }]);
    }
  };

  const canAnalyze = slots.filter(s => s.selectedFund).length >= 2;

  const handleAnalyze = async () => {
    const selectedFunds = slots.filter(s => s.selectedFund).map(s => s.selectedFund.ticker);
    if (selectedFunds.length < 2) return;

    setLoading(true);
    setError(null);
    setOverlapData(null);
    try {
      const res = await axios.get(`${API_URL}/portfolio-overlap`, {
        params: { tickers: selectedFunds.join(',') }
      });
      setOverlapData(res.data);
    } catch (err) {
      setError('Failed to analyze portfolio overlap');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const fundNames = overlapData ? overlapData.funds.map(f => f.fundName) : [];

  return (
    <div className="portfolio-overlap">
      {/* Fund Selector */}
      <div className="po-selector">
        <div className="po-selector-slots">
          {slots.map((slot, idx) => (
            <div key={idx} className="po-slot">
              <div className="po-slot-header">
                <span className="po-slot-label" style={{ color: FUND_COLORS[idx] }}>Fund {idx + 1}</span>
                <button className="po-slot-remove" onClick={() => removeSlot(idx)} title="Clear">&#10005;</button>
              </div>

              <select
                className="po-slot-fund-house"
                value={slot.fundHouse}
                onChange={(e) => updateSlot(idx, { fundHouse: e.target.value, search: '', selectedFund: null })}
              >
                <option value="">All Fund Houses</option>
                {fundHouses.map(h => <option key={h} value={h}>{h}</option>)}
              </select>

              <div className="po-search-wrap">
                <input
                  type="text"
                  className="po-search-input"
                  placeholder="Search fund..."
                  value={slot.search}
                  onChange={(e) => handleSearchChange(idx, e.target.value)}
                  onFocus={() => { if (slot.search || !slot.selectedFund) handleSearchChange(idx, slot.search); }}
                  onBlur={() => setTimeout(() => updateSlot(idx, { showDropdown: false }), 200)}
                />
                {slot.showDropdown && slot.suggestions.length > 0 && (
                  <div className="po-dropdown">
                    {slot.suggestions.map(t => (
                      <div key={t.ticker} className="po-dropdown-item" onMouseDown={() => selectFund(idx, t)}>
                        <div className="po-dd-name">{t.fund_name}</div>
                        <div className="po-dd-house">{t.fund_house}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {slot.selectedFund && (
                <div className="po-slot-selected" style={{ borderColor: FUND_COLORS[idx], background: `${FUND_COLORS[idx]}15` }}>
                  {slot.selectedFund.fund_name}
                </div>
              )}
            </div>
          ))}

          {slots.length < 5 && (
            <button className="po-add-slot-btn" onClick={addSlot}>+ Add Fund</button>
          )}
        </div>

        <button
          className={`po-analyze-btn ${canAnalyze ? 'active' : ''}`}
          onClick={handleAnalyze}
          disabled={!canAnalyze || loading}
        >
          {loading ? 'Analyzing...' : 'Analyze Overlap'}
        </button>
      </div>

      {error && <div className="po-error">{error}</div>}

      {/* Results */}
      {overlapData && (
        <div className="po-results">

          {/* Diversification Score Banner */}
          <div className="div-banner">
            <div className="div-banner-top">
              <span className="div-label">Diversification Score</span>
              <span className="div-value" style={{ color: getDivColor(overlapData.stats.diversificationScore) }}>
                {overlapData.stats.diversificationScore}
                <span className="div-max">/100</span>
              </span>
            </div>
            <div className="div-bar">
              <div
                className="div-bar-fill"
                style={{
                  width: `${overlapData.stats.diversificationScore}%`,
                  background: getDivColor(overlapData.stats.diversificationScore)
                }}
              />
            </div>
            <p className="div-note">
              {overlapData.stats.diversificationScore >= 70
                ? 'Good diversification across your selected funds'
                : overlapData.stats.diversificationScore >= 40
                  ? 'Moderate overlap — consider diversifying further'
                  : 'High overlap — these funds hold many of the same stocks'}
            </p>
          </div>

          {/* Summary Cards */}
          <div className="po-summary-cards">
            {overlapData.funds.map((fund, i) => (
              <div key={i} className="po-fund-card" style={{ borderTopColor: FUND_COLORS[i] }}>
                <div className="pfc-name" title={fund.fundName}>{shortName(fund.fundName)}</div>
                <div className="pfc-stats">
                  <div className="pfc-stat">
                    <span className="pfc-big" style={{ color: getOverlapColor(fund.overlapPct) }}>
                      {fund.overlapPct.toFixed(1)}%
                    </span>
                    <span className="pfc-label">overlap</span>
                  </div>
                  <div className="pfc-stat">
                    <span className="pfc-big">{fund.equityCount}</span>
                    <span className="pfc-label">holdings</span>
                  </div>
                </div>
                <div className="pfc-common">{fund.commonWeight.toFixed(1)}% NAV in shared stocks</div>
              </div>
            ))}
          </div>

          {/* Overlap Matrix */}
          {fundNames.length >= 2 && (
            <>
              <div className="po-section-title">Pairwise Overlap Matrix</div>
              <div className="po-matrix-wrap">
                <table className="po-matrix">
                  <thead>
                    <tr>
                      <th></th>
                      {fundNames.map((name, i) => (
                        <th key={i} style={{ color: FUND_COLORS[i] }}>{shortName(name)}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {fundNames.map((rowName, i) => (
                      <tr key={i}>
                        <td className="po-matrix-row-label" style={{ color: FUND_COLORS[i] }}>{shortName(rowName)}</td>
                        {fundNames.map((colName, j) => {
                          if (i === j) return <td key={j} className="po-matrix-diag">&mdash;</td>;
                          const pct = getPairPct(overlapData.stats.pairwiseMatrix, rowName, colName);
                          return (
                            <td key={j} className="po-matrix-cell" style={{ background: pct != null ? getOverlapBg(pct) : 'transparent' }}>
                              {pct != null ? (
                                <span style={{ color: getOverlapColor(pct) }}>{pct.toFixed(1)}%</span>
                              ) : '—'}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {/* Common Holdings Table */}
          {overlapData.allFundsOverlap.count > 0 && (
            <>
              <div className="po-section-title">
                Common Holdings — {overlapData.allFundsOverlap.count} stocks held by all {fundNames.length} funds
              </div>
              <div className="po-common-table-wrap">
                <table className="po-common-table">
                  <thead>
                    <tr>
                      <th className="po-th-rank">#</th>
                      <th className="po-th-stock">Stock</th>
                      <th className="po-th-sector">Sector</th>
                      {fundNames.map((name, i) => (
                        <th key={i} className="po-th-weight" style={{ color: FUND_COLORS[i] }}>{shortName(name)}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {overlapData.allFundsOverlap.stocks.map((stock, idx) => {
                      const maxWeight = Math.max(...Object.values(stock.weights));
                      return (
                        <tr key={idx} className="po-common-row">
                          <td className="po-td-rank">{idx + 1}</td>
                          <td className="po-td-stock">{stock.name}</td>
                          <td className="po-td-sector">{stock.sector}</td>
                          {fundNames.map((fn, i) => {
                            const w = stock.weights[fn];
                            return (
                              <td key={i} className="po-td-weight">
                                {w != null ? (
                                  <div className="po-weight-cell">
                                    <div className="po-weight-bar-bg">
                                      <div
                                        className="po-weight-bar-fill"
                                        style={{
                                          width: `${(w / maxWeight) * 100}%`,
                                          background: FUND_COLORS[i]
                                        }}
                                      />
                                    </div>
                                    <span className="po-weight-num" style={{ color: FUND_COLORS[i] }}>{w.toFixed(2)}%</span>
                                  </div>
                                ) : '—'}
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {overlapData.allFundsOverlap.count === 0 && (
            <div className="po-no-common">
              No stocks are held in common across all {fundNames.length} selected funds.
            </div>
          )}

          {/* Pairwise-Only Section (3+ funds) */}
          {overlapData.pairwiseOverlap.length > 0 && (
            <>
              <div className="po-section-title">Pairwise Shared Holdings</div>
              {overlapData.pairwiseOverlap.map((pair, idx) => {
                const fiIdx = fundNames.indexOf(pair.fundA);
                const fjIdx = fundNames.indexOf(pair.fundB);
                return (
                  <div key={idx} className="po-pair-group">
                    <button
                      className="po-pair-header"
                      onClick={() => setExpandedPair(expandedPair === idx ? null : idx)}
                    >
                      <span className="po-pair-funds">
                        <span style={{ color: FUND_COLORS[fiIdx] }}>{shortName(pair.fundA)}</span>
                        {' & '}
                        <span style={{ color: FUND_COLORS[fjIdx] }}>{shortName(pair.fundB)}</span>
                      </span>
                      <span className="po-pair-count">{pair.exclusiveCount} exclusive</span>
                      <span className="po-pair-pct" style={{ color: getOverlapColor(pair.overlapPct) }}>
                        {pair.overlapPct.toFixed(1)}%
                      </span>
                      <span className="po-pair-chevron">{expandedPair === idx ? '\u25B2' : '\u25BC'}</span>
                    </button>
                    {expandedPair === idx && pair.exclusiveStocks.length > 0 && (
                      <div className="po-pair-stocks">
                        {pair.exclusiveStocks.map((stock, si) => (
                          <div key={si} className="po-pair-stock-row">
                            <span className="po-ps-name">{stock.name}</span>
                            <span className="po-ps-sector">{stock.sector}</span>
                            {[pair.fundA, pair.fundB].map((fn, j) => (
                              <span
                                key={j}
                                className="po-ps-weight"
                                style={{ color: FUND_COLORS[fundNames.indexOf(fn)] }}
                              >
                                {stock.weights[fn]?.toFixed(2) ?? '—'}%
                              </span>
                            ))}
                          </div>
                        ))}
                      </div>
                    )}
                    {expandedPair === idx && pair.exclusiveStocks.length === 0 && (
                      <div className="po-pair-empty">No exclusively shared stocks between this pair</div>
                    )}
                  </div>
                );
              })}
            </>
          )}

          {/* Unique Holdings */}
          <div className="po-section-title">Unique Holdings</div>
          {overlapData.uniqueHoldings.map((fundUnique, i) => (
            <div key={i} className="po-unique-group">
              <button
                className="po-unique-header"
                onClick={() => setExpandedUnique(expandedUnique === i ? null : i)}
                style={{ borderLeftColor: FUND_COLORS[i] }}
              >
                <span className="po-uh-name" style={{ color: FUND_COLORS[i] }}>{shortName(fundUnique.fundName)}</span>
                <span className="po-uh-count">{fundUnique.stocks.length} unique</span>
                <span className="po-uh-chevron">{expandedUnique === i ? '\u25B2' : '\u25BC'}</span>
              </button>
              {expandedUnique === i && fundUnique.stocks.length > 0 && (
                <div className="po-unique-stocks">
                  {fundUnique.stocks.map((s, j) => (
                    <div key={j} className="po-unique-stock-row">
                      <span className="po-us-name">{s.name}</span>
                      <span className="po-us-sector">{s.sector}</span>
                      <span className="po-us-weight">{s.weight.toFixed(2)}%</span>
                    </div>
                  ))}
                </div>
              )}
              {expandedUnique === i && fundUnique.stocks.length === 0 && (
                <div className="po-unique-empty">All holdings in this fund overlap with others</div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
