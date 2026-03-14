import React, { useState, useEffect } from 'react';
import axios from 'axios';
import './MarketSentiment.css';

const API = import.meta.env.VITE_API_URL ||
  (window.location.hostname === 'localhost' ? 'http://localhost:5000/api' : 'https://sankyaan-production.up.railway.app/api');

function fmt(n, d = 2) {
  if (n == null) return '—';
  return Number(n).toFixed(d);
}

function fmtChange(val, pct) {
  if (val == null) return '—';
  const sign = val >= 0 ? '+' : '';
  return `${sign}${fmt(val)} (${sign}${fmt(pct)}%)`;
}

function formatTS(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short',
    hour: '2-digit', minute: '2-digit', hour12: true,
  });
}

function vixColor(level) {
  if (level === 'Low Fear') return 'var(--green)';
  if (level === 'Moderate') return 'var(--gold)';
  if (level === 'High') return '#ff9800';
  return 'var(--red)';
}

function VIXCard({ vix }) {
  if (!vix) return (
    <div className="ms-card" style={{ borderLeft: '4px solid var(--bg4)' }}>
      <div className="ms-card-label">India VIX</div>
      <div className="ms-no-data">Data unavailable</div>
    </div>
  );
  const color = vixColor(vix.level);
  const levelBg = vix.level === 'Low Fear' ? 'rgba(61,220,132,0.12)' :
    vix.level === 'Moderate' ? 'rgba(240,180,41,0.12)' :
    vix.level === 'High' ? 'rgba(255,152,0,0.12)' : 'rgba(255,107,107,0.12)';
  return (
    <div className="ms-card" style={{ borderLeft: `4px solid ${color}` }}>
      <div className="ms-card-label">India VIX — Fear Gauge</div>
      <div className="ms-vix-value" style={{ color }}>{fmt(vix.value)}</div>
      <div className="ms-vix-level" style={{ background: levelBg, color, border: `1px solid ${color}40` }}>
        {vix.level}
      </div>
      <div className="ms-vix-change">
        {vix.change >= 0 ? '+' : ''}{fmt(vix.change)} ({vix.changePct >= 0 ? '+' : ''}{fmt(vix.changePct)}%) today
      </div>
    </div>
  );
}

function IndexCard({ label, data }) {
  if (!data) return (
    <div className="ms-card">
      <div className="ms-card-label">{label}</div>
      <div className="ms-no-data">Data unavailable</div>
    </div>
  );
  const isPos = data.changePct >= 0;
  return (
    <div className="ms-card">
      <div className="ms-card-label">{label}</div>
      <div className="ms-idx-value">{data.last?.toLocaleString('en-IN')}</div>
      <div className={`ms-idx-change ${isPos ? 'positive' : 'negative'}`}>
        {fmtChange(data.change, data.changePct)}
      </div>
      <div className="ms-idx-ohlc">
        <div className="ms-ohlc-item">O <span>{data.open?.toLocaleString('en-IN')}</span></div>
        <div className="ms-ohlc-item">H <span>{data.high?.toLocaleString('en-IN')}</span></div>
        <div className="ms-ohlc-item">L <span>{data.low?.toLocaleString('en-IN')}</span></div>
      </div>
    </div>
  );
}

function PCRCard({ label, pcr }) {
  if (!pcr) return (
    <div className="ms-card">
      <div className="ms-card-label">{label} — Put/Call Ratio</div>
      <div className="ms-no-data">Data unavailable</div>
    </div>
  );
  const sentiment = (pcr.sentiment || 'Unknown').toLowerCase();
  // Bar: PCR 0→2, markers at 0.8 (40%) and 1.2 (60%)
  const fillPct = Math.min(((pcr.value || 0) / 2) * 100, 100);
  return (
    <div className="ms-card">
      <div className="ms-card-label">{label} — Put/Call Ratio</div>
      <div className="ms-pcr-value">{fmt(pcr.value, 3)}</div>
      <div className={`ms-pcr-badge ${sentiment}`}>{pcr.sentiment}</div>
      <div className="ms-pcr-bar-track">
        <div className="ms-pcr-bar-fill" style={{ width: `${fillPct}%` }} />
        <div className="ms-pcr-marker" style={{ left: '40%' }} title="0.8 — Bearish threshold" />
        <div className="ms-pcr-marker" style={{ left: '60%' }} title="1.2 — Bullish threshold" />
      </div>
      <div className="ms-pcr-labels">
        <span>0 Bearish</span>
        <span>0.8</span>
        <span>1.2</span>
        <span>2 Bullish</span>
      </div>
    </div>
  );
}

function SentimentCard({ label, data }) {
  if (!data || data.total === 0) return (
    <div className="ms-card">
      <div className="ms-card-label">{label} — Crowd Sentiment</div>
      <div className="ms-no-data">No StockTwits data available</div>
    </div>
  );
  return (
    <div className="ms-card">
      <div className="ms-card-label">{label} — Crowd Sentiment (StockTwits)</div>
      <div className="ms-stw-pct">{data.bullishPct}% Bullish</div>
      <div className="ms-stw-counts">
        <span className="bull">▲ {data.bullish} Bullish</span>
        &nbsp;/&nbsp;
        <span className="bear">▼ {data.bearish} Bearish</span>
        &nbsp;· {data.total} messages
      </div>
      <div className="ms-stw-bar">
        <div className="ms-stw-bull" style={{ width: `${data.bullishPct}%` }} />
        <div className="ms-stw-bear" style={{ width: `${100 - data.bullishPct}%` }} />
      </div>
    </div>
  );
}

export default function MarketSentiment() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        setError(null);
        const res = await axios.get(`${API}/market-sentiment`);
        setData(res.data);
      } catch (err) {
        // Show error but still try to display whatever data we got
        const serverMsg = err.response?.data?.error;
        setError(serverMsg || 'Some data sources are unavailable. Retrying may help.');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  if (loading) return (
    <div className="ms-loading">
      <div className="ms-spinner" />
      Loading market sentiment...
    </div>
  );

  // Show error inline (above content) but still render if we have partial data
  if (error && !data) return (
    <div style={{ padding: '40px 20px', textAlign: 'center' }}>
      <div className="ms-error" style={{ marginBottom: 16 }}>{error}</div>
      <button
        onClick={() => { setError(null); setLoading(true); axios.get(`${API}/market-sentiment`).then(r => setData(r.data)).catch(() => setError('Still unavailable. NSE may be blocking requests.')).finally(() => setLoading(false)); }}
        style={{ padding: '8px 20px', background: 'var(--gold)', border: 'none', borderRadius: 8, color: '#0d1117', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}
      >
        Retry
      </button>
    </div>
  );
  if (!data) return null;

  return (
    <div className="ms-container">
      <div className="ms-header">
        <div className="ms-header-title">Live Market Sentiment</div>
        <div className="ms-updated">Updated: {formatTS(data.timestamp)}</div>
      </div>

      {/* Row 1: VIX + Indices */}
      <div className="ms-row1">
        <VIXCard vix={data.vix} />
        <IndexCard label="NIFTY 50" data={data.indices?.nifty} />
        <IndexCard label="BANK NIFTY" data={data.indices?.banknifty} />
      </div>

      {/* Row 2: PCR */}
      <div className="ms-row2">
        <PCRCard label="NIFTY" pcr={data.pcr?.nifty} />
        <PCRCard label="BANKNIFTY" pcr={data.pcr?.banknifty} />
      </div>

      {/* Row 3: StockTwits */}
      <div className="ms-row3">
        <SentimentCard label="NIFTY" data={data.stocktwits?.nifty} />
        <SentimentCard label="BANKNIFTY" data={data.stocktwits?.banknifty} />
      </div>

      {/* Row 4: News */}
      {data.news?.length > 0 && (
        <div className="ms-news-card">
          <div className="ms-card-label" style={{ marginBottom: 12 }}>Latest Market News</div>
          <ul className="ms-news-list">
            {data.news.map((item, i) => (
              <li key={i} className="ms-news-item">
                <a href={item.link} target="_blank" rel="noopener noreferrer">{item.title}</a>
                {item.pubDate && <span className="ms-news-date">{item.pubDate}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
