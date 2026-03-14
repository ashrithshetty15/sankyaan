import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { useAuth } from './context/AuthContext';
import './PaperTrading.css';

const API = import.meta.env.VITE_API_URL ||
  (window.location.hostname === 'localhost' ? 'http://localhost:5000/api' : 'https://sankyaan-production.up.railway.app/api');

const TABS = ['Portfolio', 'New Trade', 'History', 'Leaderboard'];

const TIER_INFO = {
  Bronze:  { icon: '🥉', desc: 'New trader — < 10 trades' },
  Silver:  { icon: '🥈', desc: '≥ 10 trades, profitable' },
  Gold:    { icon: '🥇', desc: '≥ 30 trades, return > 5%, win rate > 50%' },
  Diamond: { icon: '💎', desc: '≥ 50 trades, Sharpe ≥ 1.0, return > 10%' },
};

function fmt(n, d = 2) { return n == null ? '—' : Number(n).toFixed(d); }
function fmtINR(n) { return n == null ? '—' : `₹${Number(n).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`; }
function fmtDate(ts) {
  if (!ts) return '—';
  return new Date(ts).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: true });
}

// ── Stats Bar ──────────────────────────────────────────────────────────────
function StatsBar({ portfolio, myStats }) {
  const tier = myStats?.tier || 'Bronze';
  const returnPct = parseFloat(myStats?.return_pct || 0);
  return (
    <div className="pt-stats-bar">
      <div className="pt-stat-card">
        <span className="pt-stat-val gold">{fmtINR(portfolio?.available_balance)}</span>
        <span className="pt-stat-lbl">Available</span>
      </div>
      <div className="pt-stat-card">
        <span className={`pt-stat-val ${(portfolio?.realised_pnl || 0) >= 0 ? 'positive' : 'negative'}`}>
          {fmtINR(portfolio?.realised_pnl)}
        </span>
        <span className="pt-stat-lbl">Realised P&amp;L</span>
      </div>
      <div className="pt-stat-card">
        <span className={`pt-stat-val ${returnPct >= 0 ? 'positive' : 'negative'}`}>
          {returnPct >= 0 ? '+' : ''}{fmt(returnPct)}%
        </span>
        <span className="pt-stat-lbl">Total Return</span>
      </div>
      <div className="pt-stat-card">
        <span className="pt-stat-val">{myStats?.win_rate != null ? `${fmt(myStats.win_rate)}%` : '—'}</span>
        <span className="pt-stat-lbl">Win Rate</span>
      </div>
      <div className="pt-stat-card">
        <span className="pt-stat-val">{myStats?.total_trades ?? 0}</span>
        <span className="pt-stat-lbl">Trades</span>
      </div>
      <div className="pt-stat-card">
        <span className="pt-stat-val">{TIER_INFO[tier]?.icon} {tier}</span>
        <span className="pt-stat-lbl">Your Tier</span>
      </div>
    </div>
  );
}

// ── Portfolio Tab ──────────────────────────────────────────────────────────
function PortfolioTab({ portfolio, onClose, refreshing }) {
  const positions = portfolio?.positions || [];
  if (positions.length === 0) {
    return <div className="pt-empty">No open positions. Use "New Trade" to enter your first trade.</div>;
  }
  return (
    <div className="pt-table-wrap">
      <table className="pt-table">
        <thead>
          <tr>
            <th>Symbol</th>
            <th>Type</th>
            <th>Qty</th>
            <th>Entry Price</th>
            <th>Value</th>
            <th>Entered</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          {positions.map(p => (
            <tr key={p.id}>
              <td className="symbol">{p.symbol}</td>
              <td><span className={`pt-badge ${p.trade_type.toLowerCase()}`}>{p.trade_type}</span></td>
              <td>{p.quantity}</td>
              <td>{fmtINR(p.entry_price)}</td>
              <td>{fmtINR(parseFloat(p.entry_price) * parseInt(p.quantity))}</td>
              <td>{fmtDate(p.entry_at)}</td>
              <td>
                <button className="pt-close-btn" onClick={() => onClose(p.id)} disabled={refreshing}>
                  Close Trade
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── New Trade Tab ──────────────────────────────────────────────────────────
function NewTradeTab({ onTradeEntered }) {
  const [form, setForm] = useState({ symbol: '', trade_type: 'BUY', quantity: '', entry_price: '', notes: '' });
  const [msg, setMsg] = useState({ text: '', type: '' });
  const [loading, setLoading] = useState(false);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const submit = async (e) => {
    e.preventDefault();
    if (!form.symbol || !form.quantity) return;
    setLoading(true);
    setMsg({ text: '', type: '' });
    try {
      await axios.post(`${API}/paper-trading/trade`, form, { withCredentials: true });
      setMsg({ text: `✓ ${form.trade_type} ${form.quantity} × ${form.symbol} entered!`, type: 'ok' });
      setForm(f => ({ ...f, symbol: '', quantity: '', entry_price: '', notes: '' }));
      onTradeEntered();
    } catch (err) {
      setMsg({ text: err.response?.data?.error || 'Failed to enter trade', type: 'err' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="pt-form-card">
      <form onSubmit={submit}>
        <div className="pt-form-row">
          <div className="pt-field">
            <label>Symbol</label>
            <input
              type="text"
              placeholder="e.g. RELIANCE"
              value={form.symbol}
              onChange={e => set('symbol', e.target.value.toUpperCase())}
              required
            />
          </div>
          <div className="pt-field">
            <label>Trade Type</label>
            <div className="pt-type-toggle">
              <button type="button" className={`pt-type-btn buy ${form.trade_type === 'BUY' ? 'active' : ''}`}
                onClick={() => set('trade_type', 'BUY')}>BUY</button>
              <button type="button" className={`pt-type-btn sell ${form.trade_type === 'SELL' ? 'active' : ''}`}
                onClick={() => set('trade_type', 'SELL')}>SELL</button>
            </div>
          </div>
        </div>
        <div className="pt-form-row">
          <div className="pt-field">
            <label>Quantity</label>
            <input type="number" min="1" placeholder="e.g. 10" value={form.quantity}
              onChange={e => set('quantity', e.target.value)} required />
          </div>
          <div className="pt-field">
            <label>Entry Price (optional)</label>
            <input type="number" step="0.01" placeholder="Auto-fill from market"
              value={form.entry_price} onChange={e => set('entry_price', e.target.value)} />
          </div>
        </div>
        <div className="pt-field" style={{ marginBottom: 14 }}>
          <label>Notes (optional)</label>
          <input type="text" placeholder="Your thesis..." value={form.notes}
            onChange={e => set('notes', e.target.value)} />
        </div>
        <button type="submit" className="pt-submit-btn" disabled={loading}>
          {loading ? 'Entering...' : `Enter ${form.trade_type} Trade`}
        </button>
        <div className={`pt-form-msg ${msg.type}`}>{msg.text}</div>
      </form>
    </div>
  );
}

// ── History Tab ────────────────────────────────────────────────────────────
function HistoryTab({ trades }) {
  if (!trades || trades.length === 0) {
    return <div className="pt-empty">No closed trades yet.</div>;
  }
  return (
    <div className="pt-table-wrap">
      <table className="pt-table">
        <thead>
          <tr>
            <th>Symbol</th>
            <th>Type</th>
            <th>Qty</th>
            <th>Entry</th>
            <th>Exit</th>
            <th>P&amp;L</th>
            <th>Result</th>
            <th>Closed</th>
          </tr>
        </thead>
        <tbody>
          {trades.map(t => {
            const pnl = parseFloat(t.pnl);
            const isWin = pnl >= 0;
            return (
              <tr key={t.id}>
                <td className="symbol">{t.symbol}</td>
                <td><span className={`pt-badge ${t.trade_type.toLowerCase()}`}>{t.trade_type}</span></td>
                <td>{t.quantity}</td>
                <td>{fmtINR(t.entry_price)}</td>
                <td>{fmtINR(t.exit_price)}</td>
                <td className={isWin ? 'positive' : 'negative'}>{isWin ? '+' : ''}{fmtINR(pnl)}</td>
                <td><span className={`pt-badge ${isWin ? 'win' : 'loss'}`}>{isWin ? 'WIN' : 'LOSS'}</span></td>
                <td>{fmtDate(t.exit_at)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── Leaderboard Tab ────────────────────────────────────────────────────────
function LeaderboardTab({ data }) {
  if (!data || data.length === 0) {
    return (
      <div>
        <div className="pt-tier-legend">
          {Object.entries(TIER_INFO).map(([tier, info]) => (
            <div key={tier} className="pt-tier-item">
              <span>{info.icon}</span> <strong>{tier}</strong> — {info.desc}
            </div>
          ))}
        </div>
        <div className="pt-empty">No ranked traders yet. Complete 10+ trades to appear on the leaderboard.</div>
      </div>
    );
  }
  return (
    <div>
      <div className="pt-tier-legend">
        {Object.entries(TIER_INFO).map(([tier, info]) => (
          <div key={tier} className="pt-tier-item">
            <span>{info.icon}</span> <strong>{tier}</strong> — {info.desc}
          </div>
        ))}
      </div>
      <div className="pt-table-wrap">
        <table className="pt-table pt-lb-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Trader</th>
              <th>Tier</th>
              <th>Return %</th>
              <th>Win Rate</th>
              <th>Trades</th>
              <th>Sharpe</th>
              <th>Streak</th>
              <th>Score</th>
            </tr>
          </thead>
          <tbody>
            {data.map(row => (
              <tr key={row.rank}>
                <td>
                  <span className={`pt-rank-num ${row.rank === 1 ? 'top1' : row.rank <= 3 ? 'top3' : ''}`}>
                    {row.rank === 1 ? '🥇' : row.rank === 2 ? '🥈' : row.rank === 3 ? '🥉' : `#${row.rank}`}
                  </span>
                </td>
                <td className="symbol">{row.name}</td>
                <td><span className="pt-tier-badge">{TIER_INFO[row.tier]?.icon}</span> {row.tier}</td>
                <td className={row.return_pct >= 0 ? 'positive' : 'negative'}>
                  {row.return_pct >= 0 ? '+' : ''}{fmt(row.return_pct)}%
                </td>
                <td>{fmt(row.win_rate)}%</td>
                <td>{row.total_trades}</td>
                <td>{fmt(row.sharpe_score, 3)}</td>
                <td>{row.streak_days}d</td>
                <td className="positive">{fmt(row.rank_score, 2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────
export default function PaperTrading() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState(0);
  const [portfolio, setPortfolio] = useState(null);
  const [history, setHistory] = useState([]);
  const [myStats, setMyStats] = useState(null);
  const [leaderboard, setLeaderboard] = useState([]);
  const [refreshing, setRefreshing] = useState(false);

  const loadPortfolio = useCallback(async () => {
    if (!user) return;
    try {
      const [portRes, statsRes] = await Promise.all([
        axios.get(`${API}/paper-trading/portfolio`, { withCredentials: true }),
        axios.get(`${API}/paper-trading/stats`, { withCredentials: true }),
      ]);
      setPortfolio(portRes.data);
      setMyStats(statsRes.data);
    } catch (e) {
      console.error('Portfolio load error:', e.message);
    }
  }, [user]);

  const loadHistory = useCallback(async () => {
    if (!user) return;
    try {
      const res = await axios.get(`${API}/paper-trading/history`, { withCredentials: true });
      setHistory(res.data.trades || []);
    } catch (e) { console.error('History load error:', e.message); }
  }, [user]);

  const loadLeaderboard = useCallback(async () => {
    try {
      const res = await axios.get(`${API}/paper-trading/leaderboard`);
      setLeaderboard(res.data.leaderboard || []);
    } catch (e) { console.error('Leaderboard load error:', e.message); }
  }, []);

  useEffect(() => {
    loadPortfolio();
    loadLeaderboard();
  }, [loadPortfolio, loadLeaderboard]);

  useEffect(() => {
    if (activeTab === 2) loadHistory();
    if (activeTab === 3) loadLeaderboard();
  }, [activeTab, loadHistory, loadLeaderboard]);

  const handleClose = async (tradeId) => {
    setRefreshing(true);
    try {
      await axios.put(`${API}/paper-trading/trade/${tradeId}/close`, {}, { withCredentials: true });
      await loadPortfolio();
    } catch (e) {
      alert(e.response?.data?.error || 'Failed to close trade');
    } finally {
      setRefreshing(false);
    }
  };

  if (!user) {
    return (
      <div className="pt-container">
        <div className="pt-login-prompt">
          <h3>Login to Trade</h3>
          <p>Sign in with Google to start paper trading with ₹10,00,000 virtual capital and compete on the leaderboard.</p>
        </div>
        <div style={{ marginTop: 24 }}>
          <div className="pt-tabs">
            <button className="pt-tab active">Leaderboard</button>
          </div>
          <LeaderboardTab data={leaderboard} />
        </div>
      </div>
    );
  }

  return (
    <div className="pt-container">
      <StatsBar portfolio={portfolio} myStats={myStats} />

      <div className="pt-tabs">
        {TABS.map((tab, i) => (
          <button key={tab} className={`pt-tab ${activeTab === i ? 'active' : ''}`}
            onClick={() => setActiveTab(i)}>{tab}</button>
        ))}
      </div>

      {activeTab === 0 && (
        <PortfolioTab portfolio={portfolio} onClose={handleClose} refreshing={refreshing} />
      )}
      {activeTab === 1 && (
        <NewTradeTab onTradeEntered={() => { loadPortfolio(); setActiveTab(0); }} />
      )}
      {activeTab === 2 && <HistoryTab trades={history} />}
      {activeTab === 3 && <LeaderboardTab data={leaderboard} />}
    </div>
  );
}
