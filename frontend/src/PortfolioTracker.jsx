import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import './PortfolioTracker.css';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

const formatAmount = (val) => {
  if (val == null || val === 0) return '-';
  if (val >= 1e7) return `${(val / 1e7).toFixed(2)} Cr`;
  if (val >= 1e5) return `${(val / 1e5).toFixed(2)} L`;
  if (val >= 1e3) return `${(val / 1e3).toFixed(1)} K`;
  return val.toLocaleString('en-IN');
};

export default function PortfolioTracker() {
  const [holdings, setHoldings] = useState([]);
  const [analysis, setAnalysis] = useState(null);
  const [totalInvested, setTotalInvested] = useState(0);
  const [loading, setLoading] = useState(true);

  // Add fund form
  const [fundSearch, setFundSearch] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [selectedFund, setSelectedFund] = useState(null);
  const [amount, setAmount] = useState('');
  const [adding, setAdding] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const suggestionsRef = useRef(null);
  const allFundsRef = useRef([]);

  // Load all fund names once for autocomplete
  useEffect(() => {
    axios.get(`${API_URL}/tickers`).then(res => {
      // Get unique fund names
      const seen = new Set();
      const funds = [];
      for (const t of (res.data.tickersWithFunds || [])) {
        if (!seen.has(t.fund_name)) {
          seen.add(t.fund_name);
          funds.push({ fundName: t.fund_name, fundHouse: t.fund_house || '' });
        }
      }
      allFundsRef.current = funds;
    }).catch(() => {});
  }, []);

  // Click outside to close suggestions
  useEffect(() => {
    const handler = (e) => {
      if (suggestionsRef.current && !suggestionsRef.current.contains(e.target)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const fetchPortfolio = async () => {
    try {
      setLoading(true);
      const [holdingsRes, analysisRes] = await Promise.all([
        axios.get(`${API_URL}/portfolio`, { withCredentials: true }),
        axios.get(`${API_URL}/portfolio/analysis`, { withCredentials: true }),
      ]);
      setHoldings(holdingsRes.data.holdings || []);
      setTotalInvested(holdingsRes.data.totalInvested || 0);
      setAnalysis(analysisRes.data);
    } catch {
      // User may not be logged in
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchPortfolio(); }, []);

  const handleSearchChange = (val) => {
    setFundSearch(val);
    setSelectedFund(null);
    if (val.length < 2) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }
    const lower = val.toLowerCase();
    const matches = allFundsRef.current
      .filter(f => f.fundName.toLowerCase().includes(lower))
      .slice(0, 8);
    setSuggestions(matches);
    setShowSuggestions(matches.length > 0);
  };

  const handleSelectFund = (fund) => {
    setSelectedFund(fund.fundName);
    setFundSearch(fund.fundName);
    setShowSuggestions(false);
    setSuggestions([]);
  };

  const handleAdd = async (e) => {
    e.preventDefault();
    if (!selectedFund || !amount) return;

    try {
      setAdding(true);
      await axios.post(`${API_URL}/portfolio`, {
        fund_name: selectedFund,
        invested_amount: parseFloat(amount),
      }, { withCredentials: true });
      setFundSearch('');
      setSelectedFund(null);
      setAmount('');
      await fetchPortfolio();
    } catch {
      // handle error
    } finally {
      setAdding(false);
    }
  };

  const handleDelete = async (id) => {
    try {
      await axios.delete(`${API_URL}/portfolio/${id}`, { withCredentials: true });
      await fetchPortfolio();
    } catch {
      // handle error
    }
  };

  if (loading) {
    return <div className="pt-loading">Loading portfolio...</div>;
  }

  return (
    <div className="pt-container">
      {/* Add Fund Form */}
      <div className="pt-add-section">
        <form className="pt-add-form" onSubmit={handleAdd}>
          <div className="pt-search-wrapper" ref={suggestionsRef}>
            <input
              type="text"
              className="pt-search-input"
              placeholder="Search fund name..."
              value={fundSearch}
              onChange={(e) => handleSearchChange(e.target.value)}
              onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
            />
            {showSuggestions && (
              <div className="pt-suggestions">
                {suggestions.map((f, i) => (
                  <div
                    key={i}
                    className="pt-suggestion-item"
                    onClick={() => handleSelectFund(f)}
                  >
                    <span className="pt-sug-name">{f.fundName}</span>
                    {f.fundHouse && <span className="pt-sug-house">{f.fundHouse}</span>}
                  </div>
                ))}
              </div>
            )}
          </div>
          <input
            type="number"
            className="pt-amount-input"
            placeholder="Amount (Rs)"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            min="0"
            step="1000"
          />
          <button
            type="submit"
            className="pt-add-btn"
            disabled={!selectedFund || !amount || adding}
          >
            {adding ? '...' : 'Add'}
          </button>
        </form>
      </div>

      {/* Summary Cards */}
      {holdings.length > 0 && (
        <div className="pt-summary">
          <div className="pt-card">
            <span className="pt-card-label">Total Invested</span>
            <span className="pt-card-value gold">{formatAmount(totalInvested)}</span>
          </div>
          <div className="pt-card">
            <span className="pt-card-label">Funds</span>
            <span className="pt-card-value">{holdings.length}</span>
          </div>
          <div className="pt-card">
            <span className="pt-card-label">Portfolio Quality</span>
            <span className="pt-card-value green">
              {analysis?.weightedScore != null ? analysis.weightedScore.toFixed(1) : '-'}
            </span>
          </div>
          <div className="pt-card">
            <span className="pt-card-label">CAGR 1Y</span>
            <span className={`pt-card-value ${analysis?.weightedCagr?.cagr1y >= 0 ? 'green' : 'red'}`}>
              {analysis?.weightedCagr?.cagr1y != null ? `${analysis.weightedCagr.cagr1y}%` : '-'}
            </span>
          </div>
        </div>
      )}

      {/* Holdings Table */}
      {holdings.length === 0 ? (
        <div className="pt-empty">
          <p>No funds added yet.</p>
          <p className="pt-empty-hint">Search and add your mutual fund holdings above to see portfolio analytics.</p>
        </div>
      ) : (
        <div className="pt-table-wrapper">
          <table className="pt-table">
            <thead>
              <tr>
                <th>Fund</th>
                <th className="num-col">Invested</th>
                <th className="num-col">Quality</th>
                <th className="num-col">1Y CAGR</th>
                <th className="num-col">3Y CAGR</th>
                <th className="num-col">ER</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {holdings.map(h => (
                <tr key={h.id}>
                  <td>
                    <div className="pt-fund-name">{h.schemeName || h.fundName}</div>
                    <div className="pt-fund-house">{h.fundHouse}</div>
                  </td>
                  <td className="num-col">{formatAmount(h.investedAmount)}</td>
                  <td className="num-col">
                    <span className={`pt-score ${h.qualityScore >= 60 ? 'good' : h.qualityScore >= 40 ? 'ok' : 'poor'}`}>
                      {h.qualityScore != null ? h.qualityScore.toFixed(1) : '-'}
                    </span>
                  </td>
                  <td className={`num-col ${h.cagr1y >= 0 ? 'green-text' : 'red-text'}`}>
                    {h.cagr1y != null ? `${h.cagr1y}%` : '-'}
                  </td>
                  <td className={`num-col ${h.cagr3y >= 0 ? 'green-text' : 'red-text'}`}>
                    {h.cagr3y != null ? `${h.cagr3y}%` : '-'}
                  </td>
                  <td className="num-col">{h.expenseRatio != null ? `${h.expenseRatio}%` : '-'}</td>
                  <td>
                    <button className="pt-delete-btn" onClick={() => handleDelete(h.id)} title="Remove">
                      ✕
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Analysis Section */}
      {analysis && holdings.length > 0 && (
        <div className="pt-analysis">
          {/* Sector Exposure */}
          {analysis.sectors?.length > 0 && (
            <div className="pt-analysis-card">
              <h3>Sector Exposure</h3>
              <div className="pt-sector-bars">
                {analysis.sectors.map((s, i) => (
                  <div key={i} className="pt-sector-row">
                    <span className="pt-sector-name">{s.sector}</span>
                    <div className="pt-bar-track">
                      <div
                        className="pt-bar-fill"
                        style={{ width: `${Math.min(s.percentage, 100)}%` }}
                      />
                    </div>
                    <span className="pt-sector-pct">{s.percentage}%</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Stock Overlap */}
          {analysis.overlap?.length > 0 && (
            <div className="pt-analysis-card">
              <h3>Stock Overlap ({analysis.overlapCount} stocks in 2+ funds)</h3>
              <table className="pt-overlap-table">
                <thead>
                  <tr>
                    <th>Stock</th>
                    <th className="num-col">In Funds</th>
                    <th className="num-col">Total Weight</th>
                  </tr>
                </thead>
                <tbody>
                  {analysis.overlap.map((s, i) => (
                    <tr key={i}>
                      <td>
                        <span className="pt-stock-name">{s.name}</span>
                        {s.symbol && <span className="pt-stock-symbol">{s.symbol}</span>}
                      </td>
                      <td className="num-col">{s.fundCount}</td>
                      <td className="num-col">{s.totalWeight.toFixed(2)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Diversification Tips */}
      {analysis?.diversificationTips?.length > 0 && (
        <div className="pt-tips-section">
          <h3 className="pt-tips-header">Diversification Tips</h3>
          <p className="pt-tips-subtitle">Sectors your portfolio has little or no exposure to</p>
          <div className="pt-tips-grid">
            {analysis.diversificationTips.map((tip, i) => (
              <div key={i} className="pt-tip-card">
                <div className="pt-tip-sector">
                  <span className="pt-tip-sector-name">{tip.sector}</span>
                  <span className="pt-tip-badge">
                    {tip.currentExposure > 0 ? `${tip.currentExposure}%` : 'No exposure'}
                  </span>
                </div>
                <div className="pt-tip-funds">
                  {tip.suggestedFunds.map((f, j) => (
                    <div key={j} className="pt-tip-fund">
                      <div className="pt-tip-fund-name">{f.schemeName}</div>
                      <div className="pt-tip-fund-meta">
                        <span>{f.fundHouse}</span>
                        <span className="pt-tip-fund-stats">
                          Quality: <strong>{f.qualityScore}</strong> | {tip.sector}: <strong>{f.sectorExposure}%</strong>
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
