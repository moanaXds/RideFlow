const express  = require('express');
const router   = express.Router();
const { submitRating, getDriverRatings, getRideRatings, getMyRatings } = require('../controllers/ratingController');
const { authenticate } = require('../middleware/auth');

router.use(authenticate);

// POST /api/ratings                        — submit rating (rider→driver OR driver→rider)
router.post('/', submitRating);

// GET  /api/ratings/driver/:driver_id      — all rider→driver ratings for a driver
router.get('/driver/:driver_id', getDriverRatings);

// GET  /api/ratings/ride/:ride_id          — both directions for a completed ride
router.get('/ride/:ride_id', getRideRatings);

// GET  /api/ratings/my                     — ratings received by logged-in user
router.get('/my', getMyRatings);

module.exports = router;
