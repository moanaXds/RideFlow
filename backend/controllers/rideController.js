const db = require('../config/db');

// ── POST /api/rides/request ──────────────────────────────────
const requestRide = async (req, res) => {
  const { pickup_location, dropoff_location, distance_km, payment_method } = req.body;
  const rider_id = req.user.id;

  if (!pickup_location || !dropoff_location || !distance_km) {
    return res.status(400).json({ success: false, message: 'pickup, dropoff, and distance_km are required.' });
  }

  try {
    // Check if rider already has an active ride
    const [active] = await db.query(
      `SELECT id FROM rides WHERE rider_id = ? AND status NOT IN ('completed','cancelled')`,
      [rider_id]
    );
    if (active.length > 0) {
      return res.status(409).json({ success: false, message: 'You already have an active ride.' });
    }

    // Auto-assign: find nearest available verified driver
    const [drivers] = await db.query(
      `SELECT d.id FROM drivers d
       INNER JOIN vehicles v ON v.driver_id = d.id
       WHERE d.is_online = 1 AND d.is_verified = 1 AND v.is_verified = 1 AND d.flagged = 0
       ORDER BY RAND() LIMIT 1`
    );

    const driver_id    = drivers.length > 0 ? drivers[0].id : null;
    const initial_status = driver_id ? 'accepted' : 'requested';

    // Fare calculation: base + (distance × perKm) + (duration × perMin) × surge
    const BASE_FARE    = parseFloat(process.env.BASE_FARE    || 2.50);
    const PER_KM_RATE  = parseFloat(process.env.PER_KM_RATE  || 1.20);
    const PER_MIN_RATE = parseFloat(process.env.PER_MIN_RATE || 0.25);
    const surge        = 1.0;
    const dist         = parseFloat(distance_km);
    const est_minutes  = Math.ceil(dist * 3); // rough estimate: 3 min/km
    const fare         = ((BASE_FARE + (dist * PER_KM_RATE) + (est_minutes * PER_MIN_RATE)) * surge).toFixed(2);

    const [result] = await db.query(
      `INSERT INTO rides
         (rider_id, driver_id, pickup_location, dropoff_location, status, distance_km, duration_minutes, fare, surge_multiplier)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [rider_id, driver_id, pickup_location, dropoff_location, initial_status, dist, est_minutes, fare, surge]
    );
    const ride_id = result.insertId;

    // Auto-create payment record
    await db.query(
      `INSERT INTO payments (ride_id, amount, payment_method, status) VALUES (?, ?, ?, 'pending')`,
      [ride_id, fare, payment_method || 'cash']
    );

    const [rideRows] = await db.query(
      `SELECT r.*, u.name AS rider_name,
              du.name AS driver_name, d.avg_rating AS driver_rating
       FROM rides r
       JOIN users u ON u.id = r.rider_id
       LEFT JOIN drivers d ON d.id = r.driver_id
       LEFT JOIN users du ON du.id = d.user_id
       WHERE r.id = ?`,
      [ride_id]
    );

    return res.status(201).json({ success: true, message: 'Ride requested.', ride: rideRows[0] });
  } catch (err) {
    console.error('[requestRide]', err);
    return res.status(500).json({ success: false, message: 'Server error requesting ride.' });
  }
};

// ── PATCH /api/rides/:id/status ──────────────────────────────
const updateRideStatus = async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  const validTransitions = {
    requested:   ['accepted', 'cancelled'],
    accepted:    ['en_route', 'cancelled'],
    en_route:    ['in_progress', 'cancelled'],
    in_progress: ['completed', 'cancelled'],
    completed:   [],
    cancelled:   []
  };

  try {
    const [rows] = await db.query('SELECT * FROM rides WHERE id = ?', [id]);
    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Ride not found.' });
    }

    const ride = rows[0];
    const allowed = validTransitions[ride.status] || [];
    if (!allowed.includes(status)) {
      return res.status(400).json({
        success: false,
        message: `Cannot transition from '${ride.status}' to '${status}'.`
      });
    }

    await db.query('UPDATE rides SET status = ? WHERE id = ?', [status, id]);

    // If completed → mark payment as completed
    if (status === 'completed') {
      await db.query(
        `UPDATE payments SET status = 'completed' WHERE ride_id = ?`,
        [id]
      );
      // Update driver earnings
      if (ride.driver_id) {
        await db.query(
          `UPDATE drivers SET total_earnings = total_earnings + ? WHERE id = ?`,
          [ride.fare || 0, ride.driver_id]
        );
      }
    }

    return res.json({ success: true, message: `Ride status updated to '${status}'.` });
  } catch (err) {
    console.error('[updateRideStatus]', err);
    return res.status(500).json({ success: false, message: 'Server error updating ride status.' });
  }
};

// ── GET /api/rides/history ───────────────────────────────────
const getRideHistory = async (req, res) => {
  const user = req.user;

  try {
    let query, params;

    if (user.role === 'rider') {
      query = `
        SELECT r.*, u.name AS rider_name,
               du.name AS driver_name, d.avg_rating AS driver_rating,
               p.amount, p.payment_method, p.status AS payment_status, p.discount_amount,
               rt.rating, rt.comment
        FROM rides r
        JOIN users u ON u.id = r.rider_id
        LEFT JOIN drivers d ON d.id = r.driver_id
        LEFT JOIN users du ON du.id = d.user_id
        LEFT JOIN payments p ON p.ride_id = r.id
        LEFT JOIN ratings rt ON rt.ride_id = r.id
        WHERE r.rider_id = ?
        ORDER BY r.created_at DESC`;
      params = [user.id];
    } else if (user.role === 'driver') {
      const [driverRows] = await db.query('SELECT id FROM drivers WHERE user_id = ?', [user.id]);
      if (driverRows.length === 0) return res.json({ success: true, rides: [] });
      query = `
        SELECT r.*, u.name AS rider_name,
               p.amount, p.payment_method, p.status AS payment_status,
               rt.rating, rt.comment
        FROM rides r
        JOIN users u ON u.id = r.rider_id
        LEFT JOIN payments p ON p.ride_id = r.id
        LEFT JOIN ratings rt ON rt.ride_id = r.id
        WHERE r.driver_id = ?
        ORDER BY r.created_at DESC`;
      params = [driverRows[0].id];
    } else {
      query = `
        SELECT r.*, u.name AS rider_name,
               du.name AS driver_name,
               p.amount, p.payment_method, p.status AS payment_status
        FROM rides r
        JOIN users u ON u.id = r.rider_id
        LEFT JOIN drivers d ON d.id = r.driver_id
        LEFT JOIN users du ON du.id = d.user_id
        LEFT JOIN payments p ON p.ride_id = r.id
        ORDER BY r.created_at DESC LIMIT 100`;
      params = [];
    }

    const [rides] = await db.query(query, params);
    return res.json({ success: true, rides });
  } catch (err) {
    console.error('[getRideHistory]', err);
    return res.status(500).json({ success: false, message: 'Server error fetching ride history.' });
  }
};

// ── GET /api/rides/active ────────────────────────────────────
const getActiveRide = async (req, res) => {
  try {
    let query, params;
    if (req.user.role === 'rider') {
      query = `
        SELECT r.*, du.name AS driver_name, d.avg_rating AS driver_rating,
               d.is_online, v.make, v.model, v.plate_number, v.color
        FROM rides r
        LEFT JOIN drivers d ON d.id = r.driver_id
        LEFT JOIN users du ON du.id = d.user_id
        LEFT JOIN vehicles v ON v.driver_id = d.id
        WHERE r.rider_id = ? AND r.status NOT IN ('completed','cancelled')
        ORDER BY r.created_at DESC LIMIT 1`;
      params = [req.user.id];
    } else {
      const [dr] = await db.query('SELECT id FROM drivers WHERE user_id = ?', [req.user.id]);
      if (!dr.length) return res.json({ success: true, ride: null });
      query = `
        SELECT r.*, u.name AS rider_name, u.phone AS rider_phone
        FROM rides r
        JOIN users u ON u.id = r.rider_id
        WHERE r.driver_id = ? AND r.status NOT IN ('completed','cancelled')
        ORDER BY r.created_at DESC LIMIT 1`;
      params = [dr[0].id];
    }

    const [rows] = await db.query(query, params);
    return res.json({ success: true, ride: rows[0] || null });
  } catch (err) {
    console.error('[getActiveRide]', err);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

// ── POST /api/rides/:id/cancel ───────────────────────────────
const cancelRide = async (req, res) => {
  const { id } = req.params;
  try {
    const [rows] = await db.query(
      `SELECT * FROM rides WHERE id = ? AND rider_id = ? AND status IN ('requested','accepted')`,
      [id, req.user.id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Ride not found or cannot be cancelled.' });
    }
    await db.query(`UPDATE rides SET status = 'cancelled' WHERE id = ?`, [id]);
    await db.query(`UPDATE payments SET status = 'refunded' WHERE ride_id = ?`, [id]);
    return res.json({ success: true, message: 'Ride cancelled.' });
  } catch (err) {
    console.error('[cancelRide]', err);
    return res.status(500).json({ success: false, message: 'Server error cancelling ride.' });
  }
};

module.exports = { requestRide, updateRideStatus, getRideHistory, getActiveRide, cancelRide };
