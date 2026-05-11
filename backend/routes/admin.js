const express  = require('express');
const router   = express.Router();
const {
  getAnalytics, getAllUsers, getAllDrivers,
  verifyDriver, verifyVehicle, flagDriver, getAllRides,
  setAccountStatus, getPermissions, setPermission,
  getCommissionReport, markPayoutPaid
} = require('../controllers/adminController');
const { authenticate } = require('../middleware/auth');
const { authorize }    = require('../middleware/roleCheck');

// All admin routes require admin role
router.use(authenticate, authorize('admin'));

// ── v1 routes (unchanged) ───────────────────────────────────
router.get('/analytics',              getAnalytics);
router.get('/users',                  getAllUsers);
router.get('/drivers',                getAllDrivers);
router.patch('/drivers/:id/verify',   verifyDriver);
router.patch('/vehicles/:id/verify',  verifyVehicle);
router.patch('/drivers/:id/flag',     flagDriver);
router.get('/rides',                  getAllRides);

// ── v2 additions ────────────────────────────────────────────
// Account status management (GRANT/REVOKE style)
router.patch('/users/:id/status',     setAccountStatus);

// Role permission management
router.get('/permissions',            getPermissions);
router.patch('/permissions',          setPermission);

// Commission & payout management
router.get('/commissions',            getCommissionReport);
router.post('/payouts/:payment_id',   markPayoutPaid);

module.exports = router;
