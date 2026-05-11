/**
 * accountStatus middleware
 * Blocks requests from users whose account is not 'active'.
 * Must run AFTER authenticate so req.user is populated.
 * 
 * Usage: router.use(authenticate, accountStatus, ...)
 *        or per-route: router.post('/...', authenticate, accountStatus, handler)
 */
const db = require('../config/db');

const accountStatus = async (req, res, next) => {
  // Admins bypass the status check (they need access to manage accounts)
  if (req.user && req.user.role === 'admin') return next();

  try {
    const [rows] = await db.query(
      'SELECT account_status FROM users WHERE id = ?',
      [req.user.id]
    );

    if (!rows.length) {
      return res.status(401).json({ success: false, message: 'User not found.' });
    }

    const status = rows[0].account_status;

    if (status === 'active') return next();

    const messages = {
      suspended:            'Your account has been temporarily suspended. Contact support.',
      banned:               'Your account has been permanently banned.',
      pending_verification: 'Your account is pending verification. Please check your email.'
    };

    return res.status(403).json({
      success: false,
      message: messages[status] || 'Account access denied.',
      account_status: status
    });
  } catch (err) {
    console.error('[accountStatus]', err);
    return res.status(500).json({ success: false, message: 'Server error checking account status.' });
  }
};

module.exports = { accountStatus };
