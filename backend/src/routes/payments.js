import Razorpay from 'razorpay';
import crypto from 'crypto';
import pool from '../db.js';

// Plans config — amounts in paise (₹1 = 100 paise)
export const PLANS = {
  basic_monthly:  { id: 'basic_monthly',  plan: 'basic', label: 'Basic Monthly',  amount: 19900,  interval: 'monthly',  months: 1 },
  basic_annual:   { id: 'basic_annual',   plan: 'basic', label: 'Basic Annual',   amount: 179900, interval: 'annual',   months: 12 },
  pro_monthly:    { id: 'pro_monthly',    plan: 'pro',   label: 'Pro Monthly',    amount: 49900,  interval: 'monthly',  months: 1 },
  pro_annual:     { id: 'pro_annual',     plan: 'pro',   label: 'Pro Annual',     amount: 449900, interval: 'annual',   months: 12 },
};

function getRazorpay() {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keyId || !keySecret) throw new Error('Razorpay keys not configured');
  return new Razorpay({ key_id: keyId, key_secret: keySecret });
}

/**
 * POST /api/payments/create-order
 * Body: { planId }
 * Creates a Razorpay order for one-time payment (simpler than subscriptions for start).
 */
export async function createOrder(req, res) {
  if (!req.user) return res.status(401).json({ error: 'Login required', loginRequired: true });

  const { planId } = req.body;
  const planConfig = PLANS[planId];
  if (!planConfig) return res.status(400).json({ error: 'Invalid plan' });

  try {
    const razorpay = getRazorpay();
    const order = await razorpay.orders.create({
      amount: planConfig.amount,
      currency: 'INR',
      receipt: `sub_${req.user.userId}_${Date.now()}`,
      notes: {
        userId: String(req.user.userId),
        planId,
        plan: planConfig.plan,
        months: String(planConfig.months),
      },
    });
    res.json({
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      keyId: process.env.RAZORPAY_KEY_ID,
      planLabel: planConfig.label,
    });
  } catch (err) {
    console.error('Create order error:', err.message);
    if (err.message === 'Razorpay keys not configured') {
      return res.status(503).json({ error: 'Payments not configured yet' });
    }
    res.status(500).json({ error: 'Failed to create payment order' });
  }
}

/**
 * POST /api/payments/verify
 * Body: { orderId, paymentId, signature, planId }
 * Verifies Razorpay payment signature and activates subscription.
 */
export async function verifyPayment(req, res) {
  if (!req.user) return res.status(401).json({ error: 'Login required', loginRequired: true });

  const { orderId, paymentId, signature, planId } = req.body;
  const planConfig = PLANS[planId];
  if (!planConfig) return res.status(400).json({ error: 'Invalid plan' });

  try {
    const keySecret = process.env.RAZORPAY_KEY_SECRET;
    if (!keySecret) return res.status(503).json({ error: 'Payments not configured' });

    // Verify signature
    const expectedSig = crypto
      .createHmac('sha256', keySecret)
      .update(`${orderId}|${paymentId}`)
      .digest('hex');

    if (expectedSig !== signature) {
      return res.status(400).json({ error: 'Payment verification failed' });
    }

    // Activate subscription
    const expiresAt = new Date();
    expiresAt.setMonth(expiresAt.getMonth() + planConfig.months);

    await pool.query(
      `UPDATE users
       SET subscription_plan = $1,
           subscription_expires_at = $2,
           razorpay_subscription_id = $3
       WHERE id = $4`,
      [planConfig.plan, expiresAt, paymentId, req.user.userId]
    );

    console.log(`✅ Subscription activated: user ${req.user.userId} → ${planConfig.plan} until ${expiresAt.toISOString()}`);
    res.json({ success: true, plan: planConfig.plan, expiresAt });
  } catch (err) {
    console.error('Verify payment error:', err.message);
    res.status(500).json({ error: 'Payment verification failed' });
  }
}

/**
 * GET /api/payments/plans
 * Returns available plans (public — no auth needed).
 */
export async function getPlans(req, res) {
  res.json({ plans: PLANS, razorpayEnabled: !!(process.env.RAZORPAY_KEY_ID) });
}
