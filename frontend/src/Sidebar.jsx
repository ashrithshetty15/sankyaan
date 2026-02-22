import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import './Sidebar.css';

export default function Sidebar({ viewMode, onViewModeChange }) {
  const navigate = useNavigate();
  const location = useLocation();
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
    </>
  );
}
