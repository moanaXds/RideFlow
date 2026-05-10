const express  = require('express');
const router   = express.Router();
const { requestRide, updateRideStatus, getRideHistory, getActiveRide, cancelRide } = require('../controllers/rideController');
const { authenticate } = require('../middleware/auth');

// All routes require authentication
router.use(authenticate);

// POST   /api/rides/request        — create a new ride request
router.post('/request', requestRide);

// GET    /api/rides/history        — ride history (role-aware)
router.get('/history', getRideHistory);

// GET    /api/rides/active         — get current active ride
router.get('/active', getActiveRide);

// PATCH  /api/rides/:id/status     — update ride status
router.patch('/:id/status', updateRideStatus);

// POST   /api/rides/:id/cancel     — rider cancels a ride
router.post('/:id/cancel', cancelRide);

module.exports = router;
