import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import './PortfolioStockScores.css';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

export default function PortfolioStockScores({ ticker }) {
  const navigate = useNavigate();
  const [forensicData, setForensicData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [sortConfig, setSortConfig] = useState({ key: 'weight', direction: 'desc' });

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        setError(null);
        const response = await axios.get(`${API_URL}/portfolio-forensics/${ticker}`);
        setForensicData(response.data);
      } catch (err) {
        console.error('Error fetching portfolio forensics:', err);
        setError(err.message || 'Failed to load portfolio analysis');
      } finally {
        setLoading(false);
      }
    };

    if (ticker) {
      fetchData();
    }
  }, [ticker]);

  const handleSort = (key) => {
    let direction = 'asc';
    if (sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  const getSortedHoldings = () => {
    if (!forensicData?.topHoldings) return [];

    const sorted = [...forensicData.topHoldings].sort((a, b) => {
      let aValue, bValue;

      if (sortConfig.key === 'weight') {
        aValue = a.weight ?? 0;
        bValue = b.weight ?? 0;
      } else if (sortConfig.key === 'piotroski') {
        aValue = a.scores?.piotroski_score ?? -1; // Use -1 for null to sort them last
        bValue = b.scores?.piotroski_score ?? -1;
      } else if (sortConfig.key === 'quality') {
        aValue = a.scores?.overall_quality_score ?? -1;
        bValue = b.scores?.overall_quality_score ?? -1;
      } else if (sortConfig.key === 'altman') {
        aValue = a.scores?.altman_z_score ?? -999; // Use very low number for null
        bValue = b.scores?.altman_z_score ?? -999;
      } else {
        aValue = a[sortConfig.key] || '';
        bValue = b[sortConfig.key] || '';
      }

      if (sortConfig.direction === 'asc') {
        return aValue > bValue ? 1 : -1;
      } else {
        return aValue < bValue ? 1 : -1;
      }
    });

    return sorted;
  };

  const getScoreColor = (score, maxScore = 100) => {
    const percentage = (score / maxScore) * 100;
    if (percentage >= 80) return '#22c55e'; // green
    if (percentage >= 60) return '#eab308'; // yellow
    if (percentage >= 40) return '#f97316'; // orange
    return '#ef4444'; // red
  };

  const getPiotroskiColor = (score) => {
    return getScoreColor(score, 9);
  };

  const getAltmanColor = (score) => {
    if (score >= 3) return '#22c55e'; // Safe zone
    if (score >= 1.8) return '#eab308'; // Grey zone
    return '#ef4444'; // Distress zone
  };

  if (loading) {
    return (
      <div className="stock-scores-container">
        <div className="stock-scores-header">
          <h3>Portfolio Stock Analysis</h3>
          <p>Individual stock scores and metrics</p>
        </div>
        <div className="loading">Loading stock scores...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="stock-scores-container">
        <div className="stock-scores-header">
          <h3>Portfolio Stock Analysis</h3>
          <p>Individual stock scores and metrics</p>
        </div>
        <div className="error-message">
          <p>❌ Failed to load portfolio analysis</p>
          <p className="error-detail">{error}</p>
        </div>
      </div>
    );
  }

  if (!forensicData || forensicData.scoredHoldings === 0) {
    return (
      <div className="stock-scores-container">
        <div className="stock-scores-header">
          <h3>Portfolio Stock Analysis</h3>
          <p>Individual stock scores and metrics</p>
        </div>
        <div className="no-data">
          <p>No stock scores available for this portfolio</p>
          <p className="no-data-detail">This portfolio's holdings could not be linked to stocks in our database.</p>
        </div>
      </div>
    );
  }

  const sortedHoldings = getSortedHoldings();
  const coveragePercent = parseFloat(forensicData.coveragePercentage);
  const hasLowCoverage = coveragePercent < 50;

  return (
    <div className="stock-scores-container">
      <div className="stock-scores-header">
        <h3>Portfolio Stock Analysis</h3>
        <p className="subtitle">
          Forensic scores for top {sortedHoldings.length} holdings covering {forensicData.coveragePercentage}% of portfolio
        </p>
        {hasLowCoverage && (
          <p className="coverage-warning">
            ⚠️ Low coverage - analysis may not be fully representative of the entire portfolio
          </p>
        )}
      </div>

      <div className="scores-table-wrapper">
        <table className="scores-table">
          <thead>
            <tr>
              <th onClick={() => handleSort('name')} className="sortable">
                Stock {sortConfig.key === 'name' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
              </th>
              <th onClick={() => handleSort('sector')} className="sortable">
                Sector {sortConfig.key === 'sector' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
              </th>
              <th onClick={() => handleSort('weight')} className="sortable text-right">
                Weight {sortConfig.key === 'weight' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
              </th>
              <th onClick={() => handleSort('piotroski')} className="sortable text-center">
                Piotroski {sortConfig.key === 'piotroski' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
              </th>
              <th onClick={() => handleSort('quality')} className="sortable text-center">
                Quality {sortConfig.key === 'quality' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
              </th>
              <th onClick={() => handleSort('altman')} className="sortable text-center">
                Altman Z {sortConfig.key === 'altman' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
              </th>
              <th className="text-center">Health</th>
              <th className="text-center">Management</th>
              <th className="text-center">Earnings</th>
            </tr>
          </thead>
          <tbody>
            {sortedHoldings.map((holding, index) => (
              <tr key={index} className="score-row">
                <td className="stock-name">
                  <div
                    className="name-cell clickable-stock"
                    onClick={() => navigate(`/stock/${holding.symbol}`)}
                    style={{ cursor: 'pointer' }}
                  >
                    <div className="company-name">{holding.name}</div>
                    <div className="stock-symbol">{holding.symbol}</div>
                  </div>
                </td>
                <td className="sector-cell">
                  <span className="sector-badge">{holding.sector || 'N/A'}</span>
                </td>
                <td className="text-right weight-cell">
                  <strong>{holding.weight?.toFixed(2)}%</strong>
                </td>
                <td className="text-center">
                  <div
                    className="score-badge piotroski"
                    style={{ backgroundColor: getPiotroskiColor(holding.scores?.piotroski_score ?? 0) }}
                  >
                    {holding.scores?.piotroski_score != null ? `${holding.scores?.piotroski_score}/9` : 'N/A'}
                  </div>
                </td>
                <td className="text-center">
                  <div
                    className="score-badge quality"
                    style={{ backgroundColor: getScoreColor(holding.scores?.overall_quality_score ?? 0) }}
                  >
                    {holding.scores?.overall_quality_score != null ? Math.round(holding.scores?.overall_quality_score) : 'N/A'}
                  </div>
                </td>
                <td className="text-center">
                  <div
                    className="score-badge altman"
                    style={{ backgroundColor: getAltmanColor(holding.scores?.altman_z_score ?? 0) }}
                  >
                    {holding.scores?.altman_z_score != null ? parseFloat(holding.scores.altman_z_score).toFixed(2) : 'N/A'}
                  </div>
                </td>
                <td className="text-center">
                  <div className="score-mini">
                    {holding.scores?.financial_health_score != null ? Math.round(holding.scores?.financial_health_score) : '-'}
                  </div>
                </td>
                <td className="text-center">
                  <div className="score-mini">
                    {holding.scores?.management_quality_score != null ? Math.round(holding.scores?.management_quality_score) : '-'}
                  </div>
                </td>
                <td className="text-center">
                  <div className="score-mini">
                    {holding.scores?.earnings_quality_score != null ? Math.round(holding.scores?.earnings_quality_score) : '-'}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="scores-legend">
        <div className="legend-section">
          <h4>Score Interpretation:</h4>
          <div className="legend-items">
            <div className="legend-item">
              <strong>Piotroski F-Score (0-9):</strong> Financial strength indicator. 8-9 = Strong, 5-7 = Moderate, 0-4 = Weak
            </div>
            <div className="legend-item">
              <strong>Quality Score (0-100):</strong> Overall company quality. 80+ = Excellent, 60-79 = Good, 40-59 = Fair, &lt;40 = Poor
            </div>
            <div className="legend-item">
              <strong>Altman Z-Score:</strong> Bankruptcy predictor. &gt;3.0 = Safe, 1.8-3.0 = Grey Zone, &lt;1.8 = Distress
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
