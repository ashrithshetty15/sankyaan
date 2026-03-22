import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { useAuth } from './context/AuthContext';
import './PaperTrading.css';

const API = import.meta.env.VITE_API_URL ||
  (window.location.hostname === 'localhost' ? 'http://localhost:5000/api' : 'https://sankyaan-backend.fly.dev/api');

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

const INDEX_SUGGESTIONS = [
  { symbol: 'NIFTY', label: 'Nifty 50' },
  { symbol: 'BANKNIFTY', label: 'Bank Nifty' },
  { symbol: 'MIDCPNIFTY', label: 'Midcap Nifty' },
  { symbol: 'FINNIFTY', label: 'Fin Nifty' },
];

// ── Underlying Search (indices + stocks) ──────────────────────────────────
function UnderlyingSearchInput({ value, onChange }) {
  const [query, setQuery] = useState(value || 'NIFTY');
  const [results, setResults] = useState([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [searching, setSearching] = useState(false);
  const debounceRef = React.useRef(null);

  const clean = (v) => v.toUpperCase().replace(/\.(NS|BO)$/, '');

  const handleInput = (e) => {
    const raw = e.target.value.toUpperCase();
    setQuery(raw);
    clearTimeout(debounceRef.current);
    const val = clean(raw);
    if (!val) { setResults(INDEX_SUGGESTIONS); setShowDropdown(true); return; }
    // Check if matches an index first
    const idxMatch = INDEX_SUGGESTIONS.filter(i => i.symbol.startsWith(val));
    setResults(idxMatch);
    setShowDropdown(true);
    if (val.length < 2) return;
    setSearching(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await axios.get(`${API}/stocks/search/${encodeURIComponent(val)}`);
        const stocks = (res.data.results || []).map(r => ({ symbol: r.symbol, label: r.company_name }));
        setResults([...INDEX_SUGGESTIONS.filter(i => i.symbol.startsWith(val)), ...stocks]);
        setShowDropdown(true);
      } catch (_) {}
      finally { setSearching(false); }
    }, 300);
  };

  const select = (sym) => {
    const s = clean(sym);
    setQuery(s);
    onChange(s);
    setShowDropdown(false);
    setResults([]);
  };

  return (
    <div className="pt-sym-wrap">
      <input type="text" value={query}
        onChange={handleInput}
        onFocus={() => { if (!query) { setResults(INDEX_SUGGESTIONS); setShowDropdown(true); } else if (results.length) setShowDropdown(true); }}
        onBlur={() => { const s = clean(query); if (s !== query) { setQuery(s); onChange(s); } setTimeout(() => setShowDropdown(false), 150); }}
        placeholder="NIFTY, BANKNIFTY, RELIANCE..."
        autoComplete="off" />
      {searching && <div className="pt-sym-searching">Searching...</div>}
      {showDropdown && results.length > 0 && (
        <div className="pt-sym-dropdown">
          {results.map(r => (
            <div key={r.symbol} className="pt-sym-item" onMouseDown={() => select(r.symbol)}>
              <span className="pt-sym-ticker">{r.symbol}</span>
              <span className="pt-sym-name">{r.label}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Option Chain Picker ────────────────────────────────────────────────────
function OptionChainPicker({ underlying, onSelect }) {
  const OPT_MONTHS = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
  // Always have expiry dates via client-side calculation (same as FuturesPicker)
  const expiries = getNSEFuturesExpiries(4);
  const [selectedExpiry, setSelectedExpiry] = useState(expiries[0]?.date || '');
  const [strikes, setStrikes] = useState([]);
  const [atm, setAtm] = useState(null);
  const [underlyingLtp, setUnderlyingLtp] = useState(null);
  const [selectedStrike, setSelectedStrike] = useState('');
  const [manualStrike, setManualStrike] = useState('');
  const [optionType, setOptionType] = useState('CE');
  const [loading, setLoading] = useState(false);
  const [noChainData, setNoChainData] = useState(false);

  // Build Fyers-style option symbol from parts (used when chain data unavailable)
  const buildSymbol = (strike, type, expDate) => {
    if (!expDate || !strike) return '';
    const d = new Date(expDate);
    const yy = String(d.getFullYear()).slice(2);
    const mon = OPT_MONTHS[d.getMonth()];
    return `NSE:${underlying}${yy}${mon}${strike}${type}`;
  };

  const fetchStrikes = useCallback(async (expiry) => {
    if (!expiry || !underlying) return;
    setLoading(true);
    setNoChainData(false);
    try {
      const url = `${API}/paper-trading/option-chain/${encodeURIComponent(underlying)}?expiry=${encodeURIComponent(expiry)}`;
      const res = await axios.get(url);
      const { strikes: stks, atm: atmVal, underlyingLtp: ltp } = res.data;
      const validStrikes = (stks || []).filter(s => s.strike > 0);
      setStrikes(validStrikes);
      setAtm(atmVal);
      setUnderlyingLtp(ltp);
      if (validStrikes.length > 0) {
        const atmStr = String(atmVal || validStrikes[Math.floor(validStrikes.length / 2)].strike);
        setSelectedStrike(atmStr);
        setNoChainData(false);
      } else {
        setNoChainData(true);
        setSelectedStrike('');
        if (atmVal) setManualStrike(String(atmVal));
      }
    } catch (_) {
      setNoChainData(true);
      setStrikes([]);
    } finally {
      setLoading(false);
    }
  }, [underlying]);

  useEffect(() => {
    if (selectedExpiry) fetchStrikes(selectedExpiry);
  }, [selectedExpiry, fetchStrikes]);

  // Notify parent when strike/type changes with Fyers chain data
  useEffect(() => {
    if (!strikes.length || !selectedStrike || !selectedExpiry) return;
    const row = strikes.find(s => String(s.strike) === selectedStrike);
    const side = optionType === 'CE' ? 'ce' : 'pe';
    const opt = row?.[side];
    onSelect({
      symbol: opt?.symbol || buildSymbol(selectedStrike, optionType, selectedExpiry),
      ltp: opt?.ltp || '',
      strike: selectedStrike,
      optionType,
      expiry: selectedExpiry,
    });
  }, [selectedStrike, optionType, strikes]);

  // Notify parent when manual strike changes (no chain data case)
  useEffect(() => {
    if (!noChainData || !manualStrike || !selectedExpiry) return;
    onSelect({
      symbol: buildSymbol(manualStrike, optionType, selectedExpiry),
      ltp: '',
      strike: manualStrike,
      optionType,
      expiry: selectedExpiry,
    });
  }, [manualStrike, optionType, noChainData, selectedExpiry]);

  return (
    <div className="pt-chain-picker">
      {underlyingLtp && (
        <div className="pt-chain-ltp">
          <span className="pt-chain-ltp-val">{fmtINR(underlyingLtp)}</span>
          <span className="pt-chain-ltp-lbl">{underlying} LTP</span>
        </div>
      )}
      <div className="pt-chain-row">
        <div className="pt-field">
          <label>Expiry</label>
          <select value={selectedExpiry} onChange={e => setSelectedExpiry(e.target.value)} disabled={loading}>
            {expiries.map(e => <option key={e.date} value={e.date}>{e.label}</option>)}
          </select>
        </div>
        <div className="pt-field">
          <label>Strike</label>
          {strikes.length > 0 ? (
            <select value={selectedStrike} onChange={e => setSelectedStrike(e.target.value)} disabled={loading}>
              {strikes.map(s => (
                <option key={s.strike} value={String(s.strike)}>
                  {s.strike}{s.strike === atm ? ' (ATM)' : ''}
                </option>
              ))}
            </select>
          ) : (
            <input type="number" min="1" step="50" placeholder="e.g. 25000"
              value={manualStrike} onChange={e => setManualStrike(e.target.value)}
              disabled={loading} />
          )}
        </div>
        <div className="pt-field">
          <label>Type</label>
          <div className="pt-type-toggle">
            <button type="button" className={`pt-type-btn ce ${optionType === 'CE' ? 'active' : ''}`}
              onClick={() => setOptionType('CE')}>CE</button>
            <button type="button" className={`pt-type-btn pe ${optionType === 'PE' ? 'active' : ''}`}
              onClick={() => setOptionType('PE')}>PE</button>
          </div>
        </div>
      </div>
      {loading && <div className="pt-chain-loading">Loading strikes...</div>}
      {noChainData && !loading && (
        <div className="pt-chain-na">Live strike data unavailable — enter strike price manually above</div>
      )}
      {strikes.length > 0 && selectedStrike && (() => {
        const row = strikes.find(s => String(s.strike) === selectedStrike);
        const side = optionType === 'CE' ? 'ce' : 'pe';
        const opt = row?.[side];
        return opt ? (
          <div className="pt-chain-preview">
            <span className="pt-chain-sym">{opt.symbol || buildSymbol(selectedStrike, optionType, selectedExpiry)}</span>
            <span className="pt-chain-ltp-badge">LTP: {fmtINR(opt.ltp)}</span>
            {opt.oi > 0 && <span className="pt-chain-oi">OI: {opt.oi.toLocaleString('en-IN')}</span>}
          </div>
        ) : null;
      })()}
    </div>
  );
}

/** Generate NSE monthly F&O expiry dates (last Thursday of each month) */
function getNSEFuturesExpiries(count = 4) {
  const MONTHS = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
  const result = [];
  const now = new Date();
  for (let offset = 0; offset <= count + 1 && result.length < count; offset++) {
    const d = new Date(now.getFullYear(), now.getMonth() + offset, 1);
    // Last Thursday of this month
    const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0);
    const dow = lastDay.getDay(); // 0=Sun,4=Thu
    const lastThursday = new Date(lastDay);
    lastThursday.setDate(lastDay.getDate() - ((dow + 3) % 7));
    if (lastThursday >= now) {
      const yyyy = lastThursday.getFullYear();
      const mm = String(lastThursday.getMonth() + 1).padStart(2, '0');
      const dd = String(lastThursday.getDate()).padStart(2, '0');
      const yy = String(yyyy).slice(2);
      const mon = MONTHS[lastThursday.getMonth()];
      result.push({ date: `${yyyy}-${mm}-${dd}`, label: `${dd} ${mon} ${yyyy}`, futSymbol: `NSE:${null}${yy}${mon}FUT` });
    }
  }
  return result;
}

// ── Futures Picker ─────────────────────────────────────────────────────────
function FuturesPicker({ underlying, onSelect }) {
  const MONTHS = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
  const expiries = getNSEFuturesExpiries(4);
  const [selectedExpiry, setSelectedExpiry] = useState(expiries[0]?.date || '');

  const buildSymbol = (dateStr) => {
    const d = new Date(dateStr);
    return `NSE:${underlying}${String(d.getFullYear()).slice(2)}${MONTHS[d.getMonth()]}FUT`;
  };

  useEffect(() => {
    if (!selectedExpiry) return;
    onSelect({ symbol: buildSymbol(selectedExpiry), expiry: selectedExpiry });
  }, [selectedExpiry, underlying]);

  return (
    <div className="pt-chain-picker">
      <div className="pt-chain-row">
        <div className="pt-field">
          <label>Expiry</label>
          <select value={selectedExpiry} onChange={e => setSelectedExpiry(e.target.value)}>
            {expiries.map(e => <option key={e.date} value={e.date}>{e.label}</option>)}
          </select>
        </div>
        {selectedExpiry && (
          <div className="pt-chain-preview" style={{ marginTop: 0 }}>
            <span className="pt-chain-sym">{buildSymbol(selectedExpiry)}</span>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Symbol Search Input with Autocomplete ─────────────────────────────────
function SymbolSearchInput({ value, onChange }) {
  const [query, setQuery] = useState(value || '');
  const [results, setResults] = useState([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [searching, setSearching] = useState(false);
  const debounceRef = React.useRef(null);

  const handleInput = (e) => {
    const val = e.target.value.toUpperCase();
    setQuery(val);
    onChange(val);
    setResults([]);
    clearTimeout(debounceRef.current);
    if (val.length < 2) { setShowDropdown(false); return; }
    setSearching(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await axios.get(`${API}/stocks/search/${encodeURIComponent(val)}`);
        setResults(res.data.results || []);
        setShowDropdown(true);
      } catch (_) { setResults([]); }
      finally { setSearching(false); }
    }, 300);
  };

  const select = (sym) => {
    setQuery(sym);
    onChange(sym);
    setShowDropdown(false);
    setResults([]);
  };

  return (
    <div className="pt-sym-wrap">
      <input type="text" placeholder="e.g. RELIANCE" value={query}
        onChange={handleInput}
        onBlur={() => setTimeout(() => setShowDropdown(false), 150)}
        onFocus={() => results.length > 0 && setShowDropdown(true)}
        autoComplete="off" required />
      {searching && <div className="pt-sym-searching">Searching...</div>}
      {showDropdown && results.length > 0 && (
        <div className="pt-sym-dropdown">
          {results.map(r => (
            <div key={r.symbol} className="pt-sym-item" onMouseDown={() => select(r.symbol)}>
              <span className="pt-sym-ticker">{r.symbol}</span>
              <span className="pt-sym-name">{r.company_name}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── New Trade Tab ──────────────────────────────────────────────────────────
function NewTradeTab({ onTradeEntered }) {
  const [instrType, setInstrType] = useState('equity'); // equity | options | futures
  const [form, setForm] = useState({ symbol: '', trade_type: 'BUY', quantity: '', entry_price: '', notes: '' });
  const [underlying, setUnderlying] = useState('NIFTY');
  const [msg, setMsg] = useState({ text: '', type: '' });
  const [loading, setLoading] = useState(false);
  const [priceLoading, setPriceLoading] = useState(false);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const fetchAndSetPrice = async (symbol) => {
    if (!symbol) return;
    setPriceLoading(true);
    try {
      const res = await axios.get(`${API}/paper-trading/price/${encodeURIComponent(symbol)}`);
      setForm(f => ({ ...f, entry_price: String(res.data.price) }));
    } catch (_) {
      setForm(f => ({ ...f, entry_price: '' }));
    } finally {
      setPriceLoading(false);
    }
  };

  const handleInstrChange = (type) => {
    setInstrType(type);
    setForm(f => ({ ...f, symbol: '', entry_price: '' }));
  };

  const handleEquitySymbolSelect = (sym) => {
    set('symbol', sym);
    fetchAndSetPrice(sym);
  };

  const handleOptionSelect = ({ symbol, ltp }) => {
    setForm(f => ({ ...f, symbol, entry_price: ltp ? String(ltp) : '' }));
  };

  const handleFuturesSelect = ({ symbol }) => {
    setForm(f => ({ ...f, symbol, entry_price: '' }));
    if (symbol) fetchAndSetPrice(symbol);
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!form.symbol || !form.quantity) return;
    setLoading(true);
    setMsg({ text: '', type: '' });
    try {
      await axios.post(`${API}/paper-trading/trade`, form, { withCredentials: true });
      setMsg({ text: `✓ ${form.trade_type} ${form.quantity} × ${form.symbol} entered!`, type: 'ok' });
      setForm(f => ({ ...f, symbol: instrType === 'equity' ? '' : f.symbol, quantity: '', entry_price: '', notes: '' }));
      onTradeEntered();
    } catch (err) {
      setMsg({ text: err.response?.data?.error || 'Failed to enter trade', type: 'err' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="pt-newtrade-wrap">
      {/* Instrument type tabs */}
      <div className="pt-instr-tabs">
        {[['equity', '📊 Equity'], ['options', '🎯 Options'], ['futures', '🔮 Futures']].map(([val, label]) => (
          <button key={val} type="button"
            className={`pt-instr-tab ${instrType === val ? 'active' : ''}`}
            onClick={() => handleInstrChange(val)}>{label}</button>
        ))}
      </div>

      <div className="pt-form-card">
        <form onSubmit={submit}>
          {/* Equity: symbol with autocomplete */}
          {instrType === 'equity' && (
            <div className="pt-form-row">
              <div className="pt-field">
                <label>Symbol</label>
                <SymbolSearchInput value={form.symbol} onChange={handleEquitySymbolSelect} />
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
          )}

          {/* Options: underlying (search) + chain picker */}
          {instrType === 'options' && (
            <>
              <div className="pt-form-row" style={{ marginBottom: 8 }}>
                <div className="pt-field">
                  <label>Underlying (index or stock)</label>
                  <UnderlyingSearchInput value={underlying} onChange={setUnderlying} />
                </div>
                <div className="pt-field">
                  <label>Direction</label>
                  <div className="pt-type-toggle">
                    <button type="button" className={`pt-type-btn buy ${form.trade_type === 'BUY' ? 'active' : ''}`}
                      onClick={() => set('trade_type', 'BUY')}>BUY</button>
                    <button type="button" className={`pt-type-btn sell ${form.trade_type === 'SELL' ? 'active' : ''}`}
                      onClick={() => set('trade_type', 'SELL')}>SELL</button>
                  </div>
                </div>
              </div>
              <OptionChainPicker key={underlying} underlying={underlying} onSelect={handleOptionSelect} />
              {form.symbol && (
                <div className="pt-selected-sym">
                  Selected: <strong>{form.symbol}</strong>
                  {form.entry_price && <span> · LTP: {fmtINR(form.entry_price)}</span>}
                </div>
              )}
            </>
          )}

          {/* Futures: underlying (search) + expiry picker */}
          {instrType === 'futures' && (
            <>
              <div className="pt-form-row" style={{ marginBottom: 8 }}>
                <div className="pt-field">
                  <label>Underlying (index or stock)</label>
                  <UnderlyingSearchInput value={underlying} onChange={setUnderlying} />
                </div>
                <div className="pt-field">
                  <label>Direction</label>
                  <div className="pt-type-toggle">
                    <button type="button" className={`pt-type-btn buy ${form.trade_type === 'BUY' ? 'active' : ''}`}
                      onClick={() => set('trade_type', 'BUY')}>BUY</button>
                    <button type="button" className={`pt-type-btn sell ${form.trade_type === 'SELL' ? 'active' : ''}`}
                      onClick={() => set('trade_type', 'SELL')}>SELL</button>
                  </div>
                </div>
              </div>
              <FuturesPicker key={underlying} underlying={underlying} onSelect={handleFuturesSelect} />
              {form.symbol && (
                <div className="pt-selected-sym">Selected: <strong>{form.symbol}</strong></div>
              )}
            </>
          )}

          {/* Common fields */}
          <div className="pt-form-row" style={{ marginTop: 14 }}>
            <div className="pt-field">
              <label>Quantity {instrType === 'options' ? '(lots)' : ''}</label>
              <input type="number" min="1" placeholder={instrType === 'options' ? 'Lots' : 'e.g. 10'}
                value={form.quantity} onChange={e => set('quantity', e.target.value)} required />
            </div>
            <div className="pt-field">
              <label>
                Entry Price
                {priceLoading && <span className="pt-price-fetching"> · Fetching...</span>}
                {!priceLoading && form.entry_price && instrType !== 'options' && <span className="pt-price-live"> ● LIVE</span>}
              </label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                placeholder={priceLoading ? 'Fetching price...' : 'Enter price'}
                value={form.entry_price}
                onChange={e => set('entry_price', e.target.value)}
                disabled={priceLoading}
                required
              />
            </div>
          </div>
          <div className="pt-field" style={{ marginBottom: 14 }}>
            <label>Notes (optional)</label>
            <input type="text" placeholder="Your thesis..." value={form.notes}
              onChange={e => set('notes', e.target.value)} />
          </div>
          <button type="submit" className="pt-submit-btn" disabled={loading || !form.symbol}>
            {loading ? 'Entering...' : `Enter ${form.trade_type} Trade`}
          </button>
          <div className={`pt-form-msg ${msg.type}`}>{msg.text}</div>
        </form>
      </div>
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
