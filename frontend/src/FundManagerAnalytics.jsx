import React, { useState, useEffect } from 'react';
import axios from 'axios';
import './FundManagerAnalytics.css';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

const getQualityColor = (score) => {
  if (score >= 80) return '#22c55e';
  if (score >= 60) return '#eab308';
  if (score >= 40) return '#f97316';
  return '#ef4444';
};

const getReturnColor = (val) => {
  if (val == null) return undefined;
  return val >= 0 ? '#22c55e' : '#ef4444';
};

const getAltmanColor = (score) => {
  if (score >= 3) return '#22c55e';
  if (score >= 1.8) return '#eab308';
  return '#ef4444';
};

const getPiotroskiColor = (score) => {
  const pct = (score / 9) * 100;
  return getQualityColor(pct);
};

const formatAum = (crores) => {
  if (crores == null || crores === 0) return '—';
  if (crores >= 100000) return `₹${(crores / 100000).toFixed(1)}L Cr`;
  return `₹${Math.round(crores).toLocaleString('en-IN')} Cr`;
};

const formatFundAge = (startDate) => {
  if (!startDate) return null;
  const start = new Date(startDate);
  const now = new Date();
  const months = (now.getFullYear() - start.getFullYear()) * 12 + (now.getMonth() - start.getMonth());
  if (months < 12) return `${months}mo`;
  const years = Math.floor(months / 12);
  const rem = months % 12;
  return rem > 0 ? `${years}y ${rem}mo` : `${years}y`;
};

const getQualityLabel = (score) => {
  if (score >= 80) return 'Excellent';
  if (score >= 70) return 'Good';
  if (score >= 50) return 'Average';
  return 'Below Avg';
};

export default function FundManagerAnalytics({ onFundClick }) {
  const [managers, setManagers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterHouse, setFilterHouse] = useState('');
  const [fundHouses, setFundHouses] = useState([]);
  const [sortConfig, setSortConfig] = useState({ key: 'totalAumCrores', direction: 'desc' });
  const [expandedManager, setExpandedManager] = useState(null);

  useEffect(() => {
    const fetchManagers = async () => {
      try {
        setLoading(true);
        const res = await axios.get(`${API_URL}/fund-managers`);
        setManagers(res.data.managers || []);

        // Extract unique fund houses
        const houses = new Set();
        (res.data.managers || []).forEach(m => m.fundHouses.forEach(h => houses.add(h)));
        setFundHouses([...houses].sort());
      } catch (err) {
        console.error('Failed to fetch fund managers:', err);
        setError('Failed to load fund manager data.');
      } finally {
        setLoading(false);
      }
    };
    fetchManagers();
  }, []);

  const handleSort = (key) => {
    setSortConfig(prev => ({
      key,
      direction: prev.key === key && prev.direction === 'desc' ? 'asc' : 'desc'
    }));
  };

  const getFilteredSorted = () => {
    let filtered = managers;

    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(m => m.managerName.toLowerCase().includes(term));
    }

    if (filterHouse) {
      filtered = filtered.filter(m => m.fundHouses.includes(filterHouse));
    }

    return [...filtered].sort((a, b) => {
      const aVal = a[sortConfig.key] != null ? a[sortConfig.key] : -Infinity;
      const bVal = b[sortConfig.key] != null ? b[sortConfig.key] : -Infinity;
      return sortConfig.direction === 'desc' ? bVal - aVal : aVal - bVal;
    });
  };

  const SortIndicator = ({ col }) => {
    if (sortConfig.key !== col) return <span className="fm-sort-inactive">{'\u2195'}</span>;
    return <span className="fm-sort-active">{sortConfig.direction === 'desc' ? '\u2193' : '\u2191'}</span>;
  };

  const sorted = getFilteredSorted();

  if (loading) {
    return (
      <div className="fm-container">
        <div className="fm-loading">
          <div className="fm-spinner"></div>
          <p>Loading fund managers...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="fm-container">
        <div className="fm-error">{error}</div>
      </div>
    );
  }

  return (
    <div className="fm-container">
      <div className="fm-header">
        <div className="fm-title-block">
          <p className="fm-subtitle">
            {sorted.length} fund managers ranked by assets under management
          </p>
        </div>
        <div className="fm-badge">{sorted.length} Managers</div>
      </div>

      {/* Filters */}
      <div className="fm-filters">
        <input
          type="text"
          placeholder="Search manager name..."
          value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
          className="fm-search"
        />
        <select
          value={filterHouse}
          onChange={e => setFilterHouse(e.target.value)}
          className="fm-filter-select"
        >
          <option value="">All Fund Houses</option>
          {fundHouses.map(h => <option key={h} value={h}>{h}</option>)}
        </select>
      </div>

      {/* Table */}
      <div className="fm-table-wrapper">
        <table className="fm-table">
          <thead>
            <tr>
              <th className="fm-col-name">Manager</th>
              <th className="fm-col-house">Fund House(s)</th>
              <th className="fm-col-num fm-sortable" onClick={() => handleSort('fundCount')}>
                Funds <SortIndicator col="fundCount" />
              </th>
              <th className="fm-col-num fm-sortable" onClick={() => handleSort('avgQuality')}>
                Avg Quality <SortIndicator col="avgQuality" />
              </th>
              <th className="fm-col-num fm-sortable" onClick={() => handleSort('totalAumCrores')}>
                AUM <SortIndicator col="totalAumCrores" />
              </th>
              <th className="fm-col-num fm-sortable" onClick={() => handleSort('avgCagr1y')}>
                Avg 1Y <SortIndicator col="avgCagr1y" />
              </th>
              <th className="fm-col-num fm-sortable" onClick={() => handleSort('avgCagr3y')}>
                Avg 3Y <SortIndicator col="avgCagr3y" />
              </th>
              <th className="fm-col-num fm-sortable" onClick={() => handleSort('avgCagr5y')}>
                Avg 5Y <SortIndicator col="avgCagr5y" />
              </th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((mgr, idx) => (
              <React.Fragment key={mgr.managerName}>
                <tr
                  className={`fm-row ${expandedManager === mgr.managerName ? 'expanded' : ''}`}
                  onClick={() => setExpandedManager(expandedManager === mgr.managerName ? null : mgr.managerName)}
                >
                  <td className="fm-col-name">
                    <div className="fm-manager-name">{mgr.managerName}</div>
                    <div className="fm-expand-hint">{expandedManager === mgr.managerName ? '\u25B2 collapse' : '\u25BC expand'}</div>
                  </td>
                  <td className="fm-col-house">
                    <div className="fm-houses-tags">
                      {mgr.fundHouses.map(h => (
                        <span key={h} className="fm-house-tag">{h}</span>
                      ))}
                    </div>
                  </td>
                  <td className="fm-col-num">
                    <span className="fm-fund-count">{mgr.fundCount}</span>
                  </td>
                  <td className="fm-col-num">
                    <div className="fm-score-pill" style={{ background: getQualityColor(mgr.avgQuality) }}>
                      <span className="fm-score-num">{Math.round(mgr.avgQuality)}</span>
                      <span className="fm-score-label">{getQualityLabel(mgr.avgQuality)}</span>
                    </div>
                  </td>
                  <td className="fm-col-num">
                    <span className="fm-aum">{formatAum(mgr.totalAumCrores)}</span>
                  </td>
                  {['avgCagr1y', 'avgCagr3y', 'avgCagr5y'].map(key => {
                    const val = mgr[key];
                    return (
                      <td key={key} className="fm-col-num">
                        {val != null ? (
                          <span className="fm-cagr" style={{ color: getReturnColor(val) }}>
                            {val >= 0 ? '+' : ''}{val.toFixed(1)}%
                          </span>
                        ) : <span className="fm-na">N/A</span>}
                      </td>
                    );
                  })}
                </tr>

                {/* Expanded funds row */}
                {expandedManager === mgr.managerName && (
                  <tr className="fm-expand-row">
                    <td colSpan={8}>
                      <div className="fm-expand-content">
                        <div className="fm-expand-title">Funds managed by {mgr.managerName}</div>

                        {/* 5-Pillar Summary */}
                        <div className="fm-pillar-summary">
                          {[
                            { label: 'Profitability', val: mgr.avgProfitability },
                            { label: 'Fin. Strength', val: mgr.avgFinancialStrength },
                            { label: 'Earnings', val: mgr.avgEarningsQuality },
                            { label: 'Growth', val: mgr.avgGrowth },
                            { label: 'Valuation', val: mgr.avgValuation },
                          ].map(p => (
                            <div key={p.label} className="fm-pillar-item">
                              <div className="fm-pillar-val" style={{ color: getQualityColor(p.val) }}>
                                {p.val != null ? Math.round(p.val) : '—'}
                              </div>
                              <div className="fm-pillar-label">{p.label}</div>
                            </div>
                          ))}
                          <div className="fm-pillar-item">
                            <div className="fm-pillar-val" style={{ color: getAltmanColor(mgr.avgAltmanZ) }}>
                              {mgr.avgAltmanZ.toFixed(1)}
                            </div>
                            <div className="fm-pillar-label">Altman Z</div>
                          </div>
                        </div>

                        {/* Individual funds list */}
                        <div className="fm-fund-list">
                          {mgr.funds.map((fund, fi) => {
                            const q = fund.qualityScore != null ? parseFloat(fund.qualityScore) : null;
                            return (
                              <div
                                key={fi}
                                className="fm-fund-item"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (onFundClick) onFundClick(fund.fundName, fund.schemeName);
                                }}
                                title="Click to view fund portfolio"
                              >
                                <div className="fm-fi-name">{fund.schemeName || fund.fundName}</div>
                                <div className="fm-fi-house">{fund.fundHouse}</div>
                                <div className="fm-fi-score" style={{ color: q != null ? getQualityColor(q) : 'var(--text3)' }}>
                                  {q != null ? Math.round(q) : '—'}
                                </div>
                                <div className="fm-fi-aum">{formatAum(fund.aumCrores)}</div>
                                <div className="fm-fi-age">{formatFundAge(fund.startDate) || '—'}</div>
                                {['cagr1y', 'cagr3y', 'cagr5y'].map(k => {
                                  const v = fund[k] != null ? parseFloat(fund[k]) : null;
                                  return (
                                    <div key={k} className="fm-fi-cagr" style={{ color: v != null ? getReturnColor(v) : 'var(--text3)' }}>
                                      {v != null ? `${v >= 0 ? '+' : ''}${v.toFixed(1)}%` : 'N/A'}
                                    </div>
                                  );
                                })}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            ))}
          </tbody>
        </table>

        {sorted.length === 0 && (
          <div className="fm-no-results">No managers match your search.</div>
        )}
      </div>
    </div>
  );
}
