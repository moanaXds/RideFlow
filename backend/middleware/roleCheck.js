/**
 * Role-based access control middleware factory.
 * Usage: authorize('admin') or authorize('driver','admin')
 */
const authorize = (...roles) => (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ success: false, message: 'Not authenticated.' });
  }
  if (!roles.includes(req.user.role)) {
    return res.status(403).json({
      success: false,
      message: `Access forbidden. Required role: ${roles.join(' or ')}.`
    });
  }
  next();
};

module.exports = { authorize };
