import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import './FundScoresRating.css'; // Reuse the same CSS

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

export default function StockScoresRating({ onStockClick }) {
  const navigate = useNavigate();
  const [stocks, setStocks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [sortConfig, setSortConfig] = useState({ key: 'overall_quality_score', direction: 'desc' });
  const [filterSector, setFilterSector] = useState('');
  const [sectors, setSectors] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');

  const fetchRatings = async () => {
    try {
      setLoading(true);
      setError(null);
      const params = filterSector ? { sector: filterSector } : {};
      const response = await axios.get(`${API_URL}/stock-ratings`, { params });
      const data = response.data;
      setStocks(data.stocks || []);
      setLastUpdated(data.lastUpdated || null);

      // Extract unique sectors from full unfiltered data for the filter dropdown
      if (!filterSector && data.stocks) {
        const sectorsList = [...new Set(data.stocks.map(s => s.sector).filter(Boolean))].sort();
        setSectors(sectorsList);
      }
    } catch (err) {
      console.error('Failed to fetch stock ratings:', err);
      setError('Failed to load stock ratings. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchRatings(); }, [filterSector]);

  const handleSort = (key) => {
    setSortConfig(prev => ({
      key,
      direction: prev.key === key && prev.direction === 'desc' ? 'asc' : 'desc'
    }));
  };

  const getSortedStocks = () => {
    const filtered = stocks.filter(s => {
      if (!searchTerm) return true;
      const term = searchTerm.toLowerCase();
      return (
        s.company_name?.toLowerCase().includes(term) ||
        s.symbol?.toLowerCase().includes(term) ||
        s.sector?.toLowerCase().includes(term) ||
        s.industry?.toLowerCase().includes(term)
      );
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

  const handleStockClick = (symbol) => {
    if (onStockClick) {
      onStockClick(symbol);
    } else {
      navigate(`/stock/${symbol}`);
    }
  };

  const sortedStocks = getSortedStocks();

  if (loading) {
    return (
      <div className="fund-ratings-container">
        <div className="ratings-header">
          <h2>Stock Scores Rating</h2>
          <p>Ranking all stocks by quality scores</p>
        </div>
        <div className="ratings-loading">
          <div className="loading-spinner-large"></div>
          <p>Loading stock ratings...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="fund-ratings-container">
        <div className="ratings-header">
          <h2>Stock Scores Rating</h2>
        </div>
        <div className="ratings-error">{error}</div>
      </div>
    );
  }

  if (!loading && stocks.length === 0) {
    return (
      <div className="fund-ratings-container">
        <div className="ratings-header">
          <div className="ratings-title-block">
            <h2>Stock Scores Rating</h2>
            <p className="ratings-subtitle">No stocks with quality scores found</p>
          </div>
        </div>
        <div className="ratings-empty-db">
          <p>No stocks have been scored yet.</p>
          <p>Please run the quality score calculation scripts to populate stock ratings.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="fund-ratings-container">
      <div className="ratings-header">
        <div className="ratings-title-block">
          <h2>Stock Scores Rating</h2>
          <p className="ratings-subtitle">
            {sortedStocks.length} stocks ranked by quality scores
          </p>
        </div>
        <div className="ratings-header-right">
          <div className="ratings-badge">
            {sortedStocks.length} Stocks
          </div>
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
          placeholder="Search stock name, symbol, sector..."
          value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
          className="ratings-search"
        />
        <select
          value={filterSector}
          onChange={e => setFilterSector(e.target.value)}
          className="ratings-filter-select"
        >
          <option value="">All Sectors</option>
          {sectors.map(sector => (
            <option key={sector} value={sector}>{sector}</option>
          ))}
        </select>
      </div>

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
              <th className="col-fund">Company Name</th>
              <th className="col-house">Sector</th>
              <th className="col-num sortable" onClick={() => handleSort('current_price')}>
                Price <SortIndicator col="current_price" />
              </th>
              <th className="col-num sortable" onClick={() => handleSort('market_cap')}>
                Market Cap <SortIndicator col="market_cap" />
              </th>
              <th className="col-num sortable" onClick={() => handleSort('overall_quality_score')}>
                Quality <SortIndicator col="overall_quality_score" />
              </th>
              <th className="col-num sortable" onClick={() => handleSort('piotroski_score')}>
                Piotroski <SortIndicator col="piotroski_score" />
              </th>
              <th className="col-num sortable" onClick={() => handleSort('magic_formula_score')}>
                Magic Formula <SortIndicator col="magic_formula_score" />
              </th>
              <th className="col-num sortable" onClick={() => handleSort('canslim_score')}>
                CANSLIM <SortIndicator col="canslim_score" />
              </th>
              <th className="col-num sortable" onClick={() => handleSort('altman_z_score')}>
                Altman Z <SortIndicator col="altman_z_score" />
              </th>
            </tr>
          </thead>
          <tbody>
            {sortedStocks.map((stock, idx) => {
              const qualityScore = stock.overall_quality_score != null ? parseFloat(stock.overall_quality_score) : null;
              const piotroski = stock.piotroski_score != null ? parseFloat(stock.piotroski_score) : null;
              const magicFormula = stock.magic_formula_score != null ? parseFloat(stock.magic_formula_score) : null;
              const canslim = stock.canslim_score != null ? parseFloat(stock.canslim_score) : null;
              const altmanZ = stock.altman_z_score != null ? parseFloat(stock.altman_z_score) : null;

              return (
                <tr
                  key={stock.symbol}
                  className="ratings-row"
                  onClick={() => handleStockClick(stock.symbol)}
                  title="Click to view stock details"
                >
                  <td className="col-fund">
                    <div className="fund-name-cell">
                      <div className="fund-scheme-name">{stock.company_name || stock.symbol}</div>
                      <div className="fund-ticker-small">{stock.symbol}</div>
                    </div>
                  </td>
                  <td className="col-house">
                    <span className="fund-house-tag">{stock.sector || '—'}</span>
                  </td>
                  <td className="col-num">
                    {stock.current_price != null ? (
                      <span className="plain-score">₹{parseFloat(stock.current_price).toFixed(2)}</span>
                    ) : '—'}
                  </td>
                  <td className="col-num">
                    {stock.market_cap != null ? (
                      <span className="plain-score" style={{ fontSize: '0.85em' }}>
                        ₹{(parseFloat(stock.market_cap) / 10000000).toFixed(0)}Cr
                      </span>
                    ) : '—'}
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
                    {magicFormula != null ? (
                      <span className="plain-score" style={{ color: getQualityColor(magicFormula) }}>
                        {Math.round(magicFormula)}
                      </span>
                    ) : <span style={{ color: 'var(--text3)', fontSize: '0.8em' }}>N/A</span>}
                  </td>
                  <td className="col-num">
                    {canslim != null ? (
                      <span className="plain-score" style={{ color: getQualityColor(canslim) }}>
                        {Math.round(canslim)}
                      </span>
                    ) : <span style={{ color: 'var(--text3)', fontSize: '0.8em' }}>N/A</span>}
                  </td>
                  <td className="col-num">
                    {altmanZ != null ? (
                      <div className="mini-score-pill" style={{ background: getAltmanColor(altmanZ) }}>
                        {altmanZ.toFixed(2)}
                      </div>
                    ) : '—'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {sortedStocks.length === 0 && (
          <div className="no-results">No stocks match your search.</div>
        )}
      </div>

      <div className="ratings-footer">
        <strong>Scoring Methods:</strong>
        &nbsp; <strong>Overall Quality</strong> = Average of 3 methods &nbsp;|&nbsp;
        <strong>Piotroski F-Score</strong> (0–9): 9 fundamental criteria &nbsp;|&nbsp;
        <strong>Magic Formula</strong> (0–100): Earnings Yield + Return on Capital &nbsp;|&nbsp;
        <strong>CANSLIM</strong> (0–100): Growth + Leadership + Institutional &nbsp;|&nbsp;
        <strong>Altman Z</strong>: &gt;3.0 Safe, 1.8–3.0 Grey, &lt;1.8 Distress &nbsp;|&nbsp;
        Click any stock for details
      </div>
    </div>
  );
}
