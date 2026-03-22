import React, { useState, useCallback, useRef } from 'react';
import axios from 'axios';
import './StockCommentary.css';

const API = import.meta.env.VITE_API_URL ||
  (window.location.hostname === 'localhost' ? 'http://localhost:5000/api' : 'https://sankyaan-backend.fly.dev/api');

const POPULAR = ['RELIANCE', 'HDFCBANK', 'INFY', 'TCS', 'ICICIBANK', 'BAJFINANCE', 'SBIN', 'TATAMOTORS', 'WIPRO', 'NAUKRI'];

function fmt(n, d = 2) { return n == null ? '—' : Number(n).toFixed(d); }
function fmtINR(n) { return n == null ? '—' : `₹${Number(n).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`; }
function fmtOI(n) { return n == null ? '—' : n >= 1e5 ? `${(n / 1e5).toFixed(1)}L` : n.toLocaleString('en-IN'); }

function getPCRColor(pcr) {
  if (pcr == null) return '#8b95a8';
  if (pcr > 1.2) return '#3ddc84';
  if (pcr < 0.8) return '#ff6b6b';
  return '#f0b429';
}

function getPCRLabel(pcr) {
  if (pcr == null) return 'Unknown';
  if (pcr > 1.2) return 'Bullish';
  if (pcr < 0.8) return 'Bearish';
  return 'Neutral';
}

function formatNewsDate(pubDate) {
  if (!pubDate) return '';
  try {
    const d = new Date(pubDate);
    return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' });
  } catch { return ''; }
}

function OICard({ label, metrics }) {
  if (!metrics) return null;
  const { pcr, maxPain, topCE = [], topPE = [], expiry,
          atmIV, atmDelta, atmGamma, atmTheta, ivSkew, expectedMove } = metrics;
  const pcrColor = getPCRColor(pcr);
  const hasGreeks = atmIV != null || atmDelta != null || atmGamma != null;

  return (
    <div className="sc-oi-card">
      <div className="sc-oi-header">
        <span className="sc-oi-label">{label}</span>
        <span className="sc-oi-expiry">{expiry}</span>
        <span className="sc-pcr-badge" style={{ color: pcrColor, borderColor: pcrColor }}>
          PCR {fmt(pcr, 2)} · {getPCRLabel(pcr)}
        </span>
        {maxPain && <span className="sc-maxpain">Max Pain: {fmtINR(maxPain)}</span>}
      </div>

      {hasGreeks && (
        <div className="sc-greeks-row">
          {atmIV != null && (
            <span className="sc-greek-chip">
              <span className="sc-greek-lbl">IV</span> {fmt(atmIV)}%
            </span>
          )}
          {expectedMove != null && (
            <span className="sc-greek-chip">
              <span className="sc-greek-lbl">Exp. Move</span> ±{expectedMove}
            </span>
          )}
          {atmDelta != null && (
            <span className="sc-greek-chip">
              <span className="sc-greek-lbl">Δ</span> {fmt(atmDelta, 3)}
            </span>
          )}
          {atmGamma != null && (
            <span className="sc-greek-chip">
              <span className="sc-greek-lbl">Γ</span> {fmt(atmGamma, 4)}
            </span>
          )}
          {atmTheta != null && (
            <span className="sc-greek-chip">
              <span className="sc-greek-lbl">Θ</span> -{fmt(atmTheta)}/day
            </span>
          )}
          {ivSkew != null && (
            <span className="sc-greek-chip" style={{ color: ivSkew > 3 ? '#f0b429' : '#94a3b8' }}>
              <span className="sc-greek-lbl">IV Skew</span> {ivSkew > 0 ? '+' : ''}{fmt(ivSkew)}%
            </span>
          )}
        </div>
      )}

      <div className="sc-oi-grid">
        <div className="sc-oi-col">
          <div className="sc-oi-col-title">🟢 Support (PE OI)</div>
          {topPE.slice(0, 5).map(s => (
            <div key={s.strike} className="sc-oi-row">
              <span className="sc-strike">{fmtINR(s.strike)}</span>
              <div className="sc-oi-bar-wrap">
                <div className="sc-oi-bar pe" style={{ width: `${Math.min(100, (s.oi / (topPE[0]?.oi || 1)) * 100)}%` }} />
              </div>
              <span className="sc-oi-val">{fmtOI(s.oi)}</span>
            </div>
          ))}
        </div>
        <div className="sc-oi-col">
          <div className="sc-oi-col-title">🔴 Resistance (CE OI)</div>
          {topCE.slice(0, 5).map(s => (
            <div key={s.strike} className="sc-oi-row">
              <span className="sc-strike">{fmtINR(s.strike)}</span>
              <div className="sc-oi-bar-wrap">
                <div className="sc-oi-bar ce" style={{ width: `${Math.min(100, (s.oi / (topCE[0]?.oi || 1)) * 100)}%` }} />
              </div>
              <span className="sc-oi-val">{fmtOI(s.oi)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function OptionChainTable({ chain, spot }) {
  if (!chain?.length) return null;
  const atmStrike = spot
    ? chain.reduce((p, c) => Math.abs(c.strike - spot) < Math.abs(p.strike - spot) ? c : p).strike
    : null;

  const maxCE = Math.max(...chain.map(r => r.ce?.oi || 0), 1);
  const maxPE = Math.max(...chain.map(r => r.pe?.oi || 0), 1);

  return (
    <div className="sc-chain-card">
      <div className="sc-chain-title">📋 Option Chain (Near Month)</div>
      <div className="sc-chain-table">
        <div className="sc-chain-header">
          <span className="sc-chain-ce-col">OI</span>
          <span className="sc-chain-ce-col sc-chain-hide-mobile">IV%</span>
          <span className="sc-chain-ce-col">LTP</span>
          <span className="sc-chain-strike-hdr">Strike</span>
          <span className="sc-chain-pe-col">LTP</span>
          <span className="sc-chain-pe-col sc-chain-hide-mobile">IV%</span>
          <span className="sc-chain-pe-col">OI</span>
        </div>
        <div className="sc-chain-side-labels">
          <span style={{ color: '#ff6b6b' }}>— CALLS —</span>
          <span></span>
          <span style={{ color: '#3ddc84' }}>— PUTS —</span>
        </div>
        {chain.map(row => (
          <div key={row.strike} className={`sc-chain-row${row.strike === atmStrike ? ' sc-chain-atm' : ''}`}>
            <span className="sc-chain-ce-col sc-chain-oi-wrap">
              <span className="sc-chain-oi-bar-wrap">
                <span className="sc-chain-oi-bar ce" style={{ width: `${Math.min(100, ((row.ce?.oi || 0) / maxCE) * 100)}%` }} />
              </span>
              <span className="sc-chain-oi-val">{fmtOI(row.ce?.oi || 0)}</span>
            </span>
            <span className="sc-chain-ce-col sc-chain-hide-mobile">{row.ce?.iv ? fmt(row.ce.iv) : '—'}</span>
            <span className="sc-chain-ce-col sc-chain-ltp">{row.ce?.ltp ? fmtINR(row.ce.ltp) : '—'}</span>
            <span className={`sc-chain-strike${row.strike === atmStrike ? ' sc-chain-strike-atm' : ''}`}>
              {fmtINR(row.strike)}
            </span>
            <span className="sc-chain-pe-col sc-chain-ltp">{row.pe?.ltp ? fmtINR(row.pe.ltp) : '—'}</span>
            <span className="sc-chain-pe-col sc-chain-hide-mobile">{row.pe?.iv ? fmt(row.pe.iv) : '—'}</span>
            <span className="sc-chain-pe-col sc-chain-oi-wrap">
              <span className="sc-chain-oi-val">{fmtOI(row.pe?.oi || 0)}</span>
              <span className="sc-chain-oi-bar-wrap">
                <span className="sc-chain-oi-bar pe" style={{ width: `${Math.min(100, ((row.pe?.oi || 0) / maxPE) * 100)}%` }} />
              </span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function StockCommentary() {
  const [input, setInput] = useState('');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [lastRefresh, setLastRefresh] = useState(null);
  const fetchingRef = useRef(false);

  const load = useCallback(async (sym, force = false) => {
    if (!sym) return;
    if (fetchingRef.current) return;
    fetchingRef.current = true;
    setLoading(true);
    setError('');
    try {
      const res = await axios.get(`${API}/stock-commentary?symbol=${encodeURIComponent(sym.toUpperCase())}${force ? '&force=1' : ''}`, { withCredentials: true });
      setData(res.data);
      setLastRefresh(new Date());
    } catch (e) {
      setError(e.response?.data?.error || `Failed to load data for ${sym.toUpperCase()}`);
      setData(null);
    } finally {
      setLoading(false);
      fetchingRef.current = false;
    }
  }, []);

  const handleSearch = (e) => {
    e.preventDefault();
    const sym = input.trim().toUpperCase();
    if (sym) load(sym);
  };

  const handleQuick = (sym) => {
    setInput(sym);
    load(sym);
  };

  const { symbol, spot, nearMonth, nextMonth, commentary, commentaryError, marketOpen, news, dataSource } = data || {};

  return (
    <div className="sc-container">
      {/* ── Search ── */}
      <form className="sc-search-bar" onSubmit={handleSearch}>
        <input
          className="sc-search-input"
          type="text"
          placeholder="Enter NSE F&O symbol (e.g. RELIANCE, HDFCBANK, TCS)"
          value={input}
          onChange={e => setInput(e.target.value.toUpperCase())}
          autoFocus
        />
        <button className="sc-search-btn" type="submit" disabled={loading || !input.trim()}>
          {loading ? '⏳' : '🔍'} Analyse
        </button>
      </form>

      {/* ── Popular chips ── */}
      <div className="sc-popular">
        {POPULAR.map(sym => (
          <button key={sym} className={`sc-chip ${symbol === sym ? 'active' : ''}`} onClick={() => handleQuick(sym)}>
            {sym}
          </button>
        ))}
      </div>

      {error && <div className="sc-error">{error}</div>}

      {loading && (
        <div className="sc-loading">
          <div className="sc-spinner" />
          <span>Fetching F&O data and news for {input}...</span>
        </div>
      )}

      {!loading && data && (
        <>
          {/* ── Stock header ── */}
          <div className="sc-stock-header">
            <div className="sc-stock-title-group">
              <span className="sc-symbol">{symbol}</span>
              {spot && (
                <span className="sc-price" style={{ color: (spot.changePct ?? 0) >= 0 ? '#3ddc84' : '#ff6b6b' }}>
                  {fmtINR(spot.price)}
                  {spot.changePct != null && (
                    <span className="sc-chg">
                      {spot.changePct >= 0 ? ' +' : ' '}{fmt(spot.changePct)}%
                      {spot.change != null && ` (${spot.change >= 0 ? '+' : ''}${fmt(spot.change, 2)})`}
                    </span>
                  )}
                </span>
              )}
            </div>
            <div className="sc-header-right">
              {!marketOpen && <span className="sc-market-closed">🔴 Market Closed</span>}
              {dataSource && (
                <span className="sc-source-badge">via {dataSource === 'fyers' ? 'Fyers' : 'NSE'}</span>
              )}
              {lastRefresh && (
                <span className="sc-updated">
                  {lastRefresh.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })} IST
                </span>
              )}
              <button className="sc-refresh-btn" onClick={() => load(symbol, true)} disabled={loading}>
                ↻ Refresh
              </button>
            </div>
          </div>

          {/* ── AI Commentary ── */}
          {commentary ? (
            <div className="sc-commentary-card">
              <div className="sc-commentary-header">
                <span className="sc-ai-badge">✦ AI Analysis</span>
                <span className="sc-commentary-time">
                  {data.timestamp ? new Date(data.timestamp).toLocaleTimeString('en-IN', {
                    hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata'
                  }) + ' IST' : ''}
                </span>
              </div>
              <div className="sc-commentary-text">
                {commentary.split('\n\n').map((para, i) => (
                  <p key={i}>{para}</p>
                ))}
              </div>
            </div>
          ) : (
            <div className="sc-no-commentary">
              {commentaryError && commentaryError !== 'ANTHROPIC_API_KEY not set'
                ? <span>⚠️ AI error: <code>{commentaryError}</code></span>
                : <span>🔑 Set <code>ANTHROPIC_API_KEY</code> in Railway to enable AI commentary</span>
              }
            </div>
          )}

          {/* ── OI Tables ── */}
          <div className="sc-oi-pair">
            <OICard label="Near Month" metrics={nearMonth} />
            <OICard label="Next Month" metrics={nextMonth} />
          </div>

          {!nearMonth && !nextMonth && (
            <div className="sc-no-data">
              Option chain data unavailable for <strong>{symbol}</strong> — this symbol may not have active F&O contracts, or data could not be fetched.
            </div>
          )}

          {/* ── Full Option Chain Table ── */}
          {data.optionChain?.length > 0 && (
            <OptionChainTable chain={data.optionChain} spot={spot?.price} />
          )}

          {/* ── News ── */}
          {news?.length > 0 && (
            <div className="sc-news-card">
              <div className="sc-news-title">📰 Recent News</div>
              {news.map((item, i) => (
                <a key={i} href={item.link} target="_blank" rel="noopener noreferrer" className="sc-news-item">
                  <span className="sc-news-headline">{item.title}</span>
                  {item.pubDate && <span className="sc-news-time">{formatNewsDate(item.pubDate)}</span>}
                </a>
              ))}
            </div>
          )}
        </>
      )}

      {!loading && !data && !error && (
        <div className="sc-empty">
          <div className="sc-empty-icon">📊</div>
          <p>Search for any NSE F&O stock to get live option chain, Greeks, OI analysis, and AI commentary</p>
        </div>
      )}
    </div>
  );
}
