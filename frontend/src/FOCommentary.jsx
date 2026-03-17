import React, { useState } from 'react';
import NiftyCommentary from './NiftyCommentary.jsx';
import StockCommentary from './StockCommentary.jsx';
import './FOCommentary.css';

export default function FOCommentary() {
  const [tab, setTab] = useState('index');

  return (
    <div className="foc-container">
      <div className="foc-tabs">
        <button
          className={`foc-tab ${tab === 'index' ? 'active' : ''}`}
          onClick={() => setTab('index')}
        >
          🎙️ Index (Nifty &amp; BankNifty)
        </button>
        <button
          className={`foc-tab ${tab === 'stock' ? 'active' : ''}`}
          onClick={() => setTab('stock')}
        >
          📊 Stock F&amp;O
        </button>
      </div>

      <div className="foc-content">
        {tab === 'index' ? <NiftyCommentary /> : <StockCommentary />}
      </div>
    </div>
  );
}
