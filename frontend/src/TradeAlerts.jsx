import React, { useState, useEffect } from 'react';
import axios from 'axios';
import './TradeAlerts.css';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

/**
 * Check if NSE market is currently open.
 * NSE hours: Mon–Fri, 9:15 AM – 3:30 PM IST.
 */
function isMarketOpen() {
  const now = new Date();
  const ist = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
  const day = ist.getDay(); // 0=Sun, 6=Sat
  if (day === 0 || day === 6) return false;
  const minutes = ist.getHours() * 60 + ist.getMinutes();
  return minutes >= 555 && minutes <= 930; // 9:15 AM to 3:30 PM
}

function getNextMarketOpen() {
  const now = new Date();
  const ist = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
  const day = ist.getDay();
  const minutes = ist.getHours() * 60 + ist.getMinutes();

  let daysUntil = 0;
  if (day === 6) daysUntil = 2;        // Sat → Mon
  else if (day === 0) daysUntil = 1;    // Sun → Mon
  else if (minutes > 930) daysUntil = day === 5 ? 3 : 1; // After 3:30 PM → next weekday
  // else today before 9:15 AM → daysUntil = 0

  const next = new Date(ist);
  next.setDate(next.getDate() + daysUntil);
  next.setHours(9, 15, 0, 0);

  if (daysUntil === 0) {
    return 'today at 9:15 AM IST';
  }
  return next.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short' }) + ' at 9:15 AM IST';
}

const STRATEGY_LABELS = {
  iron_condor: 'Iron Condor',
  bull_put_spread: 'Bull Put Spread',
  bear_call_spread: 'Bear Call Spread',
  short_strangle: 'Short Strangle',
};

const STRATEGY_COLORS = {
  iron_condor: '#4f9cf9',
  bull_put_spread: '#3ddc84',
  bear_call_spread: '#ff6b6b',
  short_strangle: '#ffd166',
};

const LOT_SIZES = { NIFTY: 75, BANKNIFTY: 15 };

const getLotSize = (underlying) => LOT_SIZES[underlying] || 50;

const formatINR = (val) => {
  if (val == null) return '-';
  return '₹' + Number(val).toLocaleString('en-IN', { maximumFractionDigits: 0 });
};

const formatNumber = (val, decimals = 2) => {
  if (val == null) return '-';
  return Number(val).toFixed(decimals);
};

const formatDate = (dateStr) => {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
};

export default function TradeAlerts() {
  const [alerts, setAlerts] = useState([]);
  const [stats, setStats] = useState({});
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('active'); // 'active' | 'history'
  const [expandedAlert, setExpandedAlert] = useState(null);

  // Filters
  const [strategyFilter, setStrategyFilter] = useState('all');
  const [underlyingFilter, setUnderlyingFilter] = useState('all');
  const [riskFilter, setRiskFilter] = useState('all');


  const fetchAlerts = async () => {
    try {
      setLoading(true);
      setError(null);

      const params = new URLSearchParams();
      if (strategyFilter !== 'all') params.set('strategy', strategyFilter);
      if (underlyingFilter !== 'all') params.set('underlying', underlyingFilter);
      if (riskFilter !== 'all') params.set('risk_level', riskFilter);

      const res = await axios.get(`${API_URL}/trade-alerts?${params}`, { withCredentials: true });
      setAlerts(res.data.alerts || []);
      setStats(res.data.stats || {});
    } catch (err) {
      setError('Failed to load trade alerts.');
      setAlerts([]);
    } finally {
      setLoading(false);
    }
  };

  const fetchHistory = async () => {
    try {
      const res = await axios.get(`${API_URL}/trade-alerts/history`, { withCredentials: true });
      setHistory(res.data.alerts || []);
    } catch (err) {
      console.error('Failed to load alert history:', err);
    }
  };

  const handleScan = async () => {
    try {
      setScanning(true);
      await axios.post(`${API_URL}/trade-alerts/scan`, {}, { withCredentials: true });
      await fetchAlerts();
    } catch (err) {
      setError(err.response?.data?.error || 'Scan failed. Connect to Fyers first.');
    } finally {
      setScanning(false);
    }
  };

  useEffect(() => {
    fetchAlerts();
  }, [strategyFilter, underlyingFilter, riskFilter]);

  useEffect(() => {
    if (activeTab === 'history') fetchHistory();
  }, [activeTab]);

  const getScoreColor = (score) => {
    if (score >= 70) return '#3ddc84';
    if (score >= 50) return '#f0b429';
    return '#ff6b6b';
  };

  const getRiskBadgeClass = (level) => {
    if (level === 'Low') return 'risk-low';
    if (level === 'Medium') return 'risk-medium';
    return 'risk-high';
  };

  return (
    <div className="trade-alerts">
      {/* Summary Bar */}
      <div className="ta-summary-bar">
        <div className="ta-stat-card">
          <div className="ta-stat-value">{stats.active_count || 0}</div>
          <div className="ta-stat-label">Active Alerts</div>
        </div>
        <div className="ta-stat-card">
          <div className="ta-stat-value" style={{ color: '#f0b429' }}>
            {stats.avg_score || '-'}
          </div>
          <div className="ta-stat-label">Avg Score</div>
        </div>
        <div className="ta-stat-card">
          <div className="ta-stat-value" style={{ color: stats.win_rate >= 60 ? '#3ddc84' : '#f0b429' }}>
            {stats.win_rate != null ? `${stats.win_rate}%` : '-'}
          </div>
          <div className="ta-stat-label">Win Rate ({stats.total_closed || 0} trades)</div>
        </div>
        <button
          className={`ta-scan-btn ${scanning ? 'scanning' : ''}`}
          onClick={handleScan}
          disabled={scanning}
        >
          {scanning ? 'Scanning...' : 'Scan Now'}
        </button>
      </div>

      {/* Tabs */}
      <div className="ta-tabs">
        <button
          className={`ta-tab ${activeTab === 'active' ? 'active' : ''}`}
          onClick={() => setActiveTab('active')}
        >
          Active Alerts
        </button>
        <button
          className={`ta-tab ${activeTab === 'history' ? 'active' : ''}`}
          onClick={() => setActiveTab('history')}
        >
          History
        </button>
      </div>

      {/* Filters */}
      {activeTab === 'active' && (
        <div className="ta-filters">
          <div className="ta-filter-group">
            <label>Strategy</label>
            <select value={strategyFilter} onChange={e => setStrategyFilter(e.target.value)}>
              <option value="all">All</option>
              <option value="iron_condor">Iron Condor</option>
              <option value="bull_put_spread">Bull Put Spread</option>
              <option value="bear_call_spread">Bear Call Spread</option>
              <option value="short_strangle">Short Strangle</option>
            </select>
          </div>
          <div className="ta-filter-group">
            <label>Underlying</label>
            <select value={underlyingFilter} onChange={e => setUnderlyingFilter(e.target.value)}>
              <option value="all">All</option>
              <option value="NIFTY">NIFTY</option>
              <option value="BANKNIFTY">BANKNIFTY</option>
            </select>
          </div>
          <div className="ta-filter-group">
            <label>Risk</label>
            <select value={riskFilter} onChange={e => setRiskFilter(e.target.value)}>
              <option value="all">All</option>
              <option value="Low">Low</option>
              <option value="Medium">Medium</option>
              <option value="High">High</option>
            </select>
          </div>
        </div>
      )}

      {/* Error */}
      {error && <div className="ta-error">{error}</div>}

      {/* Loading */}
      {loading && <div className="ta-loading">Loading trade alerts...</div>}

      {/* Active Alerts */}
      {activeTab === 'active' && !loading && (
        <div className="ta-alerts-list">
          {alerts.length === 0 ? (
            <div className="ta-empty">
              {isMarketOpen() ? (
                <>
                  <div className="ta-empty-icon">{String.fromCodePoint(0x1F3AF)}</div>
                  <p>No active trade alerts.</p>
                  <p className="ta-empty-sub">Hit "Scan Now" to scan for high-probability options setups.</p>
                </>
              ) : (
                <>
                  <div className="ta-empty-icon">🕐</div>
                  <p>Market is closed</p>
                  <p className="ta-empty-sub">
                    NSE trading hours: Mon–Fri, 9:15 AM – 3:30 PM IST.<br />
                    Next open: {getNextMarketOpen()}
                  </p>
                </>
              )}
            </div>
          ) : (
            alerts.map((alert) => (
              <div
                key={alert.id}
                className={`ta-alert-card ${expandedAlert === alert.id ? 'expanded' : ''}`}
                onClick={() => setExpandedAlert(expandedAlert === alert.id ? null : alert.id)}
              >
                <div className="ta-alert-header">
                  <div className="ta-alert-left">
                    <span
                      className="ta-strategy-badge"
                      style={{ backgroundColor: STRATEGY_COLORS[alert.strategy] + '22', color: STRATEGY_COLORS[alert.strategy], borderColor: STRATEGY_COLORS[alert.strategy] + '44' }}
                    >
                      {STRATEGY_LABELS[alert.strategy] || alert.strategy}
                    </span>
                    <span className="ta-underlying">{alert.underlying}</span>
                    <span className="ta-expiry">Exp: {formatDate(alert.expiry)}</span>
                  </div>
                  <div className="ta-alert-right">
                    <div className="ta-score-circle" style={{ borderColor: getScoreColor(alert.probability_score) }}>
                      <span style={{ color: getScoreColor(alert.probability_score) }}>{alert.probability_score}</span>
                    </div>
                    <span className={`ta-risk-badge ${getRiskBadgeClass(alert.risk_level)}`}>
                      {alert.risk_level}
                    </span>
                  </div>
                </div>

                <div className="ta-alert-metrics">
                  <div className="ta-metric">
                    <span className="ta-metric-label">Max Profit (1 lot)</span>
                    <span className="ta-metric-value green">
                      {formatINR(alert.max_profit * getLotSize(alert.underlying))}
                    </span>
                  </div>
                  <div className="ta-metric">
                    <span className="ta-metric-label">Max Loss (1 lot)</span>
                    <span className="ta-metric-value red">
                      {alert.max_loss != null ? formatINR(alert.max_loss * getLotSize(alert.underlying)) : 'Unlimited'}
                    </span>
                  </div>
                  <div className="ta-metric">
                    <span className="ta-metric-label">Margin Req.</span>
                    <span className="ta-metric-value">
                      {(() => {
                        const lot = getLotSize(alert.underlying);
                        if (alert.strategy === 'short_strangle' && Array.isArray(alert.breakeven)) {
                          return formatINR(alert.breakeven[1] * 0.12 * lot);
                        }
                        return alert.max_loss != null ? formatINR(alert.max_loss * lot) : '-';
                      })()}
                    </span>
                  </div>
                  <div className="ta-metric">
                    <span className="ta-metric-label">Lot Size</span>
                    <span className="ta-metric-value">{getLotSize(alert.underlying)}</span>
                  </div>
                  <div className="ta-metric">
                    <span className="ta-metric-label">IV Rank</span>
                    <span className="ta-metric-value gold">{formatNumber(alert.iv_rank, 0)}%</span>
                  </div>
                </div>

                {/* Breakeven */}
                {alert.breakeven && (
                  <div className="ta-breakeven">
                    Breakeven: {(Array.isArray(alert.breakeven) ? alert.breakeven : []).map(b => formatNumber(b, 0)).join(' — ')}
                  </div>
                )}

                {/* Expanded: Legs Table */}
                {expandedAlert === alert.id && alert.legs && (
                  <div className="ta-legs-section">
                    <table className="ta-legs-table">
                      <thead>
                        <tr>
                          <th>Action</th>
                          <th>Type</th>
                          <th>Strike</th>
                          <th>LTP</th>
                          <th>IV</th>
                          <th>Delta</th>
                          <th>OI</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(Array.isArray(alert.legs) ? alert.legs : []).map((leg, i) => (
                          <tr key={i} className={leg.action === 'SELL' ? 'sell-row' : 'buy-row'}>
                            <td>
                              <span className={`ta-action-badge ${leg.action === 'SELL' ? 'sell' : 'buy'}`}>
                                {leg.action}
                              </span>
                            </td>
                            <td>{leg.type}</td>
                            <td className="ta-strike">{leg.strike}</td>
                            <td>{formatNumber(leg.ltp)}</td>
                            <td>{formatNumber(leg.iv, 1)}%</td>
                            <td>{formatNumber(leg.delta, 3)}</td>
                            <td>{leg.oi ? leg.oi.toLocaleString('en-IN') : '-'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <div className="ta-alert-time">
                      Generated: {new Date(alert.created_at).toLocaleString('en-IN')}
                    </div>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {/* History Tab */}
      {activeTab === 'history' && !loading && (
        <div className="ta-history-list">
          {history.length === 0 ? (
            <div className="ta-empty">
              <p>No trade history yet.</p>
            </div>
          ) : (
            <table className="ta-history-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Strategy</th>
                  <th>Underlying</th>
                  <th>Score</th>
                  <th>Entry</th>
                  <th>Exit</th>
                  <th>P&L</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {history.map((h) => (
                  <tr key={h.id}>
                    <td>{formatDate(h.created_at)}</td>
                    <td>
                      <span className="ta-strategy-badge-sm" style={{ color: STRATEGY_COLORS[h.strategy] }}>
                        {STRATEGY_LABELS[h.strategy] || h.strategy}
                      </span>
                    </td>
                    <td>{h.underlying}</td>
                    <td>{h.probability_score}</td>
                    <td>{formatNumber(h.entry_price)}</td>
                    <td>{formatNumber(h.exit_price)}</td>
                    <td className={h.pnl > 0 ? 'green' : h.pnl < 0 ? 'red' : ''}>
                      {h.pnl != null ? formatNumber(h.pnl) : '-'}
                    </td>
                    <td>
                      <span className={`ta-status-badge ${h.status}`}>{h.status}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}