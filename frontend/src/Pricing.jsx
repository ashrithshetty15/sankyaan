import React, { useState } from 'react';
import axios from 'axios';
import { useAuth } from './context/AuthContext';
import './Pricing.css';

const API = import.meta.env.VITE_API_URL ||
  (window.location.hostname === 'localhost' ? 'http://localhost:5000/api' : 'https://sankyaan-production.up.railway.app/api');

const FEATURES = [
  { label: 'Mutual fund search & overview',       free: true,  basic: true,  pro: true },
  { label: 'Fund screener (basic filters)',        free: true,  basic: true,  pro: true },
  { label: 'Fund comparison (2 funds)',            free: true,  basic: true,  pro: true },
  { label: 'Blog & market commentary',            free: true,  basic: true,  pro: true },
  { label: 'Paper trading simulator',             free: true,  basic: true,  pro: true },
  { label: 'F&O Commentary (all indices)',         free: true,  basic: true,  pro: true },
  { label: 'Fund screener (all filters)',          free: false, basic: true,  pro: true },
  { label: 'Stock scores (all 500+ stocks)',       free: false, basic: true,  pro: true },
  { label: 'Portfolio overlap analyser',          free: false, basic: true,  pro: true },
  { label: 'Trade alerts',                        free: false, basic: true,  pro: true },
  { label: 'Option chain full view',              free: false, basic: true,  pro: true },
  { label: 'Export to Excel',                     free: false, basic: true,  pro: true },
  { label: 'AI reports',                          free: '3/mo', basic: '30/mo', pro: 'Unlimited' },
  { label: 'Telegram personal alerts',            free: false, basic: false, pro: true },
  { label: 'Real-time OI change alerts',          free: false, basic: false, pro: true },
  { label: 'Instant bulk trade alerts',           free: false, basic: false, pro: true },
  { label: 'Options payoff chart',                free: false, basic: false, pro: true },
];

function Check({ value }) {
  if (value === true) return <span className="pr-yes">✓</span>;
  if (value === false) return <span className="pr-no">—</span>;
  return <span className="pr-partial">{value}</span>;
}

export default function Pricing() {
  const { user } = useAuth();
  const [billing, setBilling] = useState('monthly');
  const [loading, setLoading] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const plans = {
    basic: {
      monthly: { id: 'basic_monthly', price: '₹199', period: 'per month' },
      annual:  { id: 'basic_annual',  price: '₹1,799', period: 'per year', badge: 'Save ₹589' },
    },
    pro: {
      monthly: { id: 'pro_monthly', price: '₹499', period: 'per month' },
      annual:  { id: 'pro_annual',  price: '₹4,499', period: 'per year', badge: 'Save ₹1,489' },
    },
  };

  const handleUpgrade = async (planId, planName) => {
    if (!user) {
      setError('Please sign in first to subscribe.');
      return;
    }
    setError('');
    setSuccess('');
    setLoading(planId);
    try {
      const res = await axios.post(`${API}/payments/create-order`, { planId }, { withCredentials: true });
      const { orderId, amount, currency, keyId, planLabel } = res.data;

      if (!window.Razorpay) {
        setError('Payment gateway not loaded. Please refresh the page and try again.');
        setLoading('');
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
        prefill: { name: user?.name, email: user?.email },
        handler: async (response) => {
          try {
            await axios.post(`${API}/payments/verify`, {
              orderId: response.razorpay_order_id,
              paymentId: response.razorpay_payment_id,
              signature: response.razorpay_signature,
              planId,
            }, { withCredentials: true });
            setSuccess(`🎉 ${planLabel} activated! Refreshing…`);
            setTimeout(() => window.location.reload(), 1500);
          } catch (e) {
            setError('Payment went through but activation failed. Email contact@sankyaan.com.');
          }
        },
        theme: { color: '#3b82f6' },
        modal: { ondismiss: () => setLoading('') },
      });
      rzp.open();
    } catch (e) {
      const msg = e.response?.data?.error || 'Payment setup failed';
      if (msg === 'Payments not configured yet') {
        setError('Payments are coming soon! Email contact@sankyaan.com to get early access.');
      } else {
        setError(msg);
      }
      setLoading('');
    }
  };

  const currentPlan = user?.plan || 'free';

  return (
    <div className="pr-page">
      <div className="pr-hero">
        <h1 className="pr-title">Simple, transparent pricing</h1>
        <p className="pr-subtitle">For Indian investors who want an edge — from MF research to F&O analytics</p>

        <div className="pr-billing-toggle">
          <button
            className={`pr-toggle-btn ${billing === 'monthly' ? 'active' : ''}`}
            onClick={() => setBilling('monthly')}
          >Monthly</button>
          <button
            className={`pr-toggle-btn ${billing === 'annual' ? 'active' : ''}`}
            onClick={() => setBilling('annual')}
          >Annual <span className="pr-save-pill">25% off</span></button>
        </div>
      </div>

      {error && <div className="pr-alert pr-alert-error">{error}</div>}
      {success && <div className="pr-alert pr-alert-success">{success}</div>}

      <div className="pr-cards">
        {/* Free */}
        <div className="pr-card">
          <div className="pr-plan-label">Free</div>
          <div className="pr-price-row">
            <span className="pr-price">₹0</span>
            <span className="pr-period">forever</span>
          </div>
          <p className="pr-desc">Great for getting started with mutual fund research.</p>
          <button className="pr-cta pr-cta-outline" disabled>
            {currentPlan === 'free' ? 'Current plan' : 'Downgrade'}
          </button>
        </div>

        {/* Basic */}
        <div className="pr-card">
          <div className="pr-plan-label">Basic</div>
          <div className="pr-price-row">
            <span className="pr-price">{plans.basic[billing].price}</span>
            <span className="pr-period">{plans.basic[billing].period}</span>
          </div>
          {plans.basic[billing].badge && (
            <div className="pr-badge-savings">{plans.basic[billing].badge}</div>
          )}
          <p className="pr-desc">Full analytics suite for serious MF and equity investors.</p>
          <button
            className={`pr-cta ${currentPlan === 'basic' ? 'pr-cta-outline' : 'pr-cta-primary'}`}
            onClick={() => handleUpgrade(plans.basic[billing].id, 'Basic')}
            disabled={!!loading || currentPlan === 'basic'}
          >
            {loading === plans.basic[billing].id ? 'Processing…' :
             currentPlan === 'basic' ? 'Current plan' :
             currentPlan === 'pro' ? 'Downgrade' : 'Get Basic'}
          </button>
        </div>

        {/* Pro */}
        <div className="pr-card pr-card-pro">
          <div className="pr-popular-badge">Most Popular</div>
          <div className="pr-plan-label">Pro</div>
          <div className="pr-price-row">
            <span className="pr-price">{plans.pro[billing].price}</span>
            <span className="pr-period">{plans.pro[billing].period}</span>
          </div>
          {plans.pro[billing].badge && (
            <div className="pr-badge-savings">{plans.pro[billing].badge}</div>
          )}
          <p className="pr-desc">Everything in Basic + real-time alerts and derivatives tools.</p>
          <button
            className={`pr-cta ${currentPlan === 'pro' ? 'pr-cta-outline' : 'pr-cta-pro'}`}
            onClick={() => handleUpgrade(plans.pro[billing].id, 'Pro')}
            disabled={!!loading || currentPlan === 'pro'}
          >
            {loading === plans.pro[billing].id ? 'Processing…' :
             currentPlan === 'pro' ? 'Current plan' : 'Get Pro'}
          </button>
        </div>
      </div>

      {/* Feature comparison table */}
      <div className="pr-table-wrap">
        <h2 className="pr-table-title">Compare plans</h2>
        <div className="pr-table">
          <div className="pr-table-header">
            <span>Feature</span>
            <span>Free</span>
            <span>Basic</span>
            <span>Pro</span>
          </div>
          {FEATURES.map((f, i) => (
            <div key={i} className="pr-table-row">
              <span>{f.label}</span>
              <Check value={f.free} />
              <Check value={f.basic} />
              <Check value={f.pro} />
            </div>
          ))}
        </div>
      </div>

      <div className="pr-faq">
        <h2 className="pr-faq-title">FAQ</h2>
        <div className="pr-faq-item">
          <strong>Can I cancel anytime?</strong>
          <p>Yes. Your plan stays active until the end of the billing period. No auto-renewal without your consent.</p>
        </div>
        <div className="pr-faq-item">
          <strong>What payment methods are supported?</strong>
          <p>UPI, credit/debit cards, net banking, and wallets — via Razorpay.</p>
        </div>
        <div className="pr-faq-item">
          <strong>Is there a free trial?</strong>
          <p>The free tier has no time limit. Try the core features before upgrading.</p>
        </div>
        <div className="pr-faq-item">
          <strong>Questions or issues?</strong>
          <p>Email <a href="mailto:contact@sankyaan.com">contact@sankyaan.com</a></p>
        </div>
      </div>
    </div>
  );
}
