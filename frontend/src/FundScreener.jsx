import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import './FundScreener.css';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

const getQualityColor = (score) => {
  if (score == null) return '#6b7280';
  if (score >= 80) return '#22c55e';
  if (score >= 60) return '#eab308';
  if (score >= 40) return '#f97316';
  return '#ef4444';
};

const getReturnColor = (val) => {
  if (val == null) return '#6b7280';
  return val >= 0 ? '#22c55e' : '#ef4444';
};

const getExpenseColor = (ratio) => {
  if (ratio == null) return '#6b7280';
  if (ratio <= 0.5) return '#22c55e';
  if (ratio <= 1.0) return '#eab308';
  if (ratio <= 1.5) return '#f97316';
  return '#ef4444';
};

const PRESETS = [
  { label: 'Top Quality', filters: { minQuality: '70' }, sort: 'overall_quality_score' },
  { label: 'Low Cost', filters: { maxExpenseRatio: '0.5' }, sort: 'expense_ratio', sortDir: 'asc' },
  { label: 'Best Returns (3Y)', filters: { minCagr3y: '15' }, sort: 'cagr_3y' },
  { label: 'Large AUM', filters: { minAum: '5000' }, sort: 'aum_crores' },
  { label: 'IT / Tech Exposure', filters: { sector: 'Technology,Information Technology,IT - Software,Software - Infrastructure,Software - Application,Information Technology Services' }, sort: 'sector_exposure' },
  { label: 'Banking Exposure', filters: { sector: 'Financial Services,Banks - Private Sector,Banks - Public Sector' }, sort: 'sector_exposure' },
  { label: 'Healthcare Exposure', filters: { sector: 'Healthcare,Pharmaceuticals & Biotechnology' }, sort: 'sector_exposure' },
];

export default function FundScreener({ onFundClick }) {
  const [sectors, setSectors] = useState([]);
  const [allStocks, setAllStocks] = useState([]);
  const [fundHouses, setFundHouses] = useState([]);
  const [funds, setFunds] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [hasSearched, setHasSearched] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [filterHouse, setFilterHouse] = useState('');
  const [sector, setSector] = useState('');
  const [stockSearch, setStockSearch] = useState('');
  const [selectedStock, setSelectedStock] = useState(null);
  const [showStockDropdown, setShowStockDropdown] = useState(false);
  const [minAum, setMinAum] = useState('');
  const [minQuality, setMinQuality] = useState('');
  const [maxExpenseRatio, setMaxExpenseRatio] = useState('');
  const [minCagr1y, setMinCagr1y] = useState('');
  const [minCagr3y, setMinCagr3y] = useState('');
  const [minCagr5y, setMinCagr5y] = useState('');

  // Sort
  const [sortBy, setSortBy] = useState('overall_quality_score');
  const [sortDir, setSortDir] = useState('desc');

  // Active filters from last search
  const [activeFilters, setActiveFilters] = useState({});

  const stockSearchRef = useRef(null);

  // Fetch sectors, stocks, and fund houses on mount
  useEffect(() => {
    axios.get(`${API_URL}/fund-screener/sectors`)
      .then(res => setSectors(res.data.sectors || []))
      .catch(() => {});
    axios.get(`${API_URL}/stocks`)
      .then(res => setAllStocks(res.data.stocks || []))
      .catch(() => {});
    axios.get(`${API_URL}/fundhouses`)
      .then(res => setFundHouses(res.data.fundHouses || []))
      .catch(() => {});
  }, []);

  // Auto-search on mount
  useEffect(() => {
    handleSearch();
  }, []);

  const handleSearch = async (overrideSortBy, overrideSortDir, filterOverrides) => {
    setLoading(true);
    setError(null);
    try {
      const params = {};

      // When filterOverrides is provided (from presets), use those directly
      // instead of state values (which may not be committed yet)
      if (filterOverrides) {
        if (filterOverrides.sector) params.sector = filterOverrides.sector;
        if (filterOverrides.stockId) params.stockId = filterOverrides.stockId;
        if (filterOverrides.minAum) params.minAum = filterOverrides.minAum;
        if (filterOverrides.minQuality) params.minQuality = filterOverrides.minQuality;
        if (filterOverrides.maxExpenseRatio) params.maxExpenseRatio = filterOverrides.maxExpenseRatio;
        if (filterOverrides.minCagr1y) params.minCagr1y = filterOverrides.minCagr1y;
        if (filterOverrides.minCagr3y) params.minCagr3y = filterOverrides.minCagr3y;
        if (filterOverrides.minCagr5y) params.minCagr5y = filterOverrides.minCagr5y;
        if (filterOverrides.fundHouse) params.fundHouse = filterOverrides.fundHouse;
      } else {
        if (sector) params.sector = sector;
        if (selectedStock) params.stockId = selectedStock.id;
        if (minAum) params.minAum = minAum;
        if (minQuality) params.minQuality = minQuality;
        if (maxExpenseRatio) params.maxExpenseRatio = maxExpenseRatio;
        if (minCagr1y) params.minCagr1y = minCagr1y;
        if (minCagr3y) params.minCagr3y = minCagr3y;
        if (minCagr5y) params.minCagr5y = minCagr5y;
        if (filterHouse) params.fundHouse = filterHouse;
      }

      params.sortBy = overrideSortBy || sortBy;
      params.sortDir = overrideSortDir || sortDir;

      const res = await axios.get(`${API_URL}/fund-screener`, { params });
      setFunds(res.data.funds || []);
      setActiveFilters(res.data.filters || {});
      setHasSearched(true);
    } catch (err) {
      console.error('Screener error:', err);
      setError('Failed to fetch results');
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    try {
      setRefreshing(true);
      setError(null);
      await axios.post(`${API_URL}/fund-ratings/refresh`);
      await handleSearch();
    } catch (err) {
      console.error('Refresh failed:', err);
      setError('Refresh failed. Please try again.');
    } finally {
      setRefreshing(false);
    }
  };

  const handleSort = (col) => {
    let newDir = 'desc';
    if (sortBy === col && sortDir === 'desc') newDir = 'asc';
    setSortBy(col);
    setSortDir(newDir);
    handleSearch(col, newDir);
  };

  const clearAllFilters = () => {
    setSearchTerm('');
    setFilterHouse('');
    setSector('');
    setStockSearch('');
    setSelectedStock(null);
    setMinAum('');
    setMinQuality('');
    setMaxExpenseRatio('');
    setMinCagr1y('');
    setMinCagr3y('');
    setMinCagr5y('');
    setSortBy('overall_quality_score');
    setSortDir('desc');
  };

  const applyPreset = (preset) => {
    clearAllFilters();
    const f = preset.filters;
    // Update UI state for display (may not be committed before handleSearch runs)
    if (f.minQuality) setMinQuality(f.minQuality);
    if (f.maxExpenseRatio) setMaxExpenseRatio(f.maxExpenseRatio);
    if (f.minCagr3y) setMinCagr3y(f.minCagr3y);
    if (f.minAum) setMinAum(f.minAum);
    if (f.sector) setSector(f.sector);
    const newSort = preset.sort || 'overall_quality_score';
    const newSortDir = preset.sortDir || 'desc';
    setSortBy(newSort);
    setSortDir(newSortDir);
    // Pass filters directly to bypass state race condition
    handleSearch(newSort, newSortDir, f);
  };

  const activeFilterCount = [sector, selectedStock, minAum, minQuality, maxExpenseRatio, minCagr1y, minCagr3y, minCagr5y, filterHouse].filter(Boolean).length;

  // Stock search autocomplete
  const stockSuggestions = stockSearch.length >= 1
    ? allStocks.filter(s =>
        s.symbol?.toLowerCase().includes(stockSearch.toLowerCase()) ||
        s.name?.toLowerCase().includes(stockSearch.toLowerCase())
      ).slice(0, 12)
    : [];

  const handleStockSelect = (stock) => {
    setSelectedStock(stock);
    setStockSearch(stock.name || stock.symbol);
    setShowStockDropdown(false);
    setSortBy('stock_exposure');
    setSortDir('desc');
  };

  const clearStockFilter = () => {
    setSelectedStock(null);
    setStockSearch('');
    if (sortBy === 'stock_exposure') {
      setSortBy('overall_quality_score');
      setSortDir('desc');
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') handleSearch();
  };

  const SortIndicator = ({ col }) => {
    if (sortBy !== col) return <span className="sort-inactive">↕</span>;
    return <span className="sort-active">{sortDir === 'desc' ? '↓' : '↑'}</span>;
  };

  const hasSectorFilter = !!activeFilters.sector;
  const hasStockFilter = !!activeFilters.stockId;

  // Client-side text search on already-fetched results
  const displayFunds = searchTerm
    ? funds.filter(f => {
        const term = searchTerm.toLowerCase();
        return (f.schemeName?.toLowerCase().includes(term) ||
                f.fundName?.toLowerCase().includes(term) ||
                f.fundHouse?.toLowerCase().includes(term) ||
                f.fundManager?.toLowerCase().includes(term));
      })
    : funds;

  return (
    <div className="screener-container">
      {/* Header with refresh */}
      <div className="screener-header">
        <div className="screener-header-right">
          <button
            className={`screener-refresh-btn ${refreshing ? 'refreshing' : ''}`}
            onClick={handleRefresh}
            disabled={refreshing}
            title="Recompute scores from current stock data (~30s)"
          >
            {refreshing ? 'Refreshing...' : 'Refresh Scores'}
          </button>
        </div>
      </div>

      {/* Presets */}
      <div className="screener-presets">
        {PRESETS.map((p, i) => (
          <button key={i} className="screener-preset-btn" onClick={() => applyPreset(p)}>
            {p.label}
          </button>
        ))}
      </div>

      {/* Search + Fund House row */}
      <div className="screener-top-bar">
        <input
          type="text"
          className="screener-text-search"
          placeholder="Search fund name, house, or manager..."
          value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
        />
        <select
          className="screener-house-select"
          value={filterHouse}
          onChange={e => setFilterHouse(e.target.value)}
        >
          <option value="">All Fund Houses</option>
          {fundHouses.map(h => <option key={h} value={h}>{h}</option>)}
        </select>
      </div>

      {/* Filter Bar */}
      <div className="screener-filters">
        <div className="screener-filter-row">
          {/* Sector */}
          <div className="screener-group">
            <label className="screener-label">Sector</label>
            <select
              className="screener-select"
              value={sector}
              onChange={e => {
                setSector(e.target.value);
                if (e.target.value) {
                  setSortBy('sector_exposure');
                  setSortDir('desc');
                }
              }}
            >
              <option value="">All Sectors</option>
              {sectors.map(s => (
                <option key={s.name} value={s.name}>{s.name} ({s.fund_count})</option>
              ))}
            </select>
          </div>

          {/* Stock */}
          <div className="screener-group">
            <label className="screener-label">Stock Holding</label>
            <div className="screener-stock-wrap" ref={stockSearchRef}>
              <input
                type="text"
                className="screener-input"
                placeholder="Search stock..."
                value={stockSearch}
                onChange={e => {
                  setStockSearch(e.target.value);
                  setSelectedStock(null);
                  setShowStockDropdown(true);
                }}
                onFocus={() => setShowStockDropdown(true)}
                onBlur={() => setTimeout(() => setShowStockDropdown(false), 200)}
                onKeyDown={handleKeyDown}
              />
              {selectedStock && (
                <button className="screener-stock-clear" onClick={clearStockFilter}>✕</button>
              )}
              {showStockDropdown && stockSuggestions.length > 0 && !selectedStock && (
                <div className="screener-stock-dropdown">
                  {stockSuggestions.map(s => (
                    <div
                      key={s.id}
                      className="screener-stock-item"
                      onMouseDown={() => handleStockSelect(s)}
                    >
                      <span className="stock-symbol">{s.symbol}</span>
                      <span className="stock-name">{s.name}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* AUM */}
          <div className="screener-group">
            <label className="screener-label">Min AUM (Cr)</label>
            <input
              type="number"
              className="screener-input screener-input-num"
              placeholder="e.g. 1000"
              value={minAum}
              onChange={e => setMinAum(e.target.value)}
              onKeyDown={handleKeyDown}
            />
          </div>
        </div>

        <div className="screener-filter-row">
          {/* Quality */}
          <div className="screener-group">
            <label className="screener-label">Min Quality</label>
            <input
              type="number"
              className="screener-input screener-input-num"
              placeholder="e.g. 60"
              value={minQuality}
              onChange={e => setMinQuality(e.target.value)}
              onKeyDown={handleKeyDown}
            />
          </div>

          {/* Expense Ratio */}
          <div className="screener-group">
            <label className="screener-label">Max Expense (%)</label>
            <input
              type="number"
              step="0.1"
              className="screener-input screener-input-num"
              placeholder="e.g. 1.0"
              value={maxExpenseRatio}
              onChange={e => setMaxExpenseRatio(e.target.value)}
              onKeyDown={handleKeyDown}
            />
          </div>

          {/* CAGR filters */}
          <div className="screener-group screener-cagr-group">
            <label className="screener-label">Min CAGR (%)</label>
            <div className="screener-cagr-inputs">
              <input
                type="number"
                className="screener-input screener-input-sm"
                placeholder="1Y"
                value={minCagr1y}
                onChange={e => setMinCagr1y(e.target.value)}
                onKeyDown={handleKeyDown}
              />
              <input
                type="number"
                className="screener-input screener-input-sm"
                placeholder="3Y"
                value={minCagr3y}
                onChange={e => setMinCagr3y(e.target.value)}
                onKeyDown={handleKeyDown}
              />
              <input
                type="number"
                className="screener-input screener-input-sm"
                placeholder="5Y"
                value={minCagr5y}
                onChange={e => setMinCagr5y(e.target.value)}
                onKeyDown={handleKeyDown}
              />
            </div>
          </div>
        </div>

        <div className="screener-actions">
          <button className="screener-search-btn" onClick={() => handleSearch()} disabled={loading}>
            {loading ? 'Searching...' : 'Search Funds'}
          </button>
          {activeFilterCount > 0 && (
            <button className="screener-clear-btn" onClick={() => { clearAllFilters(); handleSearch('overall_quality_score', 'desc', {}); }}>
              Clear All ({activeFilterCount})
            </button>
          )}
        </div>
      </div>

      {/* Error */}
      {error && <div className="screener-error">{error}</div>}

      {/* Results */}
      {hasSearched && !loading && (
        <>
          <div className="screener-summary">
            Found <strong>{displayFunds.length}</strong> fund{displayFunds.length !== 1 ? 's' : ''}
            {searchTerm && ` for "${searchTerm}"`}
            {hasSectorFilter && <span className="screener-tag">Sector: {activeFilters.sector.includes(',') ? activeFilters.sector.split(',')[0] + ' +more' : activeFilters.sector}</span>}
            {hasStockFilter && <span className="screener-tag">Stock: {funds[0]?.targetStock || `ID ${activeFilters.stockId}`}</span>}
          </div>

          <div className="screener-table-wrap">
            <table className="screener-table">
              <thead>
                <tr>
                  <th className="th-rank">#</th>
                  <th className="th-name" onClick={() => handleSort('scheme_name')}>
                    Fund <SortIndicator col="scheme_name" />
                  </th>
                  <th onClick={() => handleSort('fund_house')}>
                    House <SortIndicator col="fund_house" />
                  </th>
                  <th onClick={() => handleSort('overall_quality_score')}>
                    Quality <SortIndicator col="overall_quality_score" />
                  </th>
                  <th onClick={() => handleSort('expense_ratio')}>
                    ER % <SortIndicator col="expense_ratio" />
                  </th>
                  <th onClick={() => handleSort('aum_crores')}>
                    AUM (Cr) <SortIndicator col="aum_crores" />
                  </th>
                  {hasSectorFilter && (
                    <th onClick={() => handleSort('sector_exposure')}>
                      Sector Exp % <SortIndicator col="sector_exposure" />
                    </th>
                  )}
                  {hasStockFilter && (
                    <th onClick={() => handleSort('stock_exposure')}>
                      Stock Exp % <SortIndicator col="stock_exposure" />
                    </th>
                  )}
                  <th onClick={() => handleSort('cagr_1y')}>
                    1Y <SortIndicator col="cagr_1y" />
                  </th>
                  <th onClick={() => handleSort('cagr_3y')}>
                    3Y <SortIndicator col="cagr_3y" />
                  </th>
                  <th onClick={() => handleSort('cagr_5y')}>
                    5Y <SortIndicator col="cagr_5y" />
                  </th>
                </tr>
              </thead>
              <tbody>
                {displayFunds.map((fund, idx) => (
                  <tr key={fund.fundName || idx} className="screener-data-row">
                    <td className="td-rank">{idx + 1}</td>
                    <td className="td-name">
                      <span
                        className="fund-link"
                        onClick={() => onFundClick && onFundClick(fund.fundName)}
                        title="View fund portfolio"
                      >
                        {fund.schemeName || fund.fundName}
                      </span>
                      {fund.fundManager && (
                        <div className="fund-manager-sub">{fund.fundManager.split(';').map(n => n.trim()).join(' | ')}</div>
                      )}
                    </td>
                    <td className="td-house">{fund.fundHouse}</td>
                    <td>
                      <span className="quality-pill" style={{ color: getQualityColor(fund.qualityScore) }}>
                        {fund.qualityScore != null ? Math.round(fund.qualityScore) : 'N/A'}
                      </span>
                    </td>
                    <td>
                      <span style={{ color: getExpenseColor(fund.expenseRatio) }}>
                        {fund.expenseRatio != null ? `${fund.expenseRatio.toFixed(2)}%` : 'N/A'}
                      </span>
                    </td>
                    <td className="td-aum">
                      {fund.aumCrores != null ? `${Math.round(fund.aumCrores).toLocaleString('en-IN')}` : 'N/A'}
                    </td>
                    {hasSectorFilter && (
                      <td>
                        <span className="exposure-val">
                          {fund.sectorExposure != null ? `${fund.sectorExposure.toFixed(1)}%` : '0%'}
                        </span>
                      </td>
                    )}
                    {hasStockFilter && (
                      <td>
                        <span className="exposure-val">
                          {fund.stockExposure != null ? `${fund.stockExposure.toFixed(2)}%` : '0%'}
                        </span>
                      </td>
                    )}
                    <td>
                      <span style={{ color: getReturnColor(fund.cagr1y) }}>
                        {fund.cagr1y != null ? `${fund.cagr1y >= 0 ? '+' : ''}${fund.cagr1y.toFixed(1)}%` : 'N/A'}
                      </span>
                    </td>
                    <td>
                      <span style={{ color: getReturnColor(fund.cagr3y) }}>
                        {fund.cagr3y != null ? `${fund.cagr3y >= 0 ? '+' : ''}${fund.cagr3y.toFixed(1)}%` : 'N/A'}
                      </span>
                    </td>
                    <td>
                      <span style={{ color: getReturnColor(fund.cagr5y) }}>
                        {fund.cagr5y != null ? `${fund.cagr5y >= 0 ? '+' : ''}${fund.cagr5y.toFixed(1)}%` : 'N/A'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {displayFunds.length === 0 && (
            <div className="screener-empty">
              No funds match your criteria. Try adjusting the filters.
            </div>
          )}
        </>
      )}

      {loading && (
        <div className="screener-loading">
          <div className="loading-spinner-large"></div>
          <p>Screening funds...</p>
        </div>
      )}
    </div>
  );
}
