import React, { useState } from 'react';
import axios from 'axios';
import './PaywallModal.css';

const API = import.meta.env.VITE_API_URL ||
  (window.location.hostname === 'localhost' ? 'http://localhost:5000/api' : 'https://sankyaan-production.up.railway.app/api');

const PLANS_INFO = {
  basic: {
    monthly: { id: 'basic_monthly', price: '₹199', period: '/month', savings: null },
    annual:  { id: 'basic_annual',  price: '₹1,799', period: '/year', savings: 'Save ₹589' },
    features: [
      'All fund screener filters',
      'Full stock scores (500+ stocks)',
      'Portfolio overlap analyser',
      '30 AI reports/month',
      'Trade alerts access',
      'Option chain full view',
      'Export to Excel',
    ],
  },
  pro: {
    monthly: { id: 'pro_monthly', price: '₹499', period: '/month', savings: null },
    annual:  { id: 'pro_annual',  price: '₹4,499', period: '/year', savings: 'Save ₹1,489' },
    features: [
      'Everything in Basic',
      'Telegram personal alerts',
      'Real-time OI change alerts',
      'Instant bulk trade alerts',
      'Unlimited AI reports',
      'Options payoff chart',
      'Tax harvesting tool (coming)',
    ],
  },
};

export default function PaywallModal({ onClose, defaultPlan = 'basic', featureDescription }) {
  const [billing, setBilling] = useState('monthly');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleUpgrade = async (planId) => {
    setError('');
    setLoading(true);
    try {
      const res = await axios.post(`${API}/payments/create-order`, { planId }, { withCredentials: true });
      const { orderId, amount, currency, keyId, planLabel } = res.data;

      if (!window.Razorpay) {
        setError('Payment gateway loading… try again in a moment.');
        setLoading(false);
        return;
      }
      if (!keyId) {
        setError('Payment gateway not configured. Please contact contact@sankyaan.com.');
        setLoading(false);
        return;
      }

      const rzp = new window.Razorpay({
        key: keyId,
        amount,
        currency,
        order_id: orderId,
        name: 'Sankyaan',
        description: planLabel,
        image: '/Sankyaan.jpeg',
        handler: async (response) => {
          try {
            await axios.post(`${API}/payments/verify`, {
              orderId: response.razorpay_order_id,
              paymentId: response.razorpay_payment_id,
              signature: response.razorpay_signature,
              planId,
            }, { withCredentials: true });
            // Reload to refresh subscription state
            window.location.reload();
          } catch (e) {
            setError('Payment successful but activation failed. Contact support.');
          }
        },
        prefill: {},
        theme: { color: '#3b82f6' },
        modal: { ondismiss: () => setLoading(false) },
      });
      rzp.open();
    } catch (e) {
      const msg = e.response?.data?.error || 'Payment setup failed';
      if (msg === 'Payments not configured yet') {
        setError('Payments coming soon! Email contact@sankyaan.com to get early access.');
      } else {
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="pw-overlay" onClick={onClose}>
      <div className="pw-modal" onClick={e => e.stopPropagation()}>
        <button className="pw-close" onClick={onClose}>✕</button>

        <div className="pw-header">
          <div className="pw-lock">🔒</div>
          <h2 className="pw-title">Upgrade to unlock</h2>
          {featureDescription && (
            <p className="pw-feature-desc">{featureDescription}</p>
          )}
        </div>

        <div className="pw-billing-toggle">
          <button
            className={`pw-toggle-btn ${billing === 'monthly' ? 'active' : ''}`}
            onClick={() => setBilling('monthly')}
          >Monthly</button>
          <button
            className={`pw-toggle-btn ${billing === 'annual' ? 'active' : ''}`}
            onClick={() => setBilling('annual')}
          >Annual <span className="pw-save-badge">25% off</span></button>
        </div>

        <div className="pw-cards">
          {['basic', 'pro'].map(planKey => {
            const info = PLANS_INFO[planKey];
            const pricing = info[billing];
            const isHighlighted = planKey === defaultPlan;
            return (
              <div key={planKey} className={`pw-card ${isHighlighted ? 'pw-card-highlight' : ''}`}>
                {isHighlighted && <div className="pw-recommended">Recommended</div>}
                <div className="pw-plan-name">{planKey === 'basic' ? 'Basic' : 'Pro'}</div>
                <div className="pw-price">
                  {pricing.price}
                  <span className="pw-period">{pricing.period}</span>
                </div>
                {pricing.savings && <div className="pw-savings">{pricing.savings}</div>}
                <ul className="pw-features">
                  {info.features.map((f, i) => (
                    <li key={i}><span className="pw-check">✓</span>{f}</li>
                  ))}
                </ul>
                <button
                  className={`pw-cta ${isHighlighted ? 'pw-cta-primary' : 'pw-cta-secondary'}`}
                  onClick={() => handleUpgrade(pricing.id)}
                  disabled={loading}
                >
                  {loading ? 'Processing…' : `Get ${planKey === 'basic' ? 'Basic' : 'Pro'}`}
                </button>
              </div>
            );
          })}
        </div>

        {error && <div className="pw-error">{error}</div>}
        <p className="pw-footer">Secure payment via Razorpay · Cancel anytime</p>
      </div>
    </div>
  );
}
