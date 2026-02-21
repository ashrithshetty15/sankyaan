import React from 'react';
import { useNavigate } from 'react-router-dom';
import './StockHeader.css';

export default function StockHeader({ stock, fundamentals, priceChange, priceChangePercent }) {
  const navigate = useNavigate();

  const isPositive = priceChange >= 0;

  // Extract key metrics
  const peRatio = fundamentals?.pe_ratio || '-';
  const roe = fundamentals?.roe || '-';
  const roce = fundamentals?.roce || '-';
  const divYield = fundamentals?.dividend_yield || '-';
  const marketCap = stock.market_cap;

  // Format market cap properly
  const formatMarketCap = (value) => {
    if (!value || value === 0) return '-';

    const crores = value / 10000000; // Convert to crores

    if (crores >= 100000) {
      // >= 1 lakh crore: show as "X.XX Lakh Cr"
      return `₹${(crores / 100000).toFixed(2)} Lakh Cr`;
    } else if (crores >= 1000) {
      // >= 1000 crore: show as "X.XXk Cr"
      return `₹${(crores / 1000).toFixed(2)}k Cr`;
    } else {
      // < 1000 crore: show as "XXX Cr"
      return `₹${crores.toFixed(2)} Cr`;
    }
  };

  return (
    <div className="stock-header">
      <button className="back-button" onClick={() => navigate('/')}>
        ← Back to Stocks
      </button>

      <div className="stock-title-section">
        <div className="stock-main-info">
          <h1 className="stock-company-name">{stock.company_name}</h1>
          <div className="stock-meta">
            <span className="sector">{stock.sector}</span>
            {stock.industry && <span className="separator">•</span>}
            <span className="industry">{stock.industry}</span>
            <span className="separator">•</span>
            <span className="exchange">NSE: {stock.symbol}</span>
          </div>
        </div>
      </div>

      <div className="stock-price-section">
        <div className="current-price">₹{stock.price?.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</div>
        <div className={`price-change ${isPositive ? 'positive' : 'negative'}`}>
          {isPositive ? '↑' : '↓'} ₹{Math.abs(priceChange).toFixed(2)} ({isPositive ? '+' : ''}{priceChangePercent.toFixed(2)}%)
        </div>
      </div>

      <div className="key-metrics-container">
        <div className="metrics-row">
          <div className="metric-item">
            <span className="metric-label">Market Cap</span>
            <span className="metric-value">{formatMarketCap(marketCap)}</span>
          </div>
          <span className="metric-separator">•</span>
          <div className="metric-item">
            <span className="metric-label">P/E</span>
            <span className="metric-value">{typeof peRatio === 'number' ? peRatio.toFixed(2) : peRatio}</span>
          </div>
          <span className="metric-separator">•</span>
          <div className="metric-item">
            <span className="metric-label">ROE</span>
            <span className="metric-value">{typeof roe === 'number' ? `${roe.toFixed(2)}%` : roe}</span>
          </div>
        </div>
        <div className="metrics-row">
          <div className="metric-item">
            <span className="metric-label">ROCE</span>
            <span className="metric-value">{typeof roce === 'number' ? `${roce.toFixed(2)}%` : roce}</span>
          </div>
          <span className="metric-separator">•</span>
          <div className="metric-item">
            <span className="metric-label">Div Yield</span>
            <span className="metric-value">{typeof divYield === 'number' ? `${divYield.toFixed(2)}%` : divYield}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
