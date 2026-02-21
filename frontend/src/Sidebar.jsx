import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import './Sidebar.css';

export default function Sidebar({ viewMode, onViewModeChange }) {
  const navigate = useNavigate();
  const location = useLocation();

  const handleNavClick = (mode) => {
    if (location.pathname !== '/') {
      navigate('/');
    }
    onViewModeChange(mode);
  };

  const handleLogoClick = () => {
    navigate('/');
    onViewModeChange('mutual-funds');
  };

  return (
    <div className="sidebar">
      <div className="sidebar-header" onClick={handleLogoClick} role="button">
        <div className="sidebar-logo">
          <img src="/Sankyaan.jpeg" alt="Sankyaan" className="logo-image" />
          <span className="logo-text">Sankyaan</span>
        </div>
        <div className="sidebar-tagline">Portfolio Analytics</div>
      </div>

      <nav className="sidebar-nav">
        <div className="nav-section-label">EXPLORE</div>

        <button
          className={`nav-item ${viewMode === 'mutual-funds' ? 'active' : ''}`}
          onClick={() => handleNavClick('mutual-funds')}
        >
          <span className="nav-icon">💼</span>
          <span className="nav-text">Mutual Funds</span>
        </button>

        <button
          className={`nav-item ${viewMode === 'stocks' ? 'active' : ''}`}
          onClick={() => handleNavClick('stocks')}
        >
          <span className="nav-icon">📈</span>
          <span className="nav-text">Stocks</span>
        </button>

        <div className="nav-section-label">ANALYSIS</div>

        <button
          className={`nav-item ${viewMode === 'fund-scores' ? 'active' : ''}`}
          onClick={() => handleNavClick('fund-scores')}
        >
          <span className="nav-icon">🏆</span>
          <span className="nav-text">Fund Scores Rating</span>
        </button>

        <button
          className={`nav-item ${viewMode === 'stock-scores' ? 'active' : ''}`}
          onClick={() => handleNavClick('stock-scores')}
        >
          <span className="nav-icon">⭐</span>
          <span className="nav-text">Stock Scores Rating</span>
        </button>
      </nav>
    </div>
  );
}
