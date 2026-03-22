import pool from '../db.js';

const PLAN_RANKS = { free: 0, basic: 1, pro: 2 };

/**
 * Middleware factory: requirePlan('basic') or requirePlan('pro')
 * Rejects with 403 if the user's subscription_plan is below minPlan.
 * Returns 401 if not authenticated.
 * Returns 402 with { upgradeRequired: true, minPlan } if plan is too low.
 */
export function requirePlan(minPlan) {
  return async (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Sign in required', loginRequired: true });
    }

    try {
      const result = await pool.query(
        'SELECT subscription_plan, subscription_expires_at FROM users WHERE id = $1',
        [req.user.userId]
      );
      const row = result.rows[0];
      if (!row) return res.status(401).json({ error: 'User not found', loginRequired: true });

      const plan = row.subscription_plan || 'free';
      const expired = row.subscription_expires_at && new Date(row.subscription_expires_at) < new Date();
      const effectivePlan = expired ? 'free' : plan;

      const userRank = PLAN_RANKS[effectivePlan] ?? 0;
      const requiredRank = PLAN_RANKS[minPlan] ?? 1;

      if (userRank < requiredRank) {
        return res.status(402).json({
          error: `This feature requires a ${minPlan} plan`,
          upgradeRequired: true,
          currentPlan: effectivePlan,
          minPlan,
        });
      }

      req.userPlan = effectivePlan;
      next();
    } catch (err) {
      console.error('requirePlan error:', err.message);
      res.status(500).json({ error: 'Auth check failed' });
    }
  };
}
