import jwt from 'jsonwebtoken';

/**
 * Optional auth middleware.
 * If a valid JWT cookie is present, sets req.user = { userId, email }.
 * If not, req.user remains undefined — does NOT block the request.
 */
export function optionalAuth(req, res, next) {
  const token = req.cookies?.token;
  if (!token) {
    return next();
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
  } catch (err) {
    // Token invalid or expired — continue as unauthenticated
  }

  next();
}
