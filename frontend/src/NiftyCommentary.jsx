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

function OITable({ label, weeklyMetrics, monthlyMetrics }) {
  if (!weeklyMetrics && !monthlyMetrics) return null;

  const renderRows = (strikes, maxOi) => strikes.slice(0, 5).map(s => (
    <div key={s.strike} className="nc-oi-row">
      <span className="nc-strike">{fmtINR(s.strike)}</span>
      <div className="nc-oi-bar-wrap">
        <div className="nc-oi-bar pe" style={{ width: `${Math.min(100, (s.oi / (maxOi || 1)) * 100)}%` }} />
      </div>
      <span className="nc-oi-val">{fmtOI(s.oi)}</span>
    </div>
  ));

  return (
    <div className="nc-oi-section-block">
      <div className="nc-oi-index-label">{label}</div>
      <div className="nc-oi-expiry-row">
        {/* Weekly */}
        {weeklyMetrics && (() => {
          const { pcr, maxPain, topCE = [], topPE = [] } = weeklyMetrics;
          const pcrColor = getPCRColor(pcr);
          return (
            <div className="nc-oi-card">
              <div className="nc-oi-header">
                <span className="nc-oi-label">Weekly</span>
                <span className="nc-oi-expiry">{weeklyMetrics.expiry}</span>
                <span className="nc-pcr-badge" style={{ color: pcrColor, borderColor: pcrColor }}>
                  PCR {fmt(pcr, 2)} · {getPCRLabel(pcr)}
                </span>
                {maxPain && <span className="nc-maxpain">Max Pain: {fmtINR(maxPain)}</span>}
              </div>
              <div className="nc-oi-grid">
                <div className="nc-oi-col">
                  <div className="nc-oi-col-title">🟢 Support (PE OI)</div>
                  {renderRows(topPE, topPE[0]?.oi)}
                </div>
                <div className="nc-oi-col">
                  <div className="nc-oi-col-title">🔴 Resistance (CE OI)</div>
                  {renderRows(topCE, topCE[0]?.oi)}
                </div>
              </div>
            </div>
          );
        })()}
        {/* Monthly */}
        {monthlyMetrics && (() => {
          const { pcr, maxPain, topCE = [], topPE = [] } = monthlyMetrics;
          const pcrColor = getPCRColor(pcr);
          return (
            <div className="nc-oi-card">
              <div className="nc-oi-header">
                <span className="nc-oi-label">Monthly</span>
                <span className="nc-oi-expiry">{monthlyMetrics.expiry}</span>
                <span className="nc-pcr-badge" style={{ color: pcrColor, borderColor: pcrColor }}>
                  PCR {fmt(pcr, 2)} · {getPCRLabel(pcr)}
                </span>
                {maxPain && <span className="nc-maxpain">Max Pain: {fmtINR(maxPain)}</span>}
              </div>
              <div className="nc-oi-grid">
                <div className="nc-oi-col">
                  <div className="nc-oi-col-title">🟢 Support (PE OI)</div>
                  {renderRows(topPE, topPE[0]?.oi)}
                </div>
                <div className="nc-oi-col">
                  <div className="nc-oi-col-title">🔴 Resistance (CE OI)</div>
                  {renderRows(topCE, topCE[0]?.oi)}
                </div>
              </div>
            </div>
          );
        })()}
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
  const bankniftySpot = data?.bankniftySpot;
  const vix = data?.vix;
  const niftyOI = data?.nifty;
  const bankniftyOI = data?.banknifty;
  const commentary = data?.commentary;
  const commentaryError = data?.commentaryError;
  const marketOpen = data?.marketOpen;

  return (
    <div className="nc-container">
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
            {bankniftySpot && (
              <div className="nc-market-card">
                <div className="nc-market-val" style={{ color: bankniftySpot.changePct >= 0 ? '#3ddc84' : '#ff6b6b' }}>
                  {fmtINR(bankniftySpot.price)}
                </div>
                <div className="nc-market-lbl">Bank Nifty</div>
                <div className={`nc-market-chg ${bankniftySpot.changePct >= 0 ? 'pos' : 'neg'}`}>
                  {bankniftySpot.changePct >= 0 ? '+' : ''}{fmt(bankniftySpot.changePct)}% ({bankniftySpot.changePct >= 0 ? '+' : ''}{fmt(bankniftySpot.change, 0)})
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
            {niftyOI?.weekly && (
              <div className="nc-market-card">
                <div className="nc-market-val" style={{ color: getPCRColor(niftyOI.weekly.pcr) }}>
                  {fmt(niftyOI.weekly.pcr, 2)}
                </div>
                <div className="nc-market-lbl">Nifty PCR</div>
                <div className="nc-market-chg" style={{ color: getPCRColor(niftyOI.weekly.pcr) }}>{getPCRLabel(niftyOI.weekly.pcr)}</div>
              </div>
            )}
            {bankniftyOI?.weekly && (
              <div className="nc-market-card">
                <div className="nc-market-val" style={{ color: getPCRColor(bankniftyOI.weekly.pcr) }}>
                  {fmt(bankniftyOI.weekly.pcr, 2)}
                </div>
                <div className="nc-market-lbl">BankNifty PCR</div>
                <div className="nc-market-chg" style={{ color: getPCRColor(bankniftyOI.weekly.pcr) }}>{getPCRLabel(bankniftyOI.weekly.pcr)}</div>
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
              {commentaryError && commentaryError !== 'ANTHROPIC_API_KEY not set'
                ? <span>⚠️ AI commentary error: <code>{commentaryError}</code></span>
                : <span>🔑 Set <code>ANTHROPIC_API_KEY</code> in Railway environment variables to enable AI commentary</span>
              }
            </div>
          )}

          {/* OI Tables */}
          <OITable label="Nifty 50" weeklyMetrics={niftyOI?.weekly} monthlyMetrics={niftyOI?.monthly} />
          <OITable label="Bank Nifty" weeklyMetrics={bankniftyOI?.weekly} monthlyMetrics={bankniftyOI?.monthly} />
        </>
      )}
    </div>
  );
}
