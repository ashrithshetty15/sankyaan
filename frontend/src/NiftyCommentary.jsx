import React, { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';
import './NiftyCommentary.css';

const API = import.meta.env.VITE_API_URL ||
  (window.location.hostname === 'localhost' ? 'http://localhost:5000/api' : 'https://sankyaan-backend.fly.dev/api');

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

const INDICES = [
  { key: 'nifty', label: 'Nifty 50', accent: '#60a5fa', spotKey: 'spot', commentaryKey: 'nifty' },
  { key: 'banknifty', label: 'Bank Nifty', accent: '#a78bfa', spotKey: 'bankniftySpot', commentaryKey: 'banknifty' },
  { key: 'midcap', label: 'Midcap Nifty', accent: '#34d399', spotKey: 'midcapSpot', commentaryKey: 'midcap' },
  { key: 'finnifty', label: 'Fin Nifty', accent: '#fb923c', spotKey: 'finniftySpot', commentaryKey: 'finnifty' },
];

function Countdown({ nextUpdateAt, onTick }) {
  const [secs, setSecs] = useState(0);
  useEffect(() => {
    const tick = () => {
      const remaining = Math.max(0, Math.floor((nextUpdateAt - Date.now()) / 1000));
      setSecs(remaining);
      if (remaining === 0 && onTick) onTick();
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [nextUpdateAt]);

  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return <span className="nc-countdown">{m}:{String(s).padStart(2, '0')}</span>;
}

/* ── Key Metrics Dashboard ── */
function MetricCard({ label, value, sub, color, large }) {
  return (
    <div className={`nc-metric-card${large ? ' nc-metric-large' : ''}`}>
      <div className="nc-metric-label">{label}</div>
      <div className="nc-metric-value" style={color ? { color } : undefined}>{value}</div>
      {sub && <div className="nc-metric-sub">{sub}</div>}
    </div>
  );
}

function KeyMetrics({ spot, oiData, accent }) {
  const weekly = oiData?.weekly;
  if (!weekly && !spot) return null;

  const pcr = weekly?.pcr;
  const pcrColor = getPCRColor(pcr);
  const topSupport = weekly?.topPE?.[0];
  const topResistance = weekly?.topCE?.[0];

  return (
    <div className="nc-metrics-grid">
      <MetricCard
        label="Spot Price"
        value={spot ? fmtINR(spot.price) : '—'}
        sub={spot ? `${spot.changePct >= 0 ? '+' : ''}${fmt(spot.changePct)}%` : null}
        color={spot?.changePct >= 0 ? '#3ddc84' : '#ff6b6b'}
        large
      />
      <MetricCard
        label="PCR"
        value={pcr != null ? fmt(pcr, 2) : '—'}
        sub={getPCRLabel(pcr)}
        color={pcrColor}
        large
      />
      <MetricCard
        label="Max Pain"
        value={weekly?.maxPain ? fmtINR(weekly.maxPain) : '—'}
        sub={weekly?.expiry || null}
        color="#e2e8f0"
        large
      />
      <MetricCard
        label="ATM IV"
        value={weekly?.atmIV != null ? `${fmt(weekly.atmIV)}%` : '—'}
        sub={weekly?.expectedMove != null ? `Exp. Move ±${weekly.expectedMove}` : null}
        color={weekly?.atmIV > 20 ? '#ff6b6b' : weekly?.atmIV > 15 ? '#f0b429' : '#3ddc84'}
        large
      />
      <MetricCard
        label="Key Support"
        value={topSupport ? fmtINR(topSupport.strike) : '—'}
        sub={topSupport ? `OI: ${fmtOI(topSupport.oi)}` : null}
        color="#3ddc84"
      />
      <MetricCard
        label="Key Resistance"
        value={topResistance ? fmtINR(topResistance.strike) : '—'}
        sub={topResistance ? `OI: ${fmtOI(topResistance.oi)}` : null}
        color="#ff6b6b"
      />
      {weekly?.atmDelta != null && (
        <MetricCard label="Delta" value={fmt(weekly.atmDelta, 3)} color="#94a3b8" />
      )}
      {weekly?.atmGamma != null && (
        <MetricCard label="Gamma" value={fmt(weekly.atmGamma, 4)} color="#94a3b8" />
      )}
      {weekly?.atmTheta != null && (
        <MetricCard label="Theta" value={`-${fmt(weekly.atmTheta)}/d`} color="#94a3b8" />
      )}
      {weekly?.ivSkew != null && (
        <MetricCard
          label="IV Skew"
          value={`${weekly.ivSkew > 0 ? '+' : ''}${fmt(weekly.ivSkew)}%`}
          color={weekly.ivSkew > 3 ? '#f0b429' : '#94a3b8'}
        />
      )}
    </div>
  );
}

/* ── OI Levels (Support / Resistance bars) ── */
function OILevels({ oiData }) {
  const weekly = oiData?.weekly;
  if (!weekly) return null;
  const { topCE = [], topPE = [] } = weekly;
  if (topCE.length === 0 && topPE.length === 0) return null;

  return (
    <div className="nc-oi-levels">
      <div className="nc-oi-col">
        <div className="nc-oi-col-title">Support (Put OI)</div>
        {topPE.slice(0, 5).map(s => (
          <div key={s.strike} className="nc-oi-row">
            <span className="nc-strike">{fmtINR(s.strike)}</span>
            <div className="nc-oi-bar-wrap">
              <div className="nc-oi-bar pe" style={{ width: `${Math.min(100, (s.oi / (topPE[0]?.oi || 1)) * 100)}%` }} />
            </div>
            <span className="nc-oi-val">{fmtOI(s.oi)}</span>
          </div>
        ))}
      </div>
      <div className="nc-oi-col">
        <div className="nc-oi-col-title">Resistance (Call OI)</div>
        {topCE.slice(0, 5).map(s => (
          <div key={s.strike} className="nc-oi-row">
            <span className="nc-strike">{fmtINR(s.strike)}</span>
            <div className="nc-oi-bar-wrap">
              <div className="nc-oi-bar ce" style={{ width: `${Math.min(100, (s.oi / (topCE[0]?.oi || 1)) * 100)}%` }} />
            </div>
            <span className="nc-oi-val">{fmtOI(s.oi)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Option Chain Table ── */
function IndexOptionChainTable({ chain, spot }) {
  if (!chain || chain.length === 0) return null;
  const atmStrike = spot
    ? chain.reduce((p, c) => Math.abs(c.strike - spot) < Math.abs(p.strike - spot) ? c : p).strike
    : chain.find(r => r.isATM)?.strike;
  const maxCE = Math.max(...chain.map(r => r.ce?.oi || 0), 1);
  const maxPE = Math.max(...chain.map(r => r.pe?.oi || 0), 1);

  return (
    <div className="nc-chain-table">
      <div className="nc-chain-header">
        <span className="nc-chain-ce-col">OI</span>
        <span className="nc-chain-ce-col nc-chain-hide-mobile">IV%</span>
        <span className="nc-chain-ce-col">LTP</span>
        <span className="nc-chain-strike-hdr">Strike</span>
        <span className="nc-chain-pe-col">LTP</span>
        <span className="nc-chain-pe-col nc-chain-hide-mobile">IV%</span>
        <span className="nc-chain-pe-col">OI</span>
      </div>
      {chain.map(row => (
        <div key={row.strike} className={`nc-chain-row${row.strike === atmStrike ? ' nc-chain-atm' : ''}`}>
          <span className="nc-chain-ce-col nc-chain-oi-wrap">
            <span className="nc-chain-oi-bar-wrap">
              <span className="nc-chain-oi-bar ce" style={{ width: `${Math.min(100, ((row.ce?.oi || 0) / maxCE) * 100)}%` }} />
            </span>
            <span className="nc-chain-oi-val">{fmtOI(row.ce?.oi || 0)}</span>
          </span>
          <span className="nc-chain-ce-col nc-chain-hide-mobile">{row.ce?.iv ? fmt(row.ce.iv) : '—'}</span>
          <span className="nc-chain-ce-col nc-chain-ltp">{row.ce?.ltp ? fmt(row.ce.ltp) : '—'}</span>
          <span className={`nc-chain-strike${row.strike === atmStrike ? ' nc-chain-strike-atm' : ''}`}>
            {row.strike}
          </span>
          <span className="nc-chain-pe-col nc-chain-ltp">{row.pe?.ltp ? fmt(row.pe.ltp) : '—'}</span>
          <span className="nc-chain-pe-col nc-chain-hide-mobile">{row.pe?.iv ? fmt(row.pe.iv) : '—'}</span>
          <span className="nc-chain-pe-col nc-chain-oi-wrap">
            <span className="nc-chain-oi-val">{fmtOI(row.pe?.oi || 0)}</span>
            <span className="nc-chain-oi-bar-wrap">
              <span className="nc-chain-oi-bar pe" style={{ width: `${Math.min(100, ((row.pe?.oi || 0) / maxPE) * 100)}%` }} />
            </span>
          </span>
        </div>
      ))}
    </div>
  );
}

export default function NiftyCommentary() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [lastRefresh, setLastRefresh] = useState(null);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [chainOpen, setChainOpen] = useState(false);
  const fetchingRef = useRef(false);

  const load = useCallback(async (force = false) => {
    if (fetchingRef.current) return;
    fetchingRef.current = true;
    setLoading(true);
    setError('');
    try {
      const res = await axios.get(`${API}/nifty-commentary${force ? '?force=1' : ''}`, { withCredentials: true });
      setData(res.data);
      setLastRefresh(new Date());
    } catch (e) {
      setError(e.response?.data?.error || 'Failed to load data');
    } finally {
      setLoading(false);
      fetchingRef.current = false;
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const { vix, commentaries, marketOpen } = data || {};
  const c = commentaries || {};
  const idx = INDICES[selectedIndex];
  const spot = data?.[idx.spotKey];
  const oiData = data?.[idx.key];
  const commentary = c[idx.commentaryKey];
  const commentaryError = c.errors?.[idx.commentaryKey];
  const chain = oiData?.weeklyChain;

  return (
    <div className="nc-container">
      {/* ── Header ── */}
      <div className="nc-header">
        <div className="nc-title-row">
          <h2 className="nc-title">Live F&O Commentary</h2>
          <div className="nc-controls">
            {!marketOpen && data && (
              <span className="nc-market-closed">Market Closed</span>
            )}
            {data?.nextUpdateAt && !loading && marketOpen && (
              <span className="nc-next">
                Next update in <Countdown nextUpdateAt={data.nextUpdateAt} onTick={() => load(true)} />
              </span>
            )}
            <button className="nc-refresh-btn" onClick={() => load(true)} disabled={loading}>
              {loading ? '...' : '↻'} Refresh
            </button>
          </div>
        </div>
        {lastRefresh && (
          <div className="nc-updated">
            Last updated: {lastRefresh.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })} IST
            {!marketOpen && data && ' · Showing last market session data'}
          </div>
        )}
      </div>

      {error && <div className="nc-error">{error} <button onClick={() => load(true)}>Retry</button></div>}

      {loading && !data && (
        <div className="nc-loading">
          <div className="nc-spinner" />
          <span>Fetching live F&O data and generating commentary...</span>
        </div>
      )}

      {data && (
        <>
          {/* ── VIX bar ── */}
          {vix && (
            <div className="nc-vix-bar">
              <span className="nc-vix-label">India VIX</span>
              <span className="nc-vix-val" style={{
                color: vix.value < 15 ? '#3ddc84' : vix.value < 20 ? '#f0b429' : '#ff6b6b'
              }}>{fmt(vix.value)}</span>
              <span className="nc-vix-badge" style={{
                color: vix.value < 15 ? '#3ddc84' : vix.value < 20 ? '#f0b429' : '#ff6b6b'
              }}>{vix.level}</span>
            </div>
          )}

          {/* ── Index Selector ── */}
          <div className="nc-index-selector">
            {INDICES.map((ind, i) => {
              const s = data?.[ind.spotKey];
              return (
                <button
                  key={ind.key}
                  className={`nc-index-tab${selectedIndex === i ? ' nc-index-tab-active' : ''}`}
                  style={selectedIndex === i ? { borderColor: ind.accent, color: ind.accent } : undefined}
                  onClick={() => { setSelectedIndex(i); setChainOpen(false); }}
                >
                  <span className="nc-tab-name">{ind.label}</span>
                  {s && (
                    <span className="nc-tab-price" style={{ color: s.changePct >= 0 ? '#3ddc84' : '#ff6b6b' }}>
                      {fmtINR(s.price)} <span className="nc-tab-chg">{s.changePct >= 0 ? '+' : ''}{fmt(s.changePct)}%</span>
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* ── Key Metrics ── */}
          <KeyMetrics spot={spot} oiData={oiData} accent={idx.accent} />

          {/* ── AI Commentary ── */}
          {commentary ? (
            <div className="nc-index-commentary" style={{ borderLeftColor: idx.accent }}>
              <div className="nc-index-commentary-header">
                <span className="nc-ai-badge">✦ AI Analysis</span>
                {data?.timestamp && (
                  <span className="nc-commentary-time">
                    {new Date(data.timestamp).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' })} IST
                  </span>
                )}
              </div>
              <div className="nc-commentary-text">
                {commentary.split('\n\n').map((para, i) => <p key={i}>{para}</p>)}
              </div>
            </div>
          ) : commentaryError ? (
            <div className="nc-index-commentary-error">{commentaryError}</div>
          ) : null}

          {/* ── OI Levels ── */}
          <OILevels oiData={oiData} />

          {/* ── Option Chain ── */}
          <div className="nc-chain-section">
            {chain && chain.length > 0 ? (
              <>
                <button
                  className="nc-chain-toggle"
                  onClick={() => setChainOpen(o => !o)}
                  style={{ borderColor: idx.accent, color: idx.accent }}
                >
                  {chainOpen ? '▲ Hide' : '▼ Show'} Full Option Chain ({chain.length} strikes)
                </button>
                {chainOpen && <IndexOptionChainTable chain={chain} spot={spot?.price} />}
              </>
            ) : (
              <div className="nc-chain-unavailable">Option chain data unavailable — click Refresh to reload</div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
