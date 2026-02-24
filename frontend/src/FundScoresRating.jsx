import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import './FundScoresRating.css';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

export default function FundScoresRating({ onFundClick }) {
  const [funds, setFunds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [sortConfig, setSortConfig] = useState({ key: 'overall_quality_score', direction: 'desc' });
  const [filterHouse, setFilterHouse] = useState('');
  const [fundHouses, setFundHouses] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [minQuality, setMinQuality] = useState('');
  const [minPiotroski, setMinPiotroski] = useState('');
  const [altmanBand, setAltmanBand] = useState('');
  const [minCagr1y, setMinCagr1y] = useState('');
  const [minCagr3y, setMinCagr3y] = useState('');
  const [minCagr5y, setMinCagr5y] = useState('');

  const activeFilterCount = [minQuality, minPiotroski, altmanBand, minCagr1y, minCagr3y, minCagr5y].filter(Boolean).length;

  const clearAllFilters = () => {
    setMinQuality('');
    setMinPiotroski('');
    setAltmanBand('');
    setMinCagr1y('');
    setMinCagr3y('');
    setMinCagr5y('');
  };

  const fetchRatings = async () => {
    try {
      setLoading(true);
      setError(null);
      const params = filterHouse ? { fundHouse: filterHouse } : {};
      const response = await axios.get(`${API_URL}/fund-ratings`, { params });
      const data = response.data;
      setFunds(data.funds || []);
      setLastUpdated(data.lastUpdated || null);

      // Extract unique fund houses from full unfiltered data for the filter dropdown
      if (!filterHouse && data.funds) {
        const houses = [...new Set(data.funds.map(f => f.fund_house).filter(Boolean))].sort();
        setFundHouses(houses);
      }
    } catch (err) {
      console.error('Failed to fetch fund ratings:', err);
      setError('Failed to load fund ratings. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchRatings(); }, [filterHouse]);

  const handleRefresh = async () => {
    try {
      setRefreshing(true);
      setError(null);
      await axios.post(`${API_URL}/fund-ratings/refresh`);
      // Reload from DB after refresh
      await fetchRatings();
    } catch (err) {
      console.error('Refresh failed:', err);
      setError('Refresh failed. Please try again.');
    } finally {
      setRefreshing(false);
    }
  };

  const handleSort = (key) => {
    setSortConfig(prev => ({
      key,
      direction: prev.key === key && prev.direction === 'desc' ? 'asc' : 'desc'
    }));
  };

  const getSortedFunds = () => {
    const filtered = funds.filter(f => {
      // Text search
      if (searchTerm) {
        const term = searchTerm.toLowerCase();
        if (!(f.scheme_name?.toLowerCase().includes(term) ||
              f.ticker?.toLowerCase().includes(term) ||
              f.fund_house?.toLowerCase().includes(term))) return false;
      }
      // Quality score minimum
      if (minQuality && (f.overall_quality_score == null || parseFloat(f.overall_quality_score) < parseFloat(minQuality))) return false;
      // Piotroski minimum
      if (minPiotroski && (f.piotroski_score == null || parseFloat(f.piotroski_score) < parseFloat(minPiotroski))) return false;
      // Altman Z band
      if (altmanBand === 'safe' && (f.altman_z_score == null || parseFloat(f.altman_z_score) < 3)) return false;
      if (altmanBand === 'grey' && (f.altman_z_score == null || parseFloat(f.altman_z_score) < 1.8 || parseFloat(f.altman_z_score) >= 3)) return false;
      if (altmanBand === 'distress' && (f.altman_z_score == null || parseFloat(f.altman_z_score) >= 1.8)) return false;
      // CAGR minimums
      if (minCagr1y && (f.cagr_1y == null || parseFloat(f.cagr_1y) < parseFloat(minCagr1y))) return false;
      if (minCagr3y && (f.cagr_3y == null || parseFloat(f.cagr_3y) < parseFloat(minCagr3y))) return false;
      if (minCagr5y && (f.cagr_5y == null || parseFloat(f.cagr_5y) < parseFloat(minCagr5y))) return false;
      return true;
    });

    return [...filtered].sort((a, b) => {
      const aVal = a[sortConfig.key] != null ? parseFloat(a[sortConfig.key]) : -Infinity;
      const bVal = b[sortConfig.key] != null ? parseFloat(b[sortConfig.key]) : -Infinity;
      return sortConfig.direction === 'desc' ? bVal - aVal : aVal - bVal;
    });
  };

  const getQualityColor = (score) => {
    if (score >= 80) return '#22c55e';
    if (score >= 60) return '#eab308';
    if (score >= 40) return '#f97316';
    return '#ef4444';
  };

  const getPiotroskiColor = (score) => {
    const pct = (score / 9) * 100;
    return getQualityColor(pct);
  };

  const getReturnColor = (value) => {
    if (value == null) return undefined;
    return value >= 0 ? '#22c55e' : '#ef4444';
  };

  const getAltmanColor = (score) => {
    if (score >= 3) return '#22c55e';
    if (score >= 1.8) return '#eab308';
    return '#ef4444';
  };

  const getQualityLabel = (score) => {
    if (score >= 80) return 'Excellent';
    if (score >= 70) return 'Good';
    if (score >= 50) return 'Average';
    return 'Below Avg';
  };

  const SortIndicator = ({ col }) => {
    if (sortConfig.key !== col) return <span className="sort-inactive">↕</span>;
    return <span className="sort-active">{sortConfig.direction === 'desc' ? '↓' : '↑'}</span>;
  };

  const sortedFunds = getSortedFunds();

  if (loading) {
    return (
      <div className="fund-ratings-container">
        <div className="ratings-header">
          <h2>Fund Scores Rating</h2>
          <p>Ranking all mutual funds by portfolio quality</p>
        </div>
        <div className="ratings-loading">
          <div className="loading-spinner-large"></div>
          <p>Loading fund ratings...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="fund-ratings-container">
        <div className="ratings-header">
          <h2>Fund Scores Rating</h2>
        </div>
        <div className="ratings-error">{error}</div>
      </div>
    );
  }

  if (!loading && funds.length === 0) {
    return (
      <div className="fund-ratings-container">
        <div className="ratings-header">
          <div className="ratings-title-block">
            <h2>Fund Scores Rating</h2>
            <p className="ratings-subtitle">No cached ratings yet</p>
          </div>
        </div>
        <div className="ratings-empty-db">
          <p>Scores have not been computed yet.</p>
          <p>Click the button below to calculate and store fund ratings (~30 seconds, done once).</p>
          <button
            className={`refresh-btn ${refreshing ? 'refreshing' : ''}`}
            onClick={handleRefresh}
            disabled={refreshing}
          >
            {refreshing ? '⏳ Computing...' : '▶ Compute Fund Ratings'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fund-ratings-container">
      <div className="ratings-header">
        <div className="ratings-title-block">
          <h2>Fund Scores Rating</h2>
          <p className="ratings-subtitle">
            {sortedFunds.length} funds ranked by weighted portfolio quality score
          </p>
        </div>
        <div className="ratings-header-right">
          <div className="ratings-badge">
            {sortedFunds.length} Funds
          </div>
          <button
            className={`refresh-btn ${refreshing ? 'refreshing' : ''}`}
            onClick={handleRefresh}
            disabled={refreshing}
            title="Recompute scores from current stock data (~30s)"
          >
            {refreshing ? '⏳ Refreshing...' : '↻ Refresh Scores'}
          </button>
          {lastUpdated && (
            <div className="last-updated">
              Last updated: {new Date(lastUpdated).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}
            </div>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="ratings-filters">
        <input
          type="text"
          placeholder="Search fund name or house..."
          value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
          className="ratings-search"
        />
        <select
          value={filterHouse}
          onChange={e => setFilterHouse(e.target.value)}
          className="ratings-filter-select"
        >
          <option value="">All Fund Houses</option>
          {fundHouses.map(house => (
            <option key={house} value={house}>{house}</option>
          ))}
        </select>
        <button
          className={`screener-toggle-btn ${showFilters ? 'active' : ''}`}
          onClick={() => setShowFilters(!showFilters)}
        >
          Filters
          {activeFilterCount > 0 && <span className="screener-badge">{activeFilterCount}</span>}
          <span className="screener-chevron">{showFilters ? '\u25B2' : '\u25BC'}</span>
        </button>
      </div>

      {/* Screener Panel */}
      {showFilters && (
        <div className="screener-panel">
          <div className="screener-grid">
            {/* Quality Score */}
            <div className="screener-group">
              <div className="screener-label">Quality Score</div>
              <div className="screener-tier-btns">
                {[
                  { label: 'All', value: '' },
                  { label: '80+', value: '80' },
                  { label: '60+', value: '60' },
                  { label: '40+', value: '40' },
                ].map(t => (
                  <button
                    key={t.value}
                    className={`screener-tier-btn ${minQuality === t.value ? 'active' : ''}`}
                    onClick={() => setMinQuality(t.value)}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Piotroski F-Score */}
            <div className="screener-group">
              <div className="screener-label">Min Piotroski F-Score</div>
              <div className="screener-input-wrap">
                <input
                  type="number"
                  className="screener-input"
                  placeholder="0"
                  min="0"
                  max="9"
                  step="0.5"
                  value={minPiotroski}
                  onChange={e => setMinPiotroski(e.target.value)}
                />
                <span className="screener-input-suffix">/9</span>
              </div>
            </div>

            {/* Altman Z-Score */}
            <div className="screener-group">
              <div className="screener-label">Altman Z-Score</div>
              <div className="screener-tier-btns">
                {[
                  { label: 'All', value: '' },
                  { label: 'Safe', value: 'safe' },
                  { label: 'Grey', value: 'grey' },
                  { label: 'Distress', value: 'distress' },
                ].map(t => (
                  <button
                    key={t.value}
                    className={`screener-tier-btn ${altmanBand === t.value ? 'active' : ''}`}
                    onClick={() => setAltmanBand(t.value)}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Min 1Y CAGR */}
            <div className="screener-group">
              <div className="screener-label">Min 1Y CAGR</div>
              <div className="screener-input-wrap">
                <input
                  type="number"
                  className="screener-input"
                  placeholder="e.g. 10"
                  value={minCagr1y}
                  onChange={e => setMinCagr1y(e.target.value)}
                />
                <span className="screener-input-suffix">%</span>
              </div>
            </div>

            {/* Min 3Y CAGR */}
            <div className="screener-group">
              <div className="screener-label">Min 3Y CAGR</div>
              <div className="screener-input-wrap">
                <input
                  type="number"
                  className="screener-input"
                  placeholder="e.g. 12"
                  value={minCagr3y}
                  onChange={e => setMinCagr3y(e.target.value)}
                />
                <span className="screener-input-suffix">%</span>
              </div>
            </div>

            {/* Min 5Y CAGR */}
            <div className="screener-group">
              <div className="screener-label">Min 5Y CAGR</div>
              <div className="screener-input-wrap">
                <input
                  type="number"
                  className="screener-input"
                  placeholder="e.g. 15"
                  value={minCagr5y}
                  onChange={e => setMinCagr5y(e.target.value)}
                />
                <span className="screener-input-suffix">%</span>
              </div>
            </div>
          </div>

          {activeFilterCount > 0 && (
            <button className="screener-clear-btn" onClick={clearAllFilters}>
              Clear All Filters
            </button>
          )}
        </div>
      )}

      {/* Legend */}
      <div className="ratings-legend">
        <span className="legend-dot" style={{ background: '#22c55e' }}></span> Excellent (80+)
        <span className="legend-dot" style={{ background: '#eab308', marginLeft: 16 }}></span> Good (60-79)
        <span className="legend-dot" style={{ background: '#f97316', marginLeft: 16 }}></span> Average (40-59)
        <span className="legend-dot" style={{ background: '#ef4444', marginLeft: 16 }}></span> Below Avg (&lt;40)
      </div>

      {/* Table */}
      <div className="ratings-table-wrapper">
        <table className="ratings-table">
          <thead>
            <tr>
              <th className="col-rank">Rank</th>
              <th className="col-fund">Fund Name</th>
              <th className="col-house">Fund House</th>
              <th className="col-num sortable" onClick={() => handleSort('overall_quality_score')}>
                Quality <SortIndicator col="overall_quality_score" />
              </th>
              <th className="col-num sortable" onClick={() => handleSort('piotroski_score')}>
                Piotroski <SortIndicator col="piotroski_score" />
              </th>
              <th className="col-num sortable" onClick={() => handleSort('altman_z_score')}>
                Altman Z <SortIndicator col="altman_z_score" />
              </th>
              <th className="col-num sortable" onClick={() => handleSort('cagr_1y')}>
                1Y CAGR <SortIndicator col="cagr_1y" />
              </th>
              <th className="col-num sortable" onClick={() => handleSort('cagr_3y')}>
                3Y CAGR <SortIndicator col="cagr_3y" />
              </th>
              <th className="col-num sortable" onClick={() => handleSort('cagr_5y')}>
                5Y CAGR <SortIndicator col="cagr_5y" />
              </th>
            </tr>
          </thead>
          <tbody>
            {sortedFunds.map((fund, idx) => {
              const qualityScore = fund.overall_quality_score != null ? parseFloat(fund.overall_quality_score) : null;
              const piotroski = fund.piotroski_score != null ? parseFloat(fund.piotroski_score) : null;
              const altmanZ = fund.altman_z_score != null ? parseFloat(fund.altman_z_score) : null;

              return (
                <tr
                  key={fund.ticker}
                  className="ratings-row"
                  onClick={() => onFundClick && onFundClick(fund.ticker, fund.scheme_name)}
                  title="Click to view fund portfolio"
                >
                  <td className="col-rank">
                    <span className={`rank-badge ${idx < 3 ? `rank-top-${idx + 1}` : ''}`}>
                      {idx + 1}
                    </span>
                  </td>
                  <td className="col-fund">
                    <div className="fund-name-cell">
                      <div className="fund-scheme-name">{fund.scheme_name || fund.ticker}</div>
                      <div className="fund-ticker-small">{fund.ticker}</div>
                    </div>
                  </td>
                  <td className="col-house">
                    <span className="fund-house-tag">{fund.fund_house || '—'}</span>
                  </td>
                  <td className="col-num">
                    {qualityScore != null ? (
                      <div className="score-pill" style={{ background: getQualityColor(qualityScore) }}>
                        <span className="score-num">{Math.round(qualityScore)}</span>
                        <span className="score-label">{getQualityLabel(qualityScore)}</span>
                      </div>
                    ) : '—'}
                  </td>
                  <td className="col-num">
                    {piotroski != null ? (
                      <div className="mini-score-pill" style={{ background: getPiotroskiColor(piotroski) }}>
                        {piotroski.toFixed(1)}/9
                      </div>
                    ) : '—'}
                  </td>
                  <td className="col-num">
                    {altmanZ != null ? (
                      <div className="mini-score-pill" style={{ background: getAltmanColor(altmanZ) }}>
                        {altmanZ.toFixed(2)}
                      </div>
                    ) : '—'}
                  </td>
                  {['cagr_1y', 'cagr_3y', 'cagr_5y'].map((key) => {
                    const val = fund[key] != null ? parseFloat(fund[key]) : null;
                    return (
                      <td key={key} className="col-num">
                        {val != null ? (
                          <span className="plain-score" style={{ color: getReturnColor(val) }}>
                            {val >= 0 ? '+' : ''}{val.toFixed(1)}%
                          </span>
                        ) : <span style={{ color: 'var(--text3)', fontSize: '0.8em' }}>N/A</span>}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
        {sortedFunds.length === 0 && (
          <div className="no-results">No funds match your search.</div>
        )}
      </div>

      <div className="ratings-footer">
        <strong>Quality</strong> = Weighted avg of holdings' 5-pillar scores (Profitability, Strength, Earnings, Growth, Valuation) &nbsp;|&nbsp;
        <strong>Piotroski</strong> (0–9): Financial strength &nbsp;|&nbsp;
        <strong>Altman Z</strong>: &gt;3.0 Safe, 1.8–3.0 Grey, &lt;1.8 Distress &nbsp;|&nbsp;
        <strong>CAGR</strong> = Fund NAV growth (annualized)
      </div>
    </div>
  );
}
