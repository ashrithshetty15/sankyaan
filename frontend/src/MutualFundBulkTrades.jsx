import React, { useState, useEffect } from 'react';
import axios from 'axios';
import './MutualFundBulkTrades.css';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

const formatAmount = (val) => {
  if (val == null || val === 0) return '-';
  if (val >= 1e7) return `${(val / 1e7).toFixed(2)} Cr`;
  if (val >= 1e5) return `${(val / 1e5).toFixed(2)} L`;
  return val.toLocaleString('en-IN');
};

const formatQty = (val) => {
  if (val == null) return '-';
  return val.toLocaleString('en-IN');
};

const formatDate = (dateStr) => {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
};

export default function MutualFundBulkTrades() {
  const [trades, setTrades] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  // Filters
  const [days, setDays] = useState(5);
  const [transactionType, setTransactionType] = useState('all');
  const [search, setSearch] = useState('');
  const [sortConfig, setSortConfig] = useState({ key: 'amount', direction: 'desc' });

  const fetchTrades = async () => {
    try {
      setLoading(true);
      setError(null);
      const params = new URLSearchParams({ days });
      if (transactionType !== 'all') params.set('transactionType', transactionType);
      if (search.trim()) params.set('search', search.trim());

      const res = await axios.get(`${API_URL}/bulk-trades?${params}`);
      setTrades(res.data.trades || []);
      setSummary(res.data.summary || null);
    } catch (err) {
      setError('Failed to load bulk trades. Try refreshing data.');
      setTrades([]);
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    try {
      setRefreshing(true);
      await axios.post(`${API_URL}/bulk-trades/refresh`);
      await fetchTrades();
    } catch (err) {
      setError('Failed to refresh data from source.');
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchTrades();
  }, [days, transactionType]);

  const handleSearch = (e) => {
    e.preventDefault();
    fetchTrades();
  };

  const handleSort = (key) => {
    setSortConfig(prev => ({
      key,
      direction: prev.key === key && prev.direction === 'desc' ? 'asc' : 'desc',
    }));
  };

  const sortedTrades = [...trades].sort((a, b) => {
    const { key, direction } = sortConfig;
    let aVal = a[key];
    let bVal = b[key];
    if (typeof aVal === 'string') aVal = aVal.toLowerCase();
    if (typeof bVal === 'string') bVal = bVal.toLowerCase();
    if (aVal == null) return 1;
    if (bVal == null) return -1;
    if (aVal < bVal) return direction === 'asc' ? -1 : 1;
    if (aVal > bVal) return direction === 'asc' ? 1 : -1;
    return 0;
  });

  const getSortIcon = (key) => {
    if (sortConfig.key !== key) return '';
    return sortConfig.direction === 'asc' ? ' \u25B2' : ' \u25BC';
  };

  return (
    <div className="bulk-trades-container">
      <div className="bulk-trades-header">
        <div>
          <h2>MF Bulk & Block Trades</h2>
          <p className="bulk-trades-subtitle">
            Mutual fund buy/sell activity from NSE & BSE bulk and block deals
          </p>
        </div>
        <button
          className="bulk-trades-refresh-btn"
          onClick={handleRefresh}
          disabled={refreshing}
        >
          {refreshing ? 'Fetching...' : 'Refresh Data'}
        </button>
      </div>

      {/* Summary Cards */}
      {summary && (
        <div className="bulk-trades-summary">
          <div className="summary-card buy">
            <span className="summary-label">Buys</span>
            <span className="summary-value">{summary.totalBuys}</span>
            <span className="summary-sub">{formatAmount(summary.buyValue)}</span>
          </div>
          <div className="summary-card sell">
            <span className="summary-label">Sells</span>
            <span className="summary-value">{summary.totalSells}</span>
            <span className="summary-sub">{formatAmount(summary.sellValue)}</span>
          </div>
          <div className="summary-card total">
            <span className="summary-label">Total Deals</span>
            <span className="summary-value">{trades.length}</span>
            <span className="summary-sub">Last {days} days</span>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="bulk-trades-filters">
        <div className="filter-group">
          <label>Period</label>
          <select value={days} onChange={e => setDays(Number(e.target.value))}>
            <option value={1}>Today</option>
            <option value={3}>Last 3 days</option>
            <option value={5}>Last 5 days</option>
            <option value={10}>Last 10 days</option>
            <option value={30}>Last 30 days</option>
          </select>
        </div>
        <div className="filter-group">
          <label>Type</label>
          <select value={transactionType} onChange={e => setTransactionType(e.target.value)}>
            <option value="all">All</option>
            <option value="Buy">Buys Only</option>
            <option value="Sell">Sells Only</option>
          </select>
        </div>
        <form className="filter-group search-group" onSubmit={handleSearch}>
          <label>Search</label>
          <div className="search-wrapper">
            <input
              type="text"
              placeholder="Stock or fund house..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
            <button type="submit" className="search-btn">Go</button>
          </div>
        </form>
      </div>

      {/* Table */}
      {loading ? (
        <div className="bulk-trades-loading">Loading trades...</div>
      ) : error ? (
        <div className="bulk-trades-error">
          <p>{error}</p>
          <button onClick={handleRefresh}>Refresh Data</button>
        </div>
      ) : trades.length === 0 ? (
        <div className="bulk-trades-empty">
          <p>No mutual fund bulk trades found.</p>
          <p className="bulk-trades-empty-hint">Click "Refresh Data" to fetch the latest deals.</p>
        </div>
      ) : (
        <div className="bulk-trades-table-wrapper">
          <table className="bulk-trades-table">
            <thead>
              <tr>
                <th onClick={() => handleSort('tradeDate')}>Date{getSortIcon('tradeDate')}</th>
                <th onClick={() => handleSort('symbol')}>Stock{getSortIcon('symbol')}</th>
                <th onClick={() => handleSort('clientName')}>Fund House{getSortIcon('clientName')}</th>
                <th onClick={() => handleSort('transactionType')}>Action{getSortIcon('transactionType')}</th>
                <th onClick={() => handleSort('quantity')} className="num-col">Qty{getSortIcon('quantity')}</th>
                <th onClick={() => handleSort('price')} className="num-col">Price{getSortIcon('price')}</th>
                <th onClick={() => handleSort('amount')} className="num-col">Amount{getSortIcon('amount')}</th>
                <th className="num-col">Exchange</th>
              </tr>
            </thead>
            <tbody>
              {sortedTrades.map((t, i) => (
                <tr key={i} className={t.transactionType === 'Buy' ? 'row-buy' : 'row-sell'}>
                  <td className="date-col">{formatDate(t.tradeDate)}</td>
                  <td className="stock-col">{t.symbol}</td>
                  <td className="client-col">{t.clientName}</td>
                  <td>
                    <span className={`action-badge ${t.transactionType.toLowerCase()}`}>
                      {t.transactionType}
                    </span>
                  </td>
                  <td className="num-col">{formatQty(t.quantity)}</td>
                  <td className="num-col">{t.price?.toFixed(2)}</td>
                  <td className="num-col amount-col">{formatAmount(t.amount)}</td>
                  <td className="num-col">{t.exchange}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
