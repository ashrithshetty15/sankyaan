import React, { useState, useEffect } from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import axios from 'axios';
import './StockChart.css';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

const TIMEFRAMES = [
  { label: '1M', days: 30 },
  { label: '6M', days: 180 },
  { label: 'YTD', days: 'ytd' },
  { label: '1Y', days: 365 }
];

export default function StockChart({ symbol, priceHistory }) {
  const [selectedTimeframe, setSelectedTimeframe] = useState('1Y');
  const [chartData, setChartData] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    filterChartData();
  }, [selectedTimeframe, priceHistory]);

  const filterChartData = () => {
    if (!priceHistory || priceHistory.length === 0) {
      setChartData([]);
      return;
    }

    setLoading(true);
    const timeframe = TIMEFRAMES.find(t => t.label === selectedTimeframe);
    let filteredData = [...priceHistory].sort((a, b) => new Date(a.date) - new Date(b.date));

    // Filter based on timeframe
    if (timeframe.days === 'ytd') {
      const startOfYear = new Date(new Date().getFullYear(), 0, 1);
      filteredData = filteredData.filter(p => new Date(p.date) >= startOfYear);
    } else if (timeframe.days === 'max') {
      // Show all data
    } else {
      const cutoffDate = new Date(Date.now() - timeframe.days * 24 * 60 * 60 * 1000);
      filteredData = filteredData.filter(p => new Date(p.date) >= cutoffDate);
    }

    // Format data for chart
    const formatted = filteredData.map(p => ({
      date: new Date(p.date).toLocaleDateString('en-IN', {
        month: 'short',
        day: 'numeric',
        year: selectedTimeframe === '1Y' || selectedTimeframe === 'YTD' ? 'numeric' : undefined
      }),
      price: parseFloat(p.close),
      fullDate: p.date
    }));

    setChartData(formatted);
    setLoading(false);
  };

  const CustomTooltip = ({ active, payload }) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="chart-tooltip">
          <div className="tooltip-date">
            {new Date(data.fullDate).toLocaleDateString('en-IN', {
              year: 'numeric',
              month: 'long',
              day: 'numeric'
            })}
          </div>
          <div className="tooltip-price">
            ₹{data.price.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
          </div>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="stock-chart-container">
      <div className="chart-header">
        <h3>Stock Price Chart</h3>
        <div className="timeframe-selector">
          {TIMEFRAMES.map(tf => (
            <button
              key={tf.label}
              className={`timeframe-btn ${selectedTimeframe === tf.label ? 'active' : ''}`}
              onClick={() => setSelectedTimeframe(tf.label)}
            >
              {tf.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="chart-loading">Loading chart...</div>
      ) : chartData.length === 0 ? (
        <div className="chart-no-data">No price data available</div>
      ) : (
        <ResponsiveContainer width="100%" height={400}>
          <LineChart data={chartData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--bg3)" />
            <XAxis
              dataKey="date"
              stroke="var(--text2)"
              tick={{ fill: 'var(--text2)', fontSize: 12 }}
            />
            <YAxis
              stroke="var(--text2)"
              tick={{ fill: 'var(--text2)', fontSize: 12 }}
              domain={['dataMin - 50', 'dataMax + 50']}
              tickFormatter={(value) => `₹${value.toFixed(0)}`}
            />
            <Tooltip content={<CustomTooltip />} />
            <Line
              type="monotone"
              dataKey="price"
              stroke="var(--accent)"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 6, fill: 'var(--accent)' }}
            />
          </LineChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
