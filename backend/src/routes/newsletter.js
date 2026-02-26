import crypto from 'crypto';
import db from '../db.js';
import { sendEmail } from '../services/emailService.js';
import { generateDigestHTML } from '../services/digestGenerator.js';

/**
 * POST /api/newsletter/subscribe
 * Accepts { email, name? } and creates a subscription.
 */
export async function subscribe(req, res) {
  try {
    const { email, name } = req.body;

    if (!email || !email.includes('@')) {
      return res.status(400).json({ error: 'Valid email is required' });
    }

    const unsubscribeToken = crypto.randomBytes(32).toString('hex');

    const result = await db.query(
      `INSERT INTO newsletter_subscribers (email, name, unsubscribe_token)
       VALUES ($1, $2, $3)
       ON CONFLICT (email) DO UPDATE SET
         is_active = true,
         unsubscribed_at = NULL,
         name = COALESCE(EXCLUDED.name, newsletter_subscribers.name)
       RETURNING id, email, is_active`,
      [email.toLowerCase().trim(), name || null, unsubscribeToken]
    );

    res.json({ success: true, message: 'Subscribed successfully!' });
  } catch (error) {
    console.error('Error subscribing:', error);
    res.status(500).json({ error: 'Failed to subscribe' });
  }
}

/**
 * GET /api/newsletter/unsubscribe?token=xxx
 * Unsubscribes a user via their unique token. Redirects to confirmation page.
 */
export async function unsubscribe(req, res) {
  try {
    const { token } = req.query;

    if (!token) {
      return res.status(400).json({ error: 'Unsubscribe token is required' });
    }

    const result = await db.query(
      `UPDATE newsletter_subscribers
       SET is_active = false, unsubscribed_at = NOW()
       WHERE unsubscribe_token = $1 AND is_active = true
       RETURNING email`,
      [token]
    );

    if (result.rowCount === 0) {
      return res.json({ success: true, message: 'Already unsubscribed or invalid token.' });
    }

    // Redirect to frontend unsubscribe confirmation page
    const frontendUrl = process.env.FRONTEND_URL || 'https://www.sankyaan.com';
    res.redirect(`${frontendUrl}/unsubscribe?success=true`);
  } catch (error) {
    console.error('Error unsubscribing:', error);
    res.status(500).json({ error: 'Failed to unsubscribe' });
  }
}

/**
 * POST /api/newsletter/send-digest
 * Admin endpoint — sends the market digest to all active subscribers.
 * Protected by ADMIN_API_KEY header check.
 */
export async function sendDigest(req, res) {
  try {
    // Simple API key auth for admin endpoints
    const apiKey = req.headers['x-admin-key'];
    if (!process.env.ADMIN_API_KEY || apiKey !== process.env.ADMIN_API_KEY) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Get all active subscribers
    const subscribers = await db.query(
      'SELECT id, email, name, unsubscribe_token FROM newsletter_subscribers WHERE is_active = true'
    );

    if (subscribers.rows.length === 0) {
      return res.json({ success: true, message: 'No active subscribers', sent: 0 });
    }

    // Generate digest HTML template
    const templateHTML = await generateDigestHTML();

    const today = new Date().toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
    const subject = `Sankyaan Market Digest — ${today}`;

    let sent = 0;
    let failed = 0;

    const apiUrl = process.env.API_URL || 'https://sankyaan-production.up.railway.app/api';

    for (const sub of subscribers.rows) {
      try {
        const unsubscribeUrl = `${apiUrl}/newsletter/unsubscribe?token=${sub.unsubscribe_token}`;
        const personalizedHTML = templateHTML.replace('{{unsubscribe_url}}', unsubscribeUrl);
        await sendEmail(sub.email, subject, personalizedHTML);
        sent++;
      } catch (err) {
        console.error(`Failed to send to ${sub.email}:`, err.message);
        failed++;
      }
    }

    console.log(`Digest sent: ${sent} success, ${failed} failed out of ${subscribers.rows.length} subscribers`);
    res.json({ success: true, sent, failed, total: subscribers.rows.length });
  } catch (error) {
    console.error('Error sending digest:', error);
    res.status(500).json({ error: 'Failed to send digest' });
  }
}
