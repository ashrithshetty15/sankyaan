import React, { useState } from 'react';
import './StockTabs.css';

/**
 * StockTabs Component
 *
 * Provides tab navigation for organizing stock detail content
 *
 * @param {Array} tabs - Array of tab objects { label, content }
 * @param {number} defaultTab - Index of initially active tab (default: 0)
 */
export default function StockTabs({ tabs, defaultTab = 0 }) {
  const [activeTab, setActiveTab] = useState(defaultTab);

  if (!tabs || tabs.length === 0) {
    return <div className="stock-tabs-error">No tabs provided</div>;
  }

  return (
    <div className="stock-tabs-container">
      {/* Tab Navigation Header */}
      <div className="tabs-header">
        {tabs.map((tab, index) => (
          <button
            key={index}
            className={`tab-button ${activeTab === index ? 'active' : ''}`}
            onClick={() => setActiveTab(index)}
            aria-selected={activeTab === index}
            role="tab"
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="tab-content" role="tabpanel">
        {tabs[activeTab].content}
      </div>
    </div>
  );
}
