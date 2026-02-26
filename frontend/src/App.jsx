import { useState } from 'react';
import { BrowserRouter as Router, Routes, Route, useLocation } from 'react-router-dom';
import { GoogleOAuthProvider } from '@react-oauth/google';
import { AuthProvider } from './context/AuthContext';
import Sidebar from './Sidebar';
import Home from './Home';
import StockDetail from './StockDetail';
import PrivacyPolicy from './components/PrivacyPolicy';
import './AppLayout.css';
import './accessibility.css';

function AppContent() {
  const [viewMode, setViewMode] = useState('mutual-funds');
  const location = useLocation();

  const isStockDetailPage = location.pathname.startsWith('/stock/');
  const isFullPage = location.pathname === '/privacy';

  if (isFullPage) {
    return (
      <Routes>
        <Route path="/privacy" element={<PrivacyPolicy />} />
      </Routes>
    );
  }

  return (
    <div className="app-layout">
      {!isStockDetailPage && (
        <Sidebar viewMode={viewMode} onViewModeChange={setViewMode} />
      )}
      <div className={`main-content ${!isStockDetailPage ? 'with-sidebar' : ''}`}>
        <Routes>
          <Route path="/" element={<Home viewMode={viewMode} setViewMode={setViewMode} />} />
          <Route path="/stock/:symbol" element={<StockDetail />} />
        </Routes>
      </div>
    </div>
  );
}

export default function App() {
  const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;

  const content = (
    <AuthProvider>
      <Router>
        <AppContent />
      </Router>
    </AuthProvider>
  );

  // Wrap with Google OAuth only if client ID is configured
  if (googleClientId) {
    return (
      <GoogleOAuthProvider clientId={googleClientId}>
        {content}
      </GoogleOAuthProvider>
    );
  }

  return content;
}
