const express  = require('express');
const router   = express.Router();
const {
  getPendingRides, acceptRide, rejectRide, toggleAvailability,
  getEarnings, registerVehicle, updateRideStatusByDriver
} = require('../controllers/driverController');
const { authenticate } = require('../middleware/auth');
const { authorize }    = require('../middleware/roleCheck');

// All driver routes require driver role
router.use(authenticate, authorize('driver'));

// GET   /api/driver/pending-rides         — available rides to accept
router.get('/pending-rides', getPendingRides);

// POST  /api/driver/rides/:id/accept      — accept a ride
router.post('/rides/:id/accept', acceptRide);

// POST  /api/driver/rides/:id/reject      — pass on a ride
router.post('/rides/:id/reject', rejectRide);

// PATCH /api/driver/availability          — toggle online/offline
router.patch('/availability', toggleAvailability);

// GET   /api/driver/earnings              — view earnings stats
router.get('/earnings', getEarnings);

// POST  /api/driver/vehicle               — register vehicle
router.post('/vehicle', registerVehicle);

// PATCH /api/driver/rides/:id/status      — update ride status
router.patch('/rides/:id/status', updateRideStatusByDriver);

module.exports = router;
