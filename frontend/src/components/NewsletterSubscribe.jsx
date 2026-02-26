import React, { useState } from 'react';
import axios from 'axios';
import './NewsletterSubscribe.css';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

export default function NewsletterSubscribe() {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState(null); // 'success' | 'error'
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email.trim()) return;

    try {
      setLoading(true);
      setStatus(null);
      await axios.post(`${API_URL}/newsletter/subscribe`, { email: email.trim() });
      setStatus('success');
      setEmail('');
    } catch {
      setStatus('error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="newsletter-section">
      <div className="newsletter-label">Get Monthly Digest</div>
      {status === 'success' ? (
        <div className="newsletter-success">Subscribed!</div>
      ) : (
        <form className="newsletter-form" onSubmit={handleSubmit}>
          <input
            type="email"
            placeholder="Your email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="newsletter-input"
            required
          />
          <button type="submit" className="newsletter-btn" disabled={loading}>
            {loading ? '...' : 'Go'}
          </button>
        </form>
      )}
      {status === 'error' && (
        <div className="newsletter-error">Failed. Try again.</div>
      )}
    </div>
  );
}
