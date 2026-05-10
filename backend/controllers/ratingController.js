const db = require('../config/db');

const RATING_THRESHOLD = parseFloat(process.env.DRIVER_RATING_THRESHOLD || 3.5);

// ── POST /api/ratings ────────────────────────────────────────
const submitRating = async (req, res) => {
  const { ride_id, rating, comment } = req.body;
  const rider_id = req.user.id;

  if (!ride_id || !rating) {
    return res.status(400).json({ success: false, message: 'ride_id and rating are required.' });
  }
  if (rating < 1 || rating > 5) {
    return res.status(400).json({ success: false, message: 'Rating must be between 1 and 5.' });
  }

  try {
    // Verify ride is completed and belongs to this rider
    const [rideRows] = await db.query(
      `SELECT * FROM rides WHERE id = ? AND rider_id = ? AND status = 'completed'`,
      [ride_id, rider_id]
    );
    if (rideRows.length === 0) {
      return res.status(404).json({ success: false, message: 'Completed ride not found for this user.' });
    }

    const ride = rideRows[0];
    if (!ride.driver_id) {
      return res.status(400).json({ success: false, message: 'No driver assigned to this ride.' });
    }

    // Check if already rated
    const [existing] = await db.query(`SELECT id FROM ratings WHERE ride_id = ?`, [ride_id]);
    if (existing.length > 0) {
      return res.status(409).json({ success: false, message: 'You have already rated this ride.' });
    }

    // Insert rating
    await db.query(
      `INSERT INTO ratings (ride_id, rider_id, driver_id, rating, comment) VALUES (?, ?, ?, ?, ?)`,
      [ride_id, rider_id, ride.driver_id, rating, comment || null]
    );

    // Recalculate driver average rating
    const [avgRows] = await db.query(
      `SELECT AVG(rating) AS avg_rating, COUNT(*) AS total_ratings
       FROM ratings WHERE driver_id = ?`,
      [ride.driver_id]
    );

    const avgRating   = parseFloat(avgRows[0].avg_rating).toFixed(2);
    const shouldFlag  = parseFloat(avgRating) < RATING_THRESHOLD;

    await db.query(
      `UPDATE drivers SET avg_rating = ?, flagged = ? WHERE id = ?`,
      [avgRating, shouldFlag ? 1 : 0, ride.driver_id]
    );

    return res.status(201).json({
      success: true,
      message: 'Rating submitted.',
      avg_rating: avgRating,
      driver_flagged: shouldFlag
    });
  } catch (err) {
    console.error('[submitRating]', err);
    return res.status(500).json({ success: false, message: 'Server error submitting rating.' });
  }
};

// ── GET /api/ratings/driver/:driver_id ───────────────────────
const getDriverRatings = async (req, res) => {
  const { driver_id } = req.params;
  try {
    const [rows] = await db.query(
      `SELECT rt.*, u.name AS rider_name,
              r.pickup_location, r.dropoff_location, r.created_at AS ride_date
       FROM ratings rt
       JOIN users u ON u.id = rt.rider_id
       JOIN rides r ON r.id = rt.ride_id
       WHERE rt.driver_id = ?
       ORDER BY rt.created_at DESC`,
      [driver_id]
    );
    return res.json({ success: true, ratings: rows });
  } catch (err) {
    console.error('[getDriverRatings]', err);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

module.exports = { submitRating, getDriverRatings };
