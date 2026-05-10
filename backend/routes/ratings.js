const express  = require('express');
const router   = express.Router();
const { submitRating, getDriverRatings } = require('../controllers/ratingController');
const { authenticate } = require('../middleware/auth');

router.use(authenticate);

// POST /api/ratings                          — submit a rating (rider only)
router.post('/', submitRating);

// GET  /api/ratings/driver/:driver_id        — get all ratings for a driver
router.get('/driver/:driver_id', getDriverRatings);

module.exports = router;
