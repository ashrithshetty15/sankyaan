import jwt from 'jsonwebtoken';
import axios from 'axios';
import pool from '../db.js';

const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  path: '/',
};

/**
 * POST /api/auth/google
 * Accepts { access_token } from Google OAuth (useGoogleLogin flow).
 * Fetches user info from Google, enforces domain restriction,
 * upserts user, and returns JWT in httpOnly cookie.
 */
export async function googleLogin(req, res) {
  try {
    const { access_token } = req.body;
    if (!access_token) {
      return res.status(400).json({ error: 'Missing access_token' });
    }

    // Fetch user info from Google using the access token
    const googleRes = await axios.get('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${access_token}` },
    });
    const { sub: googleId, email, name, picture, hd } = googleRes.data;

    // Domain restriction
    const allowedDomain = process.env.GOOGLE_ALLOWED_DOMAIN;
    if (allowedDomain && hd !== allowedDomain) {
      return res.status(403).json({
        error: `Only @${allowedDomain} accounts are allowed`,
      });
    }

    // Upsert user
    const result = await pool.query(
      `INSERT INTO users (google_id, email, name, picture, domain, last_login_at)
       VALUES ($1, $2, $3, $4, $5, NOW())
       ON CONFLICT (google_id)
       DO UPDATE SET
         email = EXCLUDED.email,
         name = EXCLUDED.name,
         picture = EXCLUDED.picture,
         last_login_at = NOW()
       RETURNING id, google_id, email, name, picture`,
      [googleId, email, name, picture, hd || null]
    );
    const user = result.rows[0];

    // Sign JWT
    const token = jwt.sign(
      { userId: user.id, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    // Set httpOnly cookie
    res.cookie('token', token, COOKIE_OPTIONS);
    console.log(`✅ User signed in: ${user.email}`);
    res.json({ user });
  } catch (error) {
    console.error('Google auth error:', error.message);
    res.status(401).json({ error: 'Invalid credential' });
  }
}

/**
 * GET /api/auth/me
 * Returns the current user if a valid JWT is present, or null.
 */
export async function getMe(req, res) {
  if (!req.user) {
    return res.json({ user: null });
  }

  try {
    const result = await pool.query(
      'SELECT id, email, name, picture FROM users WHERE id = $1',
      [req.user.userId]
    );
    res.json({ user: result.rows[0] || null });
  } catch (error) {
    console.error('Get me error:', error.message);
    res.json({ user: null });
  }
}

/**
 * POST /api/auth/logout
 * Clears the session cookie.
 */
export async function logout(req, res) {
  res.clearCookie('token', {
    httpOnly: COOKIE_OPTIONS.httpOnly,
    secure: COOKIE_OPTIONS.secure,
    sameSite: COOKIE_OPTIONS.sameSite,
    path: COOKIE_OPTIONS.path,
  });
  res.json({ success: true });
}
