import React, { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';
import './NiftyCommentary.css';

const API = import.meta.env.VITE_API_URL ||
  (window.location.hostname === 'localhost' ? 'http://localhost:5000/api' : 'https://sankyaan-production.up.railway.app/api');

const UPDATE_INTERVAL = 10 * 60 * 1000; // 10 minutes

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

function OITable({ label, expiry, metrics, spot }) {
  if (!metrics) return null;
  const { pcr, maxPain, topCE = [], topPE = [] } = metrics;
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
        <div className="nc-oi-col pe-col">
          <div className="nc-oi-col-title">🟢 Support (PE OI)</div>
          {topPE.slice(0, 5).map(s => (
            <div key={s.strike} className="nc-oi-row">
              <span className="nc-strike">{fmtINR(s.strike)}</span>
              <div className="nc-oi-bar-wrap">
                <div className="nc-oi-bar pe"
                  style={{ width: `${Math.min(100, (s.oi / (topPE[0]?.oi || 1)) * 100)}%` }} />
              </div>
              <span className="nc-oi-val">{fmtOI(s.oi)}</span>
            </div>
          ))}
        </div>
        <div className="nc-oi-col ce-col">
          <div className="nc-oi-col-title">🔴 Resistance (CE OI)</div>
          {topCE.slice(0, 5).map(s => (
            <div key={s.strike} className="nc-oi-row">
              <span className="nc-strike">{fmtINR(s.strike)}</span>
              <div className="nc-oi-bar-wrap">
                <div className="nc-oi-bar ce"
                  style={{ width: `${Math.min(100, (s.oi / (topCE[0]?.oi || 1)) * 100)}%` }} />
              </div>
              <span className="nc-oi-val">{fmtOI(s.oi)}</span>
            </div>
          ))}
        </div>
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

  const spot = data?.spot;
  const vix = data?.vix;
  const weekly = data?.weekly;
  const monthly = data?.monthly;
  const commentary = data?.commentary;

  return (
    <div className="nc-container">
      <div className="nc-header">
        <div className="nc-title-row">
          <h2 className="nc-title">🎙️ Live Nifty Commentary</h2>
          <div className="nc-controls">
            {data?.nextUpdateAt && !loading && (
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
          {/* Spot + VIX row */}
          <div className="nc-market-row">
            {spot && (
              <div className="nc-market-card">
                <div className="nc-market-val" style={{ color: spot.changePct >= 0 ? '#3ddc84' : '#ff6b6b' }}>
                  {fmtINR(spot.price)}
                </div>
                <div className="nc-market-lbl">Nifty 50</div>
                <div className={`nc-market-chg ${spot.changePct >= 0 ? 'pos' : 'neg'}`}>
                  {spot.changePct >= 0 ? '+' : ''}{fmt(spot.changePct)}% ({spot.changePct >= 0 ? '+' : ''}{fmt(spot.change, 0)})
                </div>
              </div>
            )}
            {vix && (
              <div className="nc-market-card">
                <div className="nc-market-val" style={{
                  color: vix.value < 15 ? '#3ddc84' : vix.value < 20 ? '#f0b429' : '#ff6b6b'
                }}>
                  {fmt(vix.value)}
                </div>
                <div className="nc-market-lbl">India VIX</div>
                <div className="nc-vix-level">{vix.level}</div>
              </div>
            )}
            {weekly && (
              <div className="nc-market-card">
                <div className="nc-market-val" style={{ color: getPCRColor(weekly.pcr) }}>
                  {fmt(weekly.pcr, 2)}
                </div>
                <div className="nc-market-lbl">Weekly PCR</div>
                <div className="nc-market-chg" style={{ color: getPCRColor(weekly.pcr) }}>{getPCRLabel(weekly.pcr)}</div>
              </div>
            )}
            {monthly && (
              <div className="nc-market-card">
                <div className="nc-market-val" style={{ color: getPCRColor(monthly.pcr) }}>
                  {fmt(monthly.pcr, 2)}
                </div>
                <div className="nc-market-lbl">Monthly PCR</div>
                <div className="nc-market-chg" style={{ color: getPCRColor(monthly.pcr) }}>{getPCRLabel(monthly.pcr)}</div>
              </div>
            )}
          </div>

          {/* AI Commentary */}
          {commentary ? (
            <div className="nc-commentary-card">
              <div className="nc-commentary-header">
                <span className="nc-ai-badge">✦ AI Analysis</span>
                <span className="nc-commentary-time">
                  {data.timestamp ? new Date(data.timestamp).toLocaleTimeString('en-IN', {
                    hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata'
                  }) + ' IST' : ''}
                </span>
              </div>
              <div className="nc-commentary-text">
                {commentary.split('\n\n').map((para, i) => (
                  <p key={i}>{para}</p>
                ))}
              </div>
            </div>
          ) : (
            <div className="nc-no-commentary">
              <span>🔑 Set <code>ANTHROPIC_API_KEY</code> in Railway environment variables to enable AI commentary</span>
            </div>
          )}

          {/* OI Tables */}
          <div className="nc-oi-section">
            <OITable label="Weekly Expiry" expiry={weekly?.expiry} metrics={weekly} spot={spot?.price} />
            <OITable label="Monthly Expiry" expiry={monthly?.expiry} metrics={monthly} spot={spot?.price} />
          </div>
        </>
      )}
    </div>
  );
}
