const express    = require('express');
const router     = express.Router();
const { authenticate } = require('../middleware/auth');
const {
  scheduleRide,
  getScheduledRides,
  updateScheduleStatus
} = require('../controllers/scheduleController');

router.use(authenticate);

// POST   /api/schedule         — book a future ride
router.post('/',               scheduleRide);

// GET    /api/schedule         — list scheduled rides (role-aware in controller)
router.get('/',                getScheduledRides);

// PATCH  /api/schedule/:id/status  — confirm (admin) or cancel (rider)
router.patch('/:id/status',    updateScheduleStatus);

module.exports = router;
