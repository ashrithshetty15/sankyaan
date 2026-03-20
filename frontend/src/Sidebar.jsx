import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import UserProfile from './components/UserProfile';
import './Sidebar.css';

export default function Sidebar({ viewMode, onViewModeChange }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const handleNavClick = (mode) => {
    if (location.pathname !== '/') {
      navigate('/');
    }
    onViewModeChange(mode);
    setIsMobileMenuOpen(false); // Close menu on mobile after selection
  };

  const handleLogoClick = () => {
    navigate('/');
    onViewModeChange('mutual-funds');
    setIsMobileMenuOpen(false);
  };

  const toggleMobileMenu = () => {
    setIsMobileMenuOpen(!isMobileMenuOpen);
  };

  return (
    <>
      {/* Mobile Menu Button */}
      <button className="mobile-menu-btn" onClick={toggleMobileMenu} aria-label="Toggle menu">
        <span className="hamburger-icon">
          {isMobileMenuOpen ? '✕' : '☰'}
        </span>
      </button>

      {/* Overlay for mobile */}
      {isMobileMenuOpen && (
        <div className="sidebar-overlay" onClick={() => setIsMobileMenuOpen(false)}></div>
      )}

      <div className={`sidebar ${isMobileMenuOpen ? 'open' : ''}`}>
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

        <button
          className="nav-item"
          onClick={() => { window.location.href = '/blog'; }}
        >
          <span className="nav-icon">✍️</span>
          <span className="nav-text">Blog</span>
        </button>

        <div className="nav-section-label">ANALYSIS</div>

        <button
          className={`nav-item ${viewMode === 'portfolio-tracker' ? 'active' : ''} `}
          onClick={() => handleNavClick('portfolio-tracker')}
        >
          <span className="nav-icon">💰</span>
          <span className="nav-text">My Portfolio</span>
        </button>

        <button
          className={`nav-item ${viewMode === 'stock-scores' ? 'active' : ''} `}
          onClick={() => handleNavClick('stock-scores')}
        >
          <span className="nav-icon">⭐</span>
          <span className="nav-text">Stock Scores</span>
        </button>

        <button
          className={`nav-item ${viewMode === 'fund-screener' ? 'active' : ''} `}
          onClick={() => handleNavClick('fund-screener')}
        >
          <span className="nav-icon">🔍</span>
          <span className="nav-text">Fund Screener</span>
        </button>

        <button
          className={`nav-item ${viewMode === 'fund-comparison' ? 'active' : ''} `}
          onClick={() => handleNavClick('fund-comparison')}
        >
          <span className="nav-icon">⚖️</span>
          <span className="nav-text">Compare Funds</span>
        </button>

        <button
          className={`nav-item ${viewMode === 'fund-managers' ? 'active' : ''} `}
          onClick={() => handleNavClick('fund-managers')}
        >
          <span className="nav-icon">👤</span>
          <span className="nav-text">Fund Managers</span>
        </button>

        <button
          className={`nav-item ${viewMode === 'bulk-trades' ? 'active' : ''} `}
          onClick={() => handleNavClick('bulk-trades')}
        >
          <span className="nav-icon">📊</span>
          <span className="nav-text">Bulk Trades</span>
        </button>

        <button
          className={`nav-item ${viewMode === 'market-sentiment' ? 'active' : ''}`}
          onClick={() => handleNavClick('market-sentiment')}
        >
          <span className="nav-icon">🧭</span>
          <span className="nav-text">Market Sentiment</span>
        </button>

        <div className="nav-section-label">TRADING</div>

        <button
          className={`nav-item ${viewMode === 'fo-commentary' ? 'active' : ''}`}
          onClick={() => handleNavClick('fo-commentary')}
        >
          <span className="nav-icon">🎙️</span>
          <span className="nav-text">F&amp;O Commentary</span>
        </button>

        <button
          className={`nav-item ${viewMode === 'stock-commentary' ? 'active' : ''}`}
          onClick={() => handleNavClick('stock-commentary')}
        >
          <span className="nav-icon">📊</span>
          <span className="nav-text">Stock F&amp;O</span>
        </button>

        <button
          className={`nav-item ${viewMode === 'trade-alerts' ? 'active' : ''}`}
          onClick={() => handleNavClick('trade-alerts')}
        >
          <span className="nav-icon">🎯</span>
          <span className="nav-text">Trade Alerts</span>
        </button>

        <button
          className={`nav-item ${viewMode === 'paper-trading' ? 'active' : ''}`}
          onClick={() => handleNavClick('paper-trading')}
        >
          <span className="nav-icon">📝</span>
          <span className="nav-text">Paper Trading</span>
        </button>

      </nav>

        <UserProfile />
        <div className="sidebar-footer">
          <a href="mailto:contact@sankyaan.com" className="footer-email">contact@sankyaan.com</a>
        </div>
    </div>
    </>
  );
}
