import crypto from 'crypto';
import nodemailer from 'nodemailer';
import db from '../db.js';

function createTransport() {
  return nodemailer.createTransport({
    host: process.env.EMAIL_HOST,
    port: parseInt(process.env.EMAIL_PORT || '587'),
    secure: process.env.EMAIL_SECURE === 'true',
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });
}

const FROM = process.env.EMAIL_FROM || 'Sankyaan <contact@sankyaan.com>';
const BASE_URL = process.env.BACKEND_URL || 'https://sankyaan-production.up.railway.app';
const SITE_URL = 'https://sankyaan.com';

/**
 * POST /api/newsletter/subscribe
 * Body: { email }
 */
export async function subscribe(req, res) {
  const { email } = req.body;
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'Valid email required' });
  }

  try {
    const token = crypto.randomBytes(32).toString('hex');

    // Upsert — if already subscribed return success without re-sending
    const existing = await db.query(
      'SELECT id, confirmed, unsubscribed_at FROM newsletter_subscribers WHERE email = $1',
      [email]
    );

    if (existing.rows.length > 0) {
      const sub = existing.rows[0];
      if (sub.confirmed && !sub.unsubscribed_at) {
        return res.json({ message: 'Already subscribed!' });
      }
      // Re-subscribe (was unsubscribed or unconfirmed)
      await db.query(
        `UPDATE newsletter_subscribers
         SET token = $1, confirmed = FALSE, unsubscribed_at = NULL, subscribed_at = NOW()
         WHERE email = $2`,
        [token, email]
      );
    } else {
      await db.query(
        'INSERT INTO newsletter_subscribers (email, token) VALUES ($1, $2)',
        [email, token]
      );
    }

    // Send confirmation email
    if (process.env.EMAIL_HOST) {
      const confirmUrl = `${BASE_URL}/api/newsletter/confirm/${token}`;
      const transport = createTransport();
      await transport.sendMail({
        from: FROM,
        to: email,
        subject: 'Confirm your Sankyaan newsletter subscription',
        html: `
          <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;background:#0d1117;color:#e8edf5;padding:32px;border-radius:12px;">
            <div style="margin-bottom:24px;">
              <span style="font-size:22px;font-weight:800;background:linear-gradient(135deg,#f0b429,#ffd166);-webkit-background-clip:text;-webkit-text-fill-color:transparent;">Sankyaan</span>
            </div>
            <h2 style="color:#e8edf5;margin-bottom:12px;">Confirm your subscription</h2>
            <p style="color:#8b95a8;margin-bottom:24px;">You're one click away from receiving the latest mutual fund insights, SEBI updates, and portfolio strategies from Sankyaan.</p>
            <a href="${confirmUrl}" style="display:inline-block;background:linear-gradient(135deg,#f0b429,#ffd166);color:#0d1117;padding:12px 28px;border-radius:8px;font-weight:700;text-decoration:none;">Confirm Subscription</a>
            <p style="color:#545f72;font-size:12px;margin-top:24px;">If you didn't sign up, you can safely ignore this email.</p>
          </div>
        `,
      });
    }

    res.json({ message: 'Check your inbox to confirm your subscription.' });
  } catch (err) {
    console.error('Newsletter subscribe error:', err.message);
    res.status(500).json({ error: 'Subscription failed, please try again.' });
  }
}

/**
 * GET /api/newsletter/confirm/:token
 */
export async function confirm(req, res) {
  const { token } = req.params;
  try {
    const result = await db.query(
      `UPDATE newsletter_subscribers SET confirmed = TRUE
       WHERE token = $1 AND unsubscribed_at IS NULL
       RETURNING email`,
      [token]
    );

    if (result.rows.length === 0) {
      return res.redirect(`${SITE_URL}/blog?newsletter=invalid`);
    }

    res.redirect(`${SITE_URL}/blog?newsletter=confirmed`);
  } catch (err) {
    console.error('Newsletter confirm error:', err.message);
    res.redirect(`${SITE_URL}/blog?newsletter=error`);
  }
}

/**
 * GET /api/newsletter/unsubscribe/:token
 */
export async function unsubscribe(req, res) {
  const { token } = req.params;
  try {
    await db.query(
      `UPDATE newsletter_subscribers SET unsubscribed_at = NOW()
       WHERE token = $1`,
      [token]
    );
    res.redirect(`${SITE_URL}/blog?newsletter=unsubscribed`);
  } catch (err) {
    console.error('Newsletter unsubscribe error:', err.message);
    res.redirect(`${SITE_URL}/blog?newsletter=error`);
  }
}

/**
 * POST /api/newsletter/send
 * Body: { secret, subject, title, excerpt, url, html? }
 * Protected by NEWSLETTER_SECRET env var.
 */
export async function sendNewsletter(req, res) {
  const { secret, subject, title, excerpt, url, html: customHtml } = req.body;

  if (!process.env.NEWSLETTER_SECRET || secret !== process.env.NEWSLETTER_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (!subject || !title || !url) {
    return res.status(400).json({ error: 'subject, title, and url are required' });
  }

  if (!process.env.EMAIL_HOST) {
    return res.status(503).json({ error: 'Email not configured (EMAIL_HOST missing)' });
  }

  try {
    const result = await db.query(
      `SELECT email, token FROM newsletter_subscribers
       WHERE confirmed = TRUE AND unsubscribed_at IS NULL`
    );

    const subscribers = result.rows;
    if (subscribers.length === 0) {
      return res.json({ message: 'No confirmed subscribers', sent: 0 });
    }

    const transport = createTransport();
    let sent = 0;
    const errors = [];

    for (const sub of subscribers) {
      const unsubUrl = `${BASE_URL}/api/newsletter/unsubscribe/${sub.token}`;
      const emailHtml = customHtml || `
        <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;background:#0d1117;color:#e8edf5;border-radius:12px;overflow:hidden;">
          <div style="padding:24px 32px;background:#161c26;border-bottom:1px solid #252d3d;">
            <span style="font-size:20px;font-weight:800;background:linear-gradient(135deg,#f0b429,#ffd166);-webkit-background-clip:text;-webkit-text-fill-color:transparent;">Sankyaan</span>
            <span style="color:#545f72;font-size:13px;margin-left:10px;">Research & Insights</span>
          </div>
          <div style="padding:32px;">
            <h1 style="color:#e8edf5;font-size:22px;line-height:1.3;margin-bottom:12px;">${title}</h1>
            ${excerpt ? `<p style="color:#8b95a8;font-size:15px;line-height:1.6;margin-bottom:24px;">${excerpt}</p>` : ''}
            <a href="${url}" style="display:inline-block;background:linear-gradient(135deg,#f0b429,#ffd166);color:#0d1117;padding:12px 28px;border-radius:8px;font-weight:700;text-decoration:none;">Read Article →</a>
          </div>
          <div style="padding:20px 32px;background:#161c26;border-top:1px solid #252d3d;font-size:12px;color:#545f72;">
            <p>You're receiving this because you subscribed to Sankyaan insights.</p>
            <p style="margin-top:6px;"><a href="${unsubUrl}" style="color:#8b95a8;">Unsubscribe</a></p>
          </div>
        </div>
      `;

      try {
        await transport.sendMail({
          from: FROM,
          to: sub.email,
          subject,
          html: emailHtml,
        });
        sent++;
      } catch (err) {
        errors.push({ email: sub.email, error: err.message });
      }
    }

    console.log(`Newsletter sent: ${sent}/${subscribers.length} delivered`);
    res.json({ message: 'Newsletter sent', sent, total: subscribers.length, errors });
  } catch (err) {
    console.error('Newsletter send error:', err.message);
    res.status(500).json({ error: 'Failed to send newsletter' });
  }
}

/**
 * GET /api/newsletter/stats  (quick admin check)
 */
export async function getStats(req, res) {
  const { secret } = req.query;
  if (!process.env.NEWSLETTER_SECRET || secret !== process.env.NEWSLETTER_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  try {
    const r = await db.query(`
      SELECT
        COUNT(*) FILTER (WHERE confirmed AND unsubscribed_at IS NULL) AS active,
        COUNT(*) FILTER (WHERE NOT confirmed) AS pending,
        COUNT(*) FILTER (WHERE unsubscribed_at IS NOT NULL) AS unsubscribed
      FROM newsletter_subscribers
    `);
    res.json(r.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
