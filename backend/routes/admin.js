const express  = require('express');
const router   = express.Router();
const {
  getAnalytics, getAllUsers, getAllDrivers,
  verifyDriver, verifyVehicle, flagDriver, getAllRides
} = require('../controllers/adminController');
const { authenticate } = require('../middleware/auth');
const { authorize }    = require('../middleware/roleCheck');

// All admin routes require admin role
router.use(authenticate, authorize('admin'));

// GET   /api/admin/analytics               — platform analytics
router.get('/analytics', getAnalytics);

// GET   /api/admin/users                   — list all users (with ?role filter)
router.get('/users', getAllUsers);

// GET   /api/admin/drivers                 — list all drivers with vehicles
router.get('/drivers', getAllDrivers);

// PATCH /api/admin/drivers/:id/verify      — verify/unverify a driver
router.patch('/drivers/:id/verify', verifyDriver);

// PATCH /api/admin/vehicles/:id/verify     — verify/unverify a vehicle
router.patch('/vehicles/:id/verify', verifyVehicle);

// PATCH /api/admin/drivers/:id/flag        — flag/unflag a driver
router.patch('/drivers/:id/flag', flagDriver);

// GET   /api/admin/rides                   — view all rides
router.get('/rides', getAllRides);

module.exports = router;
