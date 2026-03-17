import React, { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';
import './NiftyCommentary.css';

const API = import.meta.env.VITE_API_URL ||
  (window.location.hostname === 'localhost' ? 'http://localhost:5000/api' : 'https://sankyaan-production.up.railway.app/api');

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

function OICard({ label, metrics }) {
  if (!metrics) return null;
  const { pcr, maxPain, topCE = [], topPE = [], expiry } = metrics;
  const pcrColor = getPCRColor(pcr);

  return (
    <div className="nc-oi-card">
      <div className="nc-oi-header">
        <span className="nc-oi-label">{label}</span>
        <span className="nc-oi-expiry">{expiry}</span>
        <span className="nc-pcr-badge" style={{ color: pcrColor, borderColor: pcrColor }}>
          PCR {fmt(pcr, 2)} · {getPCRLabel(pcr)}
        </span>
        {maxPain && <span className="nc-maxpain">Max Pain: {fmtINR(maxPain)}</span>}
      </div>
      <div className="nc-oi-grid">
        <div className="nc-oi-col">
          <div className="nc-oi-col-title">🟢 Support (PE OI)</div>
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
          <div className="nc-oi-col-title">🔴 Resistance (CE OI)</div>
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
    </div>
  );
}

function IndexSection({ name, accent, spot, oiData, commentary, commentaryError, timestamp }) {
  const weekly = oiData?.weekly;
  const monthly = oiData?.monthly;
  const pcr = weekly?.pcr;

  return (
    <div className="nc-index-section" style={{ borderTopColor: accent }}>
      <div className="nc-index-header">
        <div className="nc-index-title-group">
          <span className="nc-index-name" style={{ color: accent }}>{name}</span>
          {spot && (
            <span className="nc-index-price" style={{ color: spot.changePct >= 0 ? '#3ddc84' : '#ff6b6b' }}>
              {fmtINR(spot.price)}
              <span className="nc-index-chg">
                {spot.changePct >= 0 ? ' +' : ' '}{fmt(spot.changePct)}%
              </span>
            </span>
          )}
        </div>
        {pcr != null && (
          <div className="nc-index-pcr" style={{ color: getPCRColor(pcr), borderColor: getPCRColor(pcr) }}>
            PCR {fmt(pcr, 2)} · {getPCRLabel(pcr)}
          </div>
        )}
      </div>

      {/* Per-index AI commentary */}
      {commentary ? (
        <div className="nc-index-commentary">
          <div className="nc-index-commentary-header">
            <span className="nc-ai-badge">✦ AI Analysis</span>
            {timestamp && (
              <span className="nc-commentary-time">
                {new Date(timestamp).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' })} IST
              </span>
            )}
          </div>
          <div className="nc-commentary-text">
            {commentary.split('\n\n').map((para, i) => <p key={i}>{para}</p>)}
          </div>
        </div>
      ) : commentaryError ? (
        <div className="nc-index-commentary-error">⚠️ {commentaryError}</div>
      ) : null}

      <div className="nc-oi-pair">
        <OICard label="Weekly" metrics={weekly} />
        <OICard label="Monthly" metrics={monthly} />
      </div>
    </div>
  );
}

export default function NiftyCommentary() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [lastRefresh, setLastRefresh] = useState(null);
  const fetchingRef = useRef(false);

  const load = useCallback(async (force = false) => {
    if (fetchingRef.current) return;
    fetchingRef.current = true;
    setLoading(true);
    setError('');
    try {
      const res = await axios.get(`${API}/nifty-commentary${force ? '?force=1' : ''}`);
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

  const { spot, bankniftySpot, midcapSpot, finniftySpot, vix, nifty, banknifty, midcap, finnifty, commentaries, marketOpen } = data || {};
  const c = commentaries || {};
  const noApiKey = c.errors?._global === 'ANTHROPIC_API_KEY not set';

  return (
    <div className="nc-container">
      {/* ── Header ── */}
      <div className="nc-header">
        <div className="nc-title-row">
          <h2 className="nc-title">🎙️ Live F&O Commentary</h2>
          <div className="nc-controls">
            {!marketOpen && data && (
              <span className="nc-market-closed">🔴 Market Closed</span>
            )}
            {data?.nextUpdateAt && !loading && marketOpen && (
              <span className="nc-next">
                Next update in <Countdown nextUpdateAt={data.nextUpdateAt} onTick={() => load(true)} />
              </span>
            )}
            <button className="nc-refresh-btn" onClick={() => load(true)} disabled={loading}>
              {loading ? '⏳' : '↻'} Refresh
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
          {/* ── VIX summary bar ── */}
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

          {noApiKey && (
            <div className="nc-no-commentary">
              🔑 Set <code>ANTHROPIC_API_KEY</code> in Railway environment variables to enable AI commentary
            </div>
          )}

          {/* ── Nifty Section ── */}
          <IndexSection
            name="Nifty 50"
            accent="#60a5fa"
            spot={spot}
            oiData={nifty}
            commentary={c.nifty}
            commentaryError={c.errors?.nifty}
            timestamp={data?.timestamp}
          />

          {/* ── BankNifty Section ── */}
          <IndexSection
            name="Bank Nifty"
            accent="#a78bfa"
            spot={bankniftySpot}
            oiData={banknifty}
            commentary={c.banknifty}
            commentaryError={c.errors?.banknifty}
            timestamp={data?.timestamp}
          />

          {/* ── Midcap Nifty Section ── */}
          <IndexSection
            name="Midcap Nifty"
            accent="#34d399"
            spot={midcapSpot}
            oiData={midcap}
            commentary={c.midcap}
            commentaryError={c.errors?.midcap}
            timestamp={data?.timestamp}
          />

          {/* ── Fin Nifty Section ── */}
          <IndexSection
            name="Fin Nifty"
            accent="#fb923c"
            spot={finniftySpot}
            oiData={finnifty}
            commentary={c.finnifty}
            commentaryError={c.errors?.finnifty}
            timestamp={data?.timestamp}
          />
        </>
      )}
    </div>
  );
}
