import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import './PeerComparison.css';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

/**
 * PeerComparison Component
 *
 * Displays a sortable table comparing the current stock with industry peers
 * Highlights industry leaders in each metric with stars
 * Allows navigation to peer stocks by clicking rows
 */
export default function PeerComparison({ stockId, currentStock }) {
  const navigate = useNavigate();
  const [peers, setPeers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [sortConfig, setSortConfig] = useState({ key: 'market_cap', direction: 'desc' });

  useEffect(() => {
    fetchPeers();
  }, [stockId]);

  const fetchPeers = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await axios.get(`${API_URL}/peer-groups/${stockId}`);

      // Combine current stock with peers
      const allStocks = [
        { ...currentStock, isCurrent: true },
        ...response.data.peers,
      ];

      setPeers(allStocks);
    } catch (err) {
      console.error('Error fetching peers:', err);
      setError('Failed to load peer comparison data');
    } finally {
      setLoading(false);
    }
  };

  const handleSort = (key) => {
    let direction = 'asc';
    if (sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  const getSortedPeers = () => {
    const sorted = [...peers].sort((a, b) => {
      const aVal = parseFloat(a[sortConfig.key]) || 0;
      const bVal = parseFloat(b[sortConfig.key]) || 0;

      if (sortConfig.direction === 'asc') {
        return aVal > bVal ? 1 : -1;
      } else {
        return aVal < bVal ? 1 : -1;
      }
    });
    return sorted;
  };

  const getBestInMetric = (key) => {
    if (peers.length === 0) return null;

    const validPeers = peers.filter(p => p[key] != null && parseFloat(p[key]) > 0);
    if (validPeers.length === 0) return null;

    // For P/E, lower is better; for others, higher is better
    if (key === 'pe_ratio') {
      return validPeers.reduce((min, p) => parseFloat(p[key]) < parseFloat(min[key]) ? p : min);
    } else {
      return validPeers.reduce((max, p) => parseFloat(p[key]) > parseFloat(max[key]) ? p : max);
    }
  };

  const handleRowClick = (peer) => {
    if (!peer.isCurrent && peer.symbol) {
      navigate(`/stock/${peer.symbol}`);
    }
  };

  if (loading) {
    return (
      <div className="peer-comparison-container">
        <h3>Peer Comparison</h3>
        <div className="peer-loading">Loading peer comparison...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="peer-comparison-container">
        <h3>Peer Comparison</h3>
        <div className="peer-error">{error}</div>
      </div>
    );
  }

  if (peers.length === 0) {
    return (
      <div className="peer-comparison-container">
        <h3>Peer Comparison</h3>
        <div className="peer-empty">No peer data available for this industry</div>
      </div>
    );
  }

  const sortedPeers = getSortedPeers();
  const bestPE = getBestInMetric('pe_ratio');
  const bestROE = getBestInMetric('roe');
  const bestROCE = getBestInMetric('roce');
  const bestMarketCap = getBestInMetric('market_cap');
  const bestDivYield = getBestInMetric('dividend_yield');

  return (
    <div className="peer-comparison-container">
      <h3>Peer Comparison - {currentStock.industry || 'Industry'}</h3>
      <p className="peer-subtitle">Compare key metrics across industry peers</p>

      <div className="peer-table-wrapper">
        <table className="peer-table">
          <thead>
            <tr>
              <th onClick={() => handleSort('company_name')} className="sortable">
                Company {sortConfig.key === 'company_name' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
              </th>
              <th onClick={() => handleSort('pe_ratio')} className="sortable text-right">
                P/E {sortConfig.key === 'pe_ratio' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
              </th>
              <th onClick={() => handleSort('roe')} className="sortable text-right">
                ROE {sortConfig.key === 'roe' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
              </th>
              <th onClick={() => handleSort('roce')} className="sortable text-right">
                ROCE {sortConfig.key === 'roce' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
              </th>
              <th onClick={() => handleSort('market_cap')} className="sortable text-right">
                Market Cap {sortConfig.key === 'market_cap' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
              </th>
              <th onClick={() => handleSort('dividend_yield')} className="sortable text-right">
                Div Yield {sortConfig.key === 'dividend_yield' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
              </th>
            </tr>
          </thead>
          <tbody>
            {sortedPeers.map((peer, idx) => (
              <tr
                key={idx}
                className={`peer-row ${peer.isCurrent ? 'current-stock' : 'clickable'}`}
                onClick={() => handleRowClick(peer)}
                title={peer.isCurrent ? 'Current stock' : `Click to view ${peer.company_name}`}
              >
                <td className="company-cell">
                  <div className="company-info">
                    <span className="company-name">
                      {peer.company_name || peer.symbol}
                      {peer.isCurrent && <span className="you-badge">(You)</span>}
                    </span>
                    {peer.symbol && (
                      <span className="company-symbol">{peer.symbol}</span>
                    )}
                  </div>
                </td>
                <td className="text-right metric-cell">
                  {peer.pe_ratio != null && parseFloat(peer.pe_ratio) > 0 ? parseFloat(peer.pe_ratio).toFixed(2) : '-'}
                  {bestPE?.symbol === peer.symbol && <span className="star" title="Industry leader">⭐</span>}
                </td>
                <td className="text-right metric-cell">
                  {peer.roe != null && parseFloat(peer.roe) > 0 ? `${parseFloat(peer.roe).toFixed(2)}%` : '-'}
                  {bestROE?.symbol === peer.symbol && <span className="star" title="Industry leader">⭐</span>}
                </td>
                <td className="text-right metric-cell">
                  {peer.roce != null && parseFloat(peer.roce) > 0 ? `${parseFloat(peer.roce).toFixed(2)}%` : '-'}
                  {bestROCE?.symbol === peer.symbol && <span className="star" title="Industry leader">⭐</span>}
                </td>
                <td className="text-right metric-cell">
                  ₹{((peer.market_cap || 0) / 10000000).toFixed(2)}k Cr
                  {bestMarketCap?.symbol === peer.symbol && <span className="star" title="Industry leader">⭐</span>}
                </td>
                <td className="text-right metric-cell">
                  {peer.dividend_yield != null && parseFloat(peer.dividend_yield) > 0 ? `${parseFloat(peer.dividend_yield).toFixed(2)}%` : '-'}
                  {bestDivYield?.symbol === peer.symbol && <span className="star" title="Industry leader">⭐</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="peer-legend">
        <span>⭐ = Industry leader in this metric</span>
        <span className="separator">•</span>
        <span>Click on any row to view that stock</span>
      </div>
    </div>
  );
}
