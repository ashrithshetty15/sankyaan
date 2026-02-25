import React, { useState, useEffect, Component } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { PieChart, Pie, Cell, Legend, Tooltip, ResponsiveContainer } from 'recharts';
import * as XLSX from 'xlsx';
import PortfolioForensicScores from './PortfolioForensicScores.jsx';
import PortfolioStockScores from './PortfolioStockScores.jsx';
import StockScoresRating from './StockScoresRating.jsx';
import FundComparison from './FundComparison.jsx';
import FundManagerAnalytics from './FundManagerAnalytics.jsx';
import FundScreener from './FundScreener.jsx';
import { exportFundReportToPDF } from './utils/pdfExport.js';
import './App.css';

// Error boundary to prevent forensic components from crashing the whole page
class ForensicErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() { return { hasError: true }; }
  componentDidCatch(error) { console.error('Forensic component error:', error); }
  render() {
    if (this.state.hasError) return null;
    return this.props.children;
  }
}

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

// Color palette for horizontal bar chart — diverse hues
const COLORS = [
  '#2E86AB', // blue
  '#FF6B6B', // red
  '#FFD93D', // yellow
  '#6BCB77', // green
  '#4D96FF', // light blue
  '#FF8C42', // orange
  '#9B5DE5', // purple
  '#00C2A8', // teal
  '#F15BB5', // pink
  '#7BD389', // lime
  '#3A86FF', // deep blue
  '#FF9F1C', // amber
  '#E63946', // crimson
  '#8ECAE6', // sky
  '#B565A7', // mauve
  '#F77F00', // orange-dark
  '#2AB7CA', // cyan
  '#FFB4A2', // peach
  '#6A994E', // olive
  '#BDBDBD'  // grey for 'Others'
];

// Helper function to convert instrument name to stock symbol
const getStockSymbol = (instrumentName) => {
  if (!instrumentName) return null;

  const symbolMap = {
    // Common NSE stocks
    'RELIANCE INDUSTRIES LIMITED': 'RELIANCE.NS',
    'RELIANCE INDUSTRIES LTD': 'RELIANCE.NS',
    'RELIANCE': 'RELIANCE.NS',
    'TATA CONSULTANCY SERVICES LIMITED': 'TCS.NS',
    'TATA CONSULTANCY SERVICES LTD': 'TCS.NS',
    'TCS': 'TCS.NS',
    'HDFC BANK LIMITED': 'HDFCBANK.NS',
    'HDFC BANK LTD': 'HDFCBANK.NS',
    'HDFC BANK': 'HDFCBANK.NS',
    'INFOSYS LIMITED': 'INFY.NS',
    'INFOSYS LTD': 'INFY.NS',
    'INFOSYS': 'INFY.NS',
    'ICICI BANK LIMITED': 'ICICIBANK.NS',
    'ICICI BANK LTD': 'ICICIBANK.NS',
    'ICICI BANK': 'ICICIBANK.NS',
    'HINDUSTAN UNILEVER LIMITED': 'HINDUNILVR.NS',
    'HINDUSTAN UNILEVER LTD': 'HINDUNILVR.NS',
    'HINDUSTAN UNILEVER': 'HINDUNILVR.NS',
    'ITC LIMITED': 'ITC.NS',
    'ITC LTD': 'ITC.NS',
    'ITC': 'ITC.NS',
    'STATE BANK OF INDIA': 'SBIN.NS',
    'STATE BANK OF INDIA LTD': 'SBIN.NS',
    'SBIN': 'SBIN.NS',
    'BHARTI AIRTEL LIMITED': 'BHARTIARTL.NS',
    'BHARTI AIRTEL LTD': 'BHARTIARTL.NS',
    'BHARTI AIRTEL': 'BHARTIARTL.NS',
    'KOTAK MAHINDRA BANK LIMITED': 'KOTAKBANK.NS',
    'KOTAK MAHINDRA BANK LTD': 'KOTAKBANK.NS',
    'KOTAK BANK': 'KOTAKBANK.NS',
  };

  // Try exact match first
  const upperName = instrumentName.trim().toUpperCase();
  if (symbolMap[upperName]) {
    return symbolMap[upperName];
  }

  // Try partial match
  for (const [key, value] of Object.entries(symbolMap)) {
    if (upperName.includes(key)) {
      return value;
    }
  }

  return null;
};

export default function Home({ viewMode, setViewMode }) {
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [fundData, setFundData] = useState(null);
  const [tickersWithFunds, setTickersWithFunds] = useState([]);
  const [suggestions, setSuggestions] = useState([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [fundHouses, setFundHouses] = useState([]);
  const [selectedFundHouse, setSelectedFundHouse] = useState('');
  const [stocks, setStocks] = useState([]);
  const [filteredStocks, setFilteredStocks] = useState([]);
  const [holdingsFilter, setHoldingsFilter] = useState('all');
  const [showHoldingsModal, setShowHoldingsModal] = useState(false);
  const [fundHouseSearch, setFundHouseSearch] = useState('');
  const [showFundHouseDropdown, setShowFundHouseDropdown] = useState(false);


  // Fetch all fund houses on component mount
  useEffect(() => {
    const fetchFundHouses = async () => {
      try {
        console.log('🏢 Fetching fund houses from:', `${API_URL}/fundhouses`);
        const response = await axios.get(`${API_URL}/fundhouses`);
        console.log('✅ Fund houses fetched:', response.data.fundHouses?.length || 0);
        setFundHouses(response.data.fundHouses);
      } catch (err) {
        console.error('❌ Failed to fetch fund houses:', err);
      }
    };
    fetchFundHouses();
  }, []);

  // Fetch all stocks when stocks view is selected
  useEffect(() => {
    const fetchStocks = async () => {
      if (viewMode === 'stocks') {
        try {
          console.log('📈 Fetching all stocks...');
          const response = await axios.get(`${API_URL}/stocks`);
          console.log('✅ Stocks fetched:', response.data.stocks?.length || 0);
          setStocks(response.data.stocks);
          setFilteredStocks(response.data.stocks);
        } catch (err) {
          console.error('❌ Failed to fetch stocks:', err);
        }
      }
    };
    fetchStocks();
  }, [viewMode]);

  // Fetch funds when fund house is selected
  useEffect(() => {
    const fetchTickersWithFunds = async () => {
      try {
        const url = selectedFundHouse
          ? `${API_URL}/tickers?fundHouse=${encodeURIComponent(selectedFundHouse)}`
          : `${API_URL}/tickers`;
        console.log('🔍 Fetching tickers from:', url);
        const response = await axios.get(url);
        console.log('✅ Tickers fetched:', response.data.tickersWithFunds?.length || 0, 'funds');
        setTickersWithFunds(response.data.tickersWithFunds);
        // Reset search when fund house changes
        setSearchTerm('');
        setSuggestions([]);
        setShowDropdown(false);
      } catch (err) {
        console.error('❌ Failed to fetch tickers:', err);
      }
    };
    if (selectedFundHouse || fundHouses.length > 0) {
      fetchTickersWithFunds();
    }
  }, [selectedFundHouse, fundHouses]);

  // Handle search term change and filter suggestions by fund_name or stock
  const handleInputChange = (e) => {
    const value = e.target.value.toUpperCase();
    setSearchTerm(value);

    if (viewMode === 'mutual-funds') {
      if (value.trim() === '') {
        setSuggestions([]);
        setShowDropdown(false);
      } else {
        // Filter by fund_name
        const filtered = tickersWithFunds.filter(item =>
          item.fund_name.toUpperCase().includes(value)
        );
        setSuggestions(filtered);
        setShowDropdown(filtered.length > 0);
      }
    } else if (viewMode === 'stocks') {
      if (value.trim() === '') {
        setFilteredStocks(stocks);
      } else {
        // Filter stocks by name or symbol
        const filtered = stocks.filter(stock =>
          stock.name.toUpperCase().includes(value) ||
          stock.symbol.toUpperCase().includes(value) ||
          (stock.sector && stock.sector.toUpperCase().includes(value))
        );
        setFilteredStocks(filtered);
      }
    }
  };

  // Clear search
  const handleClearSearch = () => {
    setSearchTerm('');
    setSuggestions([]);
    setShowDropdown(false);
    setFundData(null);
    setError(null);
    setSelectedFundHouse('');
    setFundHouseSearch('');
    if (viewMode === 'stocks') {
      setFilteredStocks(stocks);
    }
  };

  // Clear state when view mode changes
  useEffect(() => {
    setSearchTerm('');
    setFundData(null);
    setError(null);
    setSuggestions([]);
    setShowDropdown(false);
    setSelectedFundHouse('');
    setFundHouseSearch('');
  }, [viewMode]);

  // Reset holdings filter when fund changes
  useEffect(() => {
    setHoldingsFilter('all');
  }, [fundData]);

  // Handle stock click - navigate to stock detail page
  const handleStockItemClick = (symbol) => {
    navigate(`/stock/${symbol}`);
  };

  // Get popular funds (first 8)
  const getPopularFunds = () => {
    return tickersWithFunds.slice(0, 8);
  };

  // Handle suggestion click
  const handleSuggestionClick = (ticker, fundName) => {
    setSearchTerm(fundName);
    setShowDropdown(false);
    performSearch(ticker);
  };

  // Perform the search
  const performSearch = async (ticker) => {
    setLoading(true);
    setError(null);
    setFundData(null);

    try {
      const response = await axios.get(`${API_URL}/search`, {
        params: { ticker }
      });
      setFundData(response.data);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to fetch data. Please check the fund name.');
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = async (e) => {
    e.preventDefault();
    if (!searchTerm.trim()) return;

    // Try to find a matching ticker from the fund name
    const matchedItem = tickersWithFunds.find(item =>
      item.fund_name.toUpperCase() === searchTerm.trim()
    );

    if (matchedItem) {
      performSearch(matchedItem.ticker);
    } else {
      // Try search by fund name directly
      performSearch(searchTerm);
    }
  };

  // Navigate back to home (clear search and results)
  const goHome = () => {
    setSearchTerm('');
    setFundData(null);
    setSuggestions([]);
    setShowDropdown(false);
    setError(null);
    setSelectedFundHouse('');
    // scroll to top for a clear view
    try { window.scrollTo({ top: 0, behavior: 'smooth' }); } catch (e) {}
  };

  // Handle clicking on a stock holding
  const handleStockClick = (instrumentName) => {
    const symbol = getStockSymbol(instrumentName);
    if (symbol) {
      navigate(`/stock/${symbol}`);
    }
  };

  // Custom treemap shape with colors and labels
  const CustomizedContent = (props) => {
    const { x, y, width, height, index, payload } = props;
    if (!payload) return null;

    const color = COLORS[index % COLORS.length];
    const fundName = payload.fundName || payload.name || 'Unknown';
    const truncatedName = String(fundName).substring(0, 18);
    const percentage = (payload.portfolioPercentage || payload.value || 0).toFixed(1);

    return (
      <g>
        <rect
          x={x}
          y={y}
          width={width}
          height={height}
          style={{
            fill: color,
            stroke: '#fff',
            strokeWidth: 2,
            opacity: 0.85,
          }}
        />
        {width > 60 && height > 40 && (
          <>
            <text
              x={x + width / 2}
              y={y + height / 2 - 8}
              textAnchor="middle"
              fill="#fff"
              fontSize={11}
              fontWeight="bold"
              style={{ pointerEvents: 'none' }}
            >
              {truncatedName}
            </text>
            <text
              x={x + width / 2}
              y={y + height / 2 + 8}
              textAnchor="middle"
              fill="#fff"
              fontSize={10}
              style={{ pointerEvents: 'none' }}
            >
              {percentage}%
            </text>
          </>
        )}
      </g>
    );
  };

    // Prepare chart data: all holdings for heat map (top 12) and details
    const fundsAll = fundData?.funds || [];

    const allChartData = fundsAll
      .filter(f => (f.portfolioPercentage || 0) > 0)
      .map((f) => ({
        name: f.fundName || f.instrument_name || 'Unknown',
        fundName: f.fundName || f.instrument_name || 'Unknown',
        value: Math.max(0.1, f.portfolioPercentage || 0),
        portfolioPercentage: f.portfolioPercentage || 0,
        assetsUnderManagement: f.assetsUnderManagement || 0,
        fundId: f.fundId
      }));

    // Top 10 for donut chart
    const TOP_N = 10;
    const topFunds = allChartData.slice(0, TOP_N);
    const others = allChartData.slice(TOP_N);
    const othersSum = others.reduce((sum, f) => sum + (f.portfolioPercentage || 0), 0);
    const othersValue = others.reduce((sum, f) => sum + (f.assetsUnderManagement || 0), 0);

    const chartData = topFunds.map(f => ({
      name: f.fundName,
      value: f.portfolioPercentage,
      portfolioPercentage: f.portfolioPercentage
    }));

    if (othersSum > 0) {
      chartData.push({
        name: 'Others',
        value: othersSum,
        portfolioPercentage: othersSum
      });
    }

    // Industry distribution data for donut chart
    const industryChartData = (fundData?.industryDistribution || []).map(item => ({
      name: item.industry,
      value: item.percentage
    }));

    // Export current fund holdings to Excel
    const exportToExcel = (data) => {
      try {
        const rows = data.funds.map((h, idx) => ({
          '#': idx + 1,
          Instrument: h.fundName || h.instrument_name || '',
          Allocation_Percentage: h.portfolioPercentage || 0,
          Value_Lacs: h.assetsUnderManagement || h.market_value_lacs || 0,
          Quantity: h.quantity || 0,
          Scheme: h.scheme || h.scheme_name || '',
          Date: h.date || h.portfolio_date || ''
        }));

        const ws = XLSX.utils.json_to_sheet(rows);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'holdings');

        const fileName = `${data.ticker || 'fund'}_holdings.xlsx`;
        XLSX.writeFile(wb, fileName);
      } catch (err) {
        console.error('Export failed:', err);
        alert('Export failed. Check console for details.');
      }
    };

    // Reset holdings pagination & filter when fund changes
    // (placed here so it re-runs on every render with new fundData — safe since state is stable)

    // Classify holding type (equity / debt / derivatives)
    // Prefer asset_type column if available, otherwise fall back to regex classification
    const classifyHolding = (holding) => {
      // If asset_type column exists, use it directly
      if (holding.asset_type) {
        const assetType = holding.asset_type.toLowerCase();
        if (assetType === 'equity') return 'equity';
        if (assetType === 'debt') return 'debt';
        if (assetType === 'derivatives') return 'derivatives';
        // Map 'others' or any other value to 'derivatives' for now
        return 'derivatives';
      }

      // Fallback to regex-based classification for backward compatibility
      const n = (holding.fundName || holding.instrument_name || '').toUpperCase();
      const ind = (holding.industry || holding.industry_rating || '').toUpperCase();

      if (/(-CE|-PE|\bFUT\b|FUTURES|OPTIONS?\b)/.test(n)) return 'derivatives';

      // Check for coupon rate pattern (e.g., "7.46% REC Limited (30/06/2028)")
      if (/^\d+\.?\d*%/.test(n)) return 'debt';

      // Check industry for debt-related classifications
      if (/\b(CRISIL|SOVEREIGN|CARE|ICRA|AAA|AA\+?|A\+?|BBB|RATING|GOVT\.?|GOVERNMENT)\b/.test(ind)) return 'debt';

      if (/\b(G-?SEC|GSEC|T-?BILL|TBILL|TREP|BOND|NCD|DEBENTURE|COMMERCIAL PAPER|\bCP\b|CERTIFICATE OF DEPOSIT|SDL|REPO|CBLO)\b/.test(n)) return 'debt';
      return 'equity';
    };

    const classifiedHoldings = (fundData?.funds || []).map(f => ({
      ...f,
      holdingType: classifyHolding(f)
    }));

    const typeCounts = {
      all: classifiedHoldings.length,
      equity: classifiedHoldings.filter(h => h.holdingType === 'equity').length,
      debt: classifiedHoldings.filter(h => h.holdingType === 'debt').length,
      derivatives: classifiedHoldings.filter(h => h.holdingType === 'derivatives').length,
    };

    const filteredHoldings = holdingsFilter === 'all'
      ? classifiedHoldings
      : classifiedHoldings.filter(h => h.holdingType === holdingsFilter);

    const maxAllocation = filteredHoldings[0]?.portfolioPercentage || 1;

    return (
    <div className="container">
      <header className="header">
        <h1>
          {viewMode === 'mutual-funds' ? 'Mutual Fund Portfolio'
            : viewMode === 'stocks' ? 'Stock Analysis'
            : viewMode === 'fund-comparison' ? 'Compare Funds'
            : viewMode === 'fund-managers' ? 'Fund Manager Analytics'
            : viewMode === 'fund-screener' ? 'Fund Screener'
            : 'Stock Scores Rating'}
        </h1>
        <p className="subtitle">
          {viewMode === 'mutual-funds'
            ? 'Explore mutual fund portfolio holdings'
            : viewMode === 'stocks'
            ? 'Discover and analyze NSE stocks'
            : viewMode === 'fund-comparison'
            ? 'Side-by-side comparison of mutual funds'
            : viewMode === 'fund-managers'
            ? 'Discover top fund managers by portfolio quality'
            : viewMode === 'fund-screener'
            ? 'Discover funds by sector, stock, AUM, and performance'
            : 'Rank stocks by quality scores'}
        </p>
      </header>

      {viewMode === 'mutual-funds' && (
        <>
        <div className="search-section">
          <form onSubmit={handleSearch}>
            <div className="fund-house-selector">
              <label htmlFor="fundHouseSearch">Fund House:</label>
              <div className="fund-house-search-wrap">
                <input
                  id="fundHouseSearch"
                  type="text"
                  className="fund-house-search-input"
                  placeholder="All"
                  value={fundHouseSearch}
                  autoComplete="off"
                  onChange={(e) => {
                    setFundHouseSearch(e.target.value);
                    setSelectedFundHouse('');
                    setShowFundHouseDropdown(true);
                  }}
                  onFocus={() => setShowFundHouseDropdown(true)}
                  onBlur={() => setTimeout(() => setShowFundHouseDropdown(false), 160)}
                />
                {fundHouseSearch && (
                  <button
                    type="button"
                    className="fund-house-clear"
                    onClick={() => {
                      setFundHouseSearch('');
                      setSelectedFundHouse('');
                      setShowFundHouseDropdown(false);
                    }}
                  >✕</button>
                )}
                {showFundHouseDropdown && (
                  <div className="fund-house-dropdown-list">
                    <div
                      className={`fund-house-option${!selectedFundHouse ? ' selected' : ''}`}
                      onMouseDown={() => {
                        setSelectedFundHouse('');
                        setFundHouseSearch('');
                        setShowFundHouseDropdown(false);
                      }}
                    >
                      All
                    </div>
                    {fundHouses
                      .filter(h => !fundHouseSearch || h.toLowerCase().includes(fundHouseSearch.toLowerCase()))
                      .map(house => (
                        <div
                          key={house}
                          className={`fund-house-option${selectedFundHouse === house ? ' selected' : ''}`}
                          onMouseDown={() => {
                            setSelectedFundHouse(house);
                            setFundHouseSearch(house);
                            setShowFundHouseDropdown(false);
                          }}
                        >
                          {house}
                        </div>
                      ))
                    }
                  </div>
                )}
              </div>
            </div>
            <div className="search-box">
              <div className="search-input-wrapper">
                <input
                  type="text"
                  placeholder={selectedFundHouse ? `Search ${selectedFundHouse} funds...` : "Search mutual funds..."}
                  value={searchTerm}
                  onChange={handleInputChange}
                onFocus={() => {
                  if (searchTerm.trim() === '' && tickersWithFunds.length > 0) {
                    setShowDropdown(true);
                  } else if (searchTerm.trim() && suggestions.length > 0) {
                    setShowDropdown(true);
                  }
                }}
                className="search-input"
              />
              {searchTerm && (
                <button
                  type="button"
                  className="clear-btn"
                  onClick={handleClearSearch}
                  title="Clear search"
                  aria-label="Clear search"
                >
                  ✕
                </button>
              )}
              {showDropdown && (
                <div className="dropdown-suggestions">
                  {searchTerm.trim() === '' ? (
                    <>
                      <div className="suggestions-header">Popular Funds</div>
                      {getPopularFunds().map((item, index) => (
                        <div
                          key={`${item.ticker}-${index}`}
                          className="suggestion-item"
                          onClick={() => handleSuggestionClick(item.ticker, item.fund_name)}
                        >
                          <div className="suggestion-fund-name">{item.fund_name}</div>
                          <div className="suggestion-badge">Popular</div>
                        </div>
                      ))}
                    </>
                  ) : suggestions.length > 0 ? (
                    suggestions.slice(0, 15).map((item, index) => (
                      <div
                        key={`${item.ticker}-${index}`}
                        className="suggestion-item"
                        onClick={() => handleSuggestionClick(item.ticker, item.fund_name)}
                      >
                        <div className="suggestion-fund-name">{item.fund_name}</div>
                      </div>
                    ))
                  ) : (
                    <div className="no-suggestions">No funds found matching "{searchTerm}"</div>
                  )}
                </div>
              )}
            </div>
            <button type="submit" className="search-btn">Search</button>
          </div>
          {tickersWithFunds.length === 0 && (
            <p style={{ color: 'white', marginTop: '10px', fontSize: '0.9em' }}>
              Loading funds... ({tickersWithFunds.length} loaded)
            </p>
          )}
        </form>
      </div>

        {error && <div className="error-box">{error}</div>}

      {loading && (
        <div className="loading">
          <div className="spinner"></div>
          <p>Loading fund data...</p>
        </div>
      )}

      {fundData && (
        <div id="fund-report-container" className="results-section">
          <div className="stock-info">
            <div className="fund-meta">
              <span className="fund-code">{fundData.ticker}</span>
              {fundData.fundHouse && <span className="fund-house-badge">{fundData.fundHouse}</span>}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h2 style={{ margin: 0 }}>{fundData.companyName || 'Fund Portfolio'}</h2>
              <button
                onClick={() => exportFundReportToPDF(fundData)}
                className="export-pdf-btn"
                title="Export to PDF"
              >
                Export PDF
              </button>
            </div>
            <div className="stock-stats">
              <div className="stat">
                <span className="label">Total Portfolio Value</span>
                <span className="value">₹{fundData.freeFloatValue ? (fundData.freeFloatValue / 100).toFixed(2) : '0.00'} Cr</span>
              </div>
              <div className="stat">
                <span className="label">Holdings Count</span>
                <span className="value">{fundData.funds.length}</span>
              </div>
              <div className="stat">
                <span className="label">Total Allocation</span>
                <span className="value">{fundData.totalMFPercentageOfFreeFloat.toFixed(2)}%</span>
              </div>
              {fundData.portfolioPE && (
                <div className="stat">
                  <span className="label">Portfolio P/E Ratio</span>
                  <span className="value">{fundData.portfolioPE}</span>
                </div>
              )}
            </div>
          </div>

          <div className="portfolio-view">
            <div className="chart-card">
              <div className="chart-card-header">
                <div>
                  <h3>Portfolio Distribution</h3>
                  <p className="chart-subtitle">Top holdings by allocation</p>
                </div>
                <span className="chart-badge">Top 10</span>
              </div>
              {!chartData || chartData.length === 0 ? (
                <p className="no-funds">No holdings found for this fund.</p>
              ) : (
                <div className="chart-with-legend">
                  <div className="chart-wrapper">
                    <ResponsiveContainer width="100%" height={300}>
                      <PieChart>
                        <Pie
                          data={chartData}
                          cx="50%"
                          cy="50%"
                          innerRadius={70}
                          outerRadius={110}
                          paddingAngle={3}
                          dataKey="value"
                          nameKey="name"
                          label={false}
                          labelLine={false}
                        >
                          {chartData.map((entry, index) => (
                            <Cell
                              key={`cell-${index}`}
                              fill={entry.name === 'Others' ? 'transparent' : COLORS[index % COLORS.length]}
                              stroke={entry.name === 'Others' ? '#444' : undefined}
                              strokeWidth={entry.name === 'Others' ? 1 : 0}
                            />
                          ))}
                        </Pie>
                        <Tooltip
                          formatter={(value) => `${Number(value).toFixed(2)}%`}
                          contentStyle={{
                            backgroundColor: '#ffffff',
                            border: '1px solid #ccc',
                            borderRadius: '8px',
                            color: '#333333'
                          }}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="chart-center-label">
                      <div className="center-value">{fundData?.funds?.length || 0}</div>
                      <div className="center-text">HOLDINGS</div>
                    </div>
                  </div>
                  <div className="chart-legend-custom">
                    {chartData.map((entry, index) => (
                      <div key={`legend-${index}`} className="legend-item-custom">
                        <div className="legend-color-dot" style={{ backgroundColor: COLORS[index % COLORS.length] }}></div>
                        <div className="legend-label-text">{entry.name}</div>
                        <div className="legend-percent-text">{entry.value.toFixed(2)}%</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="chart-card">
              <div className="chart-card-header">
                <div>
                  <h3>Industry Distribution</h3>
                  <p className="chart-subtitle">Sector-wise breakdown</p>
                </div>
                <span className="chart-badge">{industryChartData?.length || 0} Sectors</span>
              </div>
              {!industryChartData || industryChartData.length === 0 ? (
                <p className="no-funds">No industry data available.</p>
              ) : (
                <div className="chart-with-legend">
                  <div className="chart-wrapper">
                    <ResponsiveContainer width="100%" height={300}>
                      <PieChart>
                        <Pie
                          data={industryChartData}
                          cx="50%"
                          cy="50%"
                          innerRadius={70}
                          outerRadius={110}
                          paddingAngle={3}
                          dataKey="value"
                          nameKey="name"
                          label={false}
                          labelLine={false}
                        >
                          {industryChartData.map((entry, index) => (
                            <Cell
                              key={`cell-${index}`}
                              fill={entry.name === 'Others' ? 'transparent' : COLORS[index % COLORS.length]}
                              stroke={entry.name === 'Others' ? '#444' : undefined}
                              strokeWidth={entry.name === 'Others' ? 1 : 0}
                            />
                          ))}
                        </Pie>
                        <Tooltip
                          formatter={(value) => `${Number(value).toFixed(2)}%`}
                          contentStyle={{
                            backgroundColor: '#ffffff',
                            border: '1px solid #ccc',
                            borderRadius: '8px',
                            color: '#333333'
                          }}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="chart-center-label">
                      <div className="center-value">{industryChartData.length}</div>
                      <div className="center-text">SECTORS</div>
                    </div>
                  </div>
                  <div className="chart-legend-custom">
                    {industryChartData.map((entry, index) => (
                      <div key={`legend-${index}`} className="legend-item-custom">
                        <div className="legend-color-dot" style={{ backgroundColor: COLORS[index % COLORS.length] }}></div>
                        <div className="legend-label-text">{entry.name}</div>
                        <div className="legend-percent-text">{entry.value.toFixed(2)}%</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Portfolio Forensic Scores */}
            <ForensicErrorBoundary key={`forensic-${searchTerm}`}>
              <PortfolioForensicScores ticker={searchTerm} />
            </ForensicErrorBoundary>

            {/* Individual Stock Scores Table */}
            <ForensicErrorBoundary key={`stocks-${searchTerm}`}>
              <PortfolioStockScores ticker={searchTerm} />
            </ForensicErrorBoundary>

            {/* All Holdings - Summary + Popup trigger */}
            <div className="holdings-section">
              <div className="holdings-section-top">
                <div className="holdings-section-meta">
                  <h3 className="holdings-title">All Holdings</h3>
                  <p className="holdings-subtitle">
                    {filteredHoldings.length} instruments · sorted by allocation
                  </p>
                </div>
                <div className="holdings-section-actions">
                  <button className="holdings-export-btn" onClick={() => exportToExcel(fundData)}>
                    ↓ Export
                  </button>
                  <button
                    className="holdings-view-all-btn"
                    onClick={() => { setShowHoldingsModal(true); setHoldingsFilter('all'); }}
                  >
                    View All Holdings
                  </button>
                </div>
              </div>

              {/* Top 5 holdings preview */}
              <div className="holdings-preview">
                {classifiedHoldings.slice(0, 5).map((fund, idx) => {
                  const instrumentName = fund.fundName || fund.instrument_name || 'Unknown';
                  const alloc = fund.portfolioPercentage || 0;
                  const barWidth = maxAllocation > 0 ? (alloc / maxAllocation) * 100 : 0;
                  return (
                    <div key={idx} className="holdings-preview-item">
                      <div className="instrument-cell">
                        <div className="instrument-color-bar" style={{ backgroundColor: COLORS[idx % COLORS.length] }} />
                        <span className="instrument-name">{instrumentName}</span>
                      </div>
                      <div className="alloc-cell">
                        <div className="alloc-bar-track">
                          <div className="alloc-bar-fill" style={{ width: `${barWidth}%` }} />
                        </div>
                        <span className="alloc-pct">{alloc.toFixed(2)}%</span>
                      </div>
                    </div>
                  );
                })}
                {classifiedHoldings.length > 5 && (
                  <button
                    className="holdings-preview-more"
                    onClick={() => { setShowHoldingsModal(true); setHoldingsFilter('all'); }}
                  >
                    +{classifiedHoldings.length - 5} more holdings — click to view all
                  </button>
                )}
              </div>
            </div>

            {/* Holdings Modal */}
            {showHoldingsModal && (
              <div className="holdings-modal-overlay" onClick={() => setShowHoldingsModal(false)}>
                <div className="holdings-modal" onClick={e => e.stopPropagation()}>
                  <div className="holdings-modal-header">
                    <div>
                      <h3 className="holdings-title">All Holdings</h3>
                      <p className="holdings-subtitle">
                        {filteredHoldings.length} instruments · sorted by allocation
                      </p>
                    </div>
                    <div className="holdings-modal-header-actions">
                      <div className="holdings-type-tabs">
                        {[
                          { key: 'all', label: 'All' },
                          { key: 'equity', label: 'Equity' },
                          { key: 'debt', label: 'Debt' },
                          { key: 'derivatives', label: 'Derivatives' },
                        ].map(({ key, label }) => (
                          <button
                            key={key}
                            className={`type-tab ${holdingsFilter === key ? 'active' : ''}`}
                            onClick={() => setHoldingsFilter(key)}
                          >
                            {label}
                            {typeCounts[key] > 0 && (
                              <span className="tab-count">{typeCounts[key]}</span>
                            )}
                          </button>
                        ))}
                      </div>
                      <button className="holdings-export-btn" onClick={() => exportToExcel(fundData)}>
                        ↓ Export
                      </button>
                      <button className="holdings-modal-close" onClick={() => setShowHoldingsModal(false)}>
                        ✕
                      </button>
                    </div>
                  </div>

                  <div className="holdings-table-wrapper">
                    <table className="holdings-table">
                      <thead>
                        <tr>
                          <th className="th-num">#</th>
                          <th className="th-instrument">INSTRUMENT</th>
                          <th className="th-industry">INDUSTRY</th>
                          <th className="th-allocation">ALLOCATION</th>
                          <th className="th-value">VALUE (₹ LAKH)</th>
                          <th className="th-quantity">QUANTITY</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredHoldings.map((fund, idx) => {
                          const globalIdx = idx;
                          const instrumentName = fund.fundName || fund.instrument_name || 'Unknown';
                          const stockSymbol = fund.symbol || null;
                          const hasStockSymbol = stockSymbol !== null;
                          const alloc = fund.portfolioPercentage || 0;
                          const barWidth = maxAllocation > 0 ? (alloc / maxAllocation) * 100 : 0;

                          return (
                            <tr key={`${fund.fundId || globalIdx}`} className="holding-row">
                              <td className="td-num">
                                {String(globalIdx + 1).padStart(2, '0')}
                              </td>
                              <td className="td-instrument">
                                <div className="instrument-cell">
                                  <div
                                    className="instrument-color-bar"
                                    style={{ backgroundColor: COLORS[globalIdx % COLORS.length] }}
                                  />
                                  <span
                                    className={`instrument-name${hasStockSymbol ? ' clickable' : ''}`}
                                    onClick={hasStockSymbol ? () => navigate(`/stock/${stockSymbol}`) : undefined}
                                    title={hasStockSymbol ? 'Click to view stock details' : ''}
                                  >
                                    {instrumentName}
                                  </span>
                                </div>
                              </td>
                              <td className="td-industry">
                                {fund.industry
                                  ? <span className="industry-tag">{fund.industry}</span>
                                  : <span className="industry-tag industry-tag-empty">—</span>}
                              </td>
                              <td className="td-allocation">
                                <div className="alloc-cell">
                                  <div className="alloc-bar-track">
                                    <div
                                      className="alloc-bar-fill"
                                      style={{ width: `${barWidth}%` }}
                                    />
                                  </div>
                                  <span className="alloc-pct">{alloc.toFixed(2)}%</span>
                                </div>
                              </td>
                              <td className="td-value">
                                ₹{(fund.assetsUnderManagement || 0).toLocaleString('en-IN', {
                                  minimumFractionDigits: 2,
                                  maximumFractionDigits: 2
                                })}
                              </td>
                              <td className="td-quantity">
                                {(fund.quantity || 0).toLocaleString('en-IN')}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  <div className="holdings-count-info">
                    Showing {filteredHoldings.length} holdings
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {!fundData && !loading && !error && (
        <div className="empty-state">
          <p>Search for a mutual fund to see its portfolio holdings</p>
        </div>
      )}
        </>
      )}

      {/* Fund Comparison View */}
      {viewMode === 'fund-comparison' && (
        <FundComparison />
      )}

      {/* Fund Manager Analytics View */}
      {viewMode === 'fund-managers' && (
        <FundManagerAnalytics
          onFundClick={(ticker) => {
            setViewMode('mutual-funds');
            setTimeout(() => performSearch(ticker), 100);
          }}
        />
      )}

      {/* Fund Screener View */}
      {viewMode === 'fund-screener' && (
        <FundScreener
          onFundClick={(ticker) => {
            setViewMode('mutual-funds');
            setTimeout(() => performSearch(ticker), 100);
          }}
        />
      )}

      {/* Stock Scores Rating View */}
      {viewMode === 'stock-scores' && (
        <StockScoresRating
          onStockClick={(symbol) => {
            navigate(`/stock/${symbol}`);
          }}
        />
      )}

      {/* Stocks View */}
      {viewMode === 'stocks' && (
        <>
          <div className="search-section">
            <div className="search-box">
              <div className="search-input-wrapper">
                <input
                  type="text"
                  placeholder="Search stocks by name, symbol, or sector..."
                  value={searchTerm}
                  onChange={handleInputChange}
                  className="search-input"
                />
                {searchTerm && (
                  <button
                    type="button"
                    className="clear-btn"
                    onClick={handleClearSearch}
                    title="Clear search"
                    aria-label="Clear search"
                  >
                    ✕
                  </button>
                )}
              </div>
            </div>
          </div>

          <div className="stocks-grid-container">
            <div className="stocks-header">
              <h2>Available Stocks ({filteredStocks.length})</h2>
            </div>
            <div className="stocks-grid">
              {filteredStocks.length > 0 ? (
                filteredStocks.map((stock) => (
                  <div
                    key={stock.id}
                    className="stock-card"
                    onClick={() => handleStockItemClick(stock.symbol)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => e.key === 'Enter' && handleStockItemClick(stock.symbol)}
                  >
                    <div className="stock-card-header">
                      <h3>{stock.name}</h3>
                      <span className="stock-symbol">{stock.symbol}</span>
                    </div>
                    <div className="stock-card-info">
                      {stock.sector && (
                        <div className="stock-info-item">
                          <span className="info-label">Sector:</span>
                          <span className="info-value">{stock.sector}</span>
                        </div>
                      )}
                      {stock.exchange && (
                        <div className="stock-info-item">
                          <span className="info-label">Exchange:</span>
                          <span className="info-value">{stock.exchange}</span>
                        </div>
                      )}
                      {stock.current_price && (
                        <div className="stock-info-item">
                          <span className="info-label">Price:</span>
                          <span className="info-value price">₹{parseFloat(stock.current_price).toFixed(2)}</span>
                        </div>
                      )}
                      {stock.market_cap && (
                        <div className="stock-info-item">
                          <span className="info-label">Market Cap:</span>
                          <span className="info-value">₹{(parseFloat(stock.market_cap) / 10000000).toFixed(2)} Cr</span>
                        </div>
                      )}
                    </div>
                  </div>
                ))
              ) : (
                <div className="empty-state">
                  <p>No stocks found matching "{searchTerm}"</p>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
