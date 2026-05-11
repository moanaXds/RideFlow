const db = require('../config/db');

const RATING_THRESHOLD = parseFloat(process.env.DRIVER_RATING_THRESHOLD || 3.5);

// ── POST /api/ratings ────────────────────────────────────────
// Supports both rider→driver AND driver→rider ratings.
// rated_by field determines direction.
const submitRating = async (req, res) => {
  const { ride_id, rating, comment, rated_by } = req.body;

  if (!ride_id || !rating) {
    return res.status(400).json({ success: false, message: 'ride_id and rating are required.' });
  }
  if (rating < 1 || rating > 5) {
    return res.status(400).json({ success: false, message: 'Rating must be between 1 and 5.' });
  }

  // Determine rating direction from request or user role
  const direction = rated_by || (req.user.role === 'driver' ? 'driver' : 'rider');

  if (!['rider', 'driver'].includes(direction)) {
    return res.status(400).json({ success: false, message: 'rated_by must be rider or driver.' });
  }

  try {
    // Verify ride is completed
    const [rideRows] = await db.query(
      `SELECT r.*, d.user_id AS driver_user_id
       FROM rides r
       LEFT JOIN drivers d ON d.id = r.driver_id
       WHERE r.id = ? AND r.status = 'completed'`,
      [ride_id]
    );
    if (!rideRows.length) {
      return res.status(404).json({ success: false, message: 'Completed ride not found.' });
    }
    const ride = rideRows[0];

    if (!ride.driver_id) {
      return res.status(400).json({ success: false, message: 'No driver assigned to this ride.' });
    }

    // Validate caller is the correct party for this direction
    if (direction === 'rider' && ride.rider_id !== req.user.id) {
      return res.status(403).json({ success: false, message: 'You did not take this ride.' });
    }
    if (direction === 'driver' && ride.driver_user_id !== req.user.id) {
      return res.status(403).json({ success: false, message: 'You did not drive this ride.' });
    }

    // The trigger trg_rating_before_insert enforces uniqueness per (ride_id, rated_by)
    // and auto-populates rated_user. We still pass rated_user for INSERT.
    let rated_user;
    if (direction === 'rider') {
      // Rider rates driver → rated_user = driver's user account
      rated_user = ride.driver_user_id;
    } else {
      // Driver rates rider → rated_user = rider's user_id
      rated_user = ride.rider_id;
    }

    await db.query(
      `INSERT INTO ratings (ride_id, rider_id, driver_id, rating, comment, rated_by, rated_user)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [ride_id, ride.rider_id, ride.driver_id, rating, comment || null, direction, rated_user]
    );

    // If rider rated driver, return updated avg (trigger already updated drivers table)
    let avg_rating = null;
    let driver_flagged = false;
    if (direction === 'rider') {
      const [avgRows] = await db.query(
        `SELECT avg_rating, flagged FROM drivers WHERE id = ?`,
        [ride.driver_id]
      );
      avg_rating     = parseFloat(avgRows[0].avg_rating);
      driver_flagged = avgRows[0].flagged === 1;
    }

    return res.status(201).json({
      success: true,
      message: `Rating submitted (${direction} → ${direction === 'rider' ? 'driver' : 'rider'}).`,
      ...(direction === 'rider' && { avg_rating, driver_flagged })
    });
  } catch (err) {
    // MySQL SIGNAL from trigger lands here
    if (err.sqlState === '45000') {
      return res.status(409).json({ success: false, message: err.message });
    }
    // Duplicate rating (UNIQUE constraint)
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ success: false, message: 'You have already submitted a rating for this ride.' });
    }
    console.error('[submitRating]', err);
    return res.status(500).json({ success: false, message: 'Server error submitting rating.' });
  }
};

// ── GET /api/ratings/driver/:driver_id ───────────────────────
// Unchanged from original — returns rider→driver ratings for a driver
const getDriverRatings = async (req, res) => {
  const { driver_id } = req.params;
  try {
    const [rows] = await db.query(
      `SELECT rt.id, rt.rating, rt.comment, rt.rated_by, rt.created_at,
              u.name AS rider_name,
              r.pickup_location, r.dropoff_location, r.created_at AS ride_date
       FROM ratings rt
       JOIN users u ON u.id = rt.rider_id
       JOIN rides r ON r.id = rt.ride_id
       WHERE rt.driver_id = ? AND rt.rated_by = 'rider'
       ORDER BY rt.created_at DESC`,
      [driver_id]
    );
    return res.json({ success: true, ratings: rows });
  } catch (err) {
    console.error('[getDriverRatings]', err);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

// ── GET /api/ratings/ride/:ride_id ───────────────────────────
// Returns both directions of rating for a completed ride
const getRideRatings = async (req, res) => {
  const { ride_id } = req.params;
  try {
    const [rows] = await db.query(
      `SELECT rt.id, rt.rating, rt.comment, rt.rated_by, rt.rated_user,
              u_from.name AS rated_by_name,
              u_to.name   AS rated_user_name,
              rt.created_at
       FROM ratings rt
       JOIN users u_from ON u_from.id = IF(rt.rated_by = 'rider', rt.rider_id,
                                           (SELECT user_id FROM drivers WHERE id = rt.driver_id))
       LEFT JOIN users u_to ON u_to.id = rt.rated_user
       WHERE rt.ride_id = ?
       ORDER BY rt.rated_by ASC`,
      [ride_id]
    );
    return res.json({ success: true, ratings: rows });
  } catch (err) {
    console.error('[getRideRatings]', err);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

// ── GET /api/ratings/my ───────────────────────────────────────
// Ratings received by the logged-in user (as rider or driver)
const getMyRatings = async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT rt.id, rt.rating, rt.comment, rt.rated_by, rt.created_at,
              r.pickup_location, r.dropoff_location, r.created_at AS ride_date
       FROM ratings rt
       JOIN rides r ON r.id = rt.ride_id
       WHERE rt.rated_user = ?
       ORDER BY rt.created_at DESC`,
      [req.user.id]
    );
    return res.json({ success: true, ratings: rows });
  } catch (err) {
    console.error('[getMyRatings]', err);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

module.exports = { submitRating, getDriverRatings, getRideRatings, getMyRatings };
