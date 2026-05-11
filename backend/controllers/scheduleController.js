const db = require('../config/db');

// ── POST /api/rides/schedule ──────────────────────────────────
const scheduleRide = async (req, res) => {
  const { pickup_location, dropoff_location, distance_km, payment_method, scheduled_time } = req.body;
  const rider_id = req.user.id;

  if (!pickup_location || !dropoff_location || !distance_km || !scheduled_time) {
    return res.status(400).json({
      success: false,
      message: 'pickup_location, dropoff_location, distance_km, and scheduled_time are required.'
    });
  }

  const schedAt = new Date(scheduled_time);
  if (isNaN(schedAt.getTime()) || schedAt <= new Date()) {
    return res.status(400).json({ success: false, message: 'scheduled_time must be a future datetime.' });
  }

  try {
    // Check account status
    const [userRows] = await db.query(
      `SELECT account_status FROM users WHERE id = ?`,
      [rider_id]
    );
    if (!userRows.length || userRows[0].account_status !== 'active') {
      return res.status(403).json({ success: false, message: 'Account is not active.' });
    }

    const BASE_FARE    = parseFloat(process.env.BASE_FARE    || 2.50);
    const PER_KM_RATE  = parseFloat(process.env.PER_KM_RATE  || 1.20);
    const PER_MIN_RATE = parseFloat(process.env.PER_MIN_RATE || 0.25);
    const dist         = parseFloat(distance_km);
    const est_minutes  = Math.ceil(dist * 3);
    const fare         = (BASE_FARE + (dist * PER_KM_RATE) + (est_minutes * PER_MIN_RATE)).toFixed(2);

    const [result] = await db.query(
      `INSERT INTO rides
         (rider_id, pickup_location, dropoff_location, status,
          distance_km, duration_minutes, fare, surge_multiplier,
          scheduled_time, schedule_status)
       VALUES (?, ?, ?, 'requested', ?, ?, ?, 1.00, ?, 'pending')`,
      [rider_id, pickup_location, dropoff_location, dist, est_minutes, fare, schedAt]
    );
    const ride_id = result.insertId;

    // Auto-create payment record
    await db.query(
      `INSERT INTO payments (ride_id, amount, payment_method, status) VALUES (?, ?, ?, 'pending')`,
      [ride_id, fare, payment_method || 'cash']
    );

    const [rideRows] = await db.query(
      `SELECT r.*, u.name AS rider_name FROM rides r
       JOIN users u ON u.id = r.rider_id
       WHERE r.id = ?`,
      [ride_id]
    );

    return res.status(201).json({
      success: true,
      message: 'Ride scheduled successfully.',
      ride: rideRows[0]
    });
  } catch (err) {
    console.error('[scheduleRide]', err);
    return res.status(500).json({ success: false, message: 'Server error scheduling ride.' });
  }
};

// ── GET /api/rides/scheduled ──────────────────────────────────
// Returns all pending/confirmed scheduled rides for the logged-in rider
const getScheduledRides = async (req, res) => {
  try {
    let query, params;

    if (req.user.role === 'rider') {
      query = `
        SELECT r.*, p.amount, p.payment_method, p.status AS payment_status
        FROM rides r
        LEFT JOIN payments p ON p.ride_id = r.id
        WHERE r.rider_id = ?
          AND r.scheduled_time IS NOT NULL
          AND r.schedule_status IN ('pending','confirmed')
        ORDER BY r.scheduled_time ASC`;
      params = [req.user.id];

    } else if (req.user.role === 'driver') {
      const [dRows] = await db.query(
        'SELECT id FROM drivers WHERE user_id = ?',
        [req.user.id]
      );
      if (!dRows.length) return res.json({ success: true, rides: [] });

      query = `
        SELECT r.*, u.name AS rider_name, u.phone AS rider_phone,
               p.amount, p.payment_method
        FROM rides r
        JOIN users u ON u.id = r.rider_id
        LEFT JOIN payments p ON p.ride_id = r.id
        WHERE r.driver_id = ?
          AND r.scheduled_time IS NOT NULL
          AND r.schedule_status IN ('pending','confirmed')
        ORDER BY r.scheduled_time ASC`;
      params = [dRows[0].id];

    } else {
      // Admin: all scheduled rides
      query = `
        SELECT r.*, u.name AS rider_name,
               du.name AS driver_name,
               p.amount, p.status AS payment_status
        FROM rides r
        JOIN users u ON u.id = r.rider_id
        LEFT JOIN drivers d ON d.id = r.driver_id
        LEFT JOIN users du ON du.id = d.user_id
        LEFT JOIN payments p ON p.ride_id = r.id
        WHERE r.scheduled_time IS NOT NULL
        ORDER BY r.scheduled_time ASC`;
      params = [];
    }

    const [rides] = await db.query(query, params);
    return res.json({ success: true, rides });
  } catch (err) {
    console.error('[getScheduledRides]', err);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

// ── PATCH /api/rides/scheduled/:id/status ────────────────────
// Update schedule_status (rider can cancel; admin can confirm)
const updateScheduleStatus = async (req, res) => {
  const { id } = req.params;
  const { schedule_status } = req.body;

  const allowed = ['confirmed', 'cancelled'];
  if (!allowed.includes(schedule_status)) {
    return res.status(400).json({
      success: false,
      message: `schedule_status must be one of: ${allowed.join(', ')}`
    });
  }

  try {
    const [rideRows] = await db.query(
      `SELECT * FROM rides WHERE id = ? AND scheduled_time IS NOT NULL`,
      [id]
    );
    if (!rideRows.length) {
      return res.status(404).json({ success: false, message: 'Scheduled ride not found.' });
    }

    const ride = rideRows[0];

    // Riders can only cancel their own scheduled rides
    if (req.user.role === 'rider') {
      if (ride.rider_id !== req.user.id) {
        return res.status(403).json({ success: false, message: 'Access denied.' });
      }
      if (schedule_status !== 'cancelled') {
        return res.status(403).json({ success: false, message: 'Riders can only cancel scheduled rides.' });
      }
    }

    await db.query(
      `UPDATE rides SET schedule_status = ? WHERE id = ?`,
      [schedule_status, id]
    );

    // If cancelled → also cancel the ride itself and refund
    if (schedule_status === 'cancelled') {
      await db.query(`UPDATE rides SET status = 'cancelled' WHERE id = ?`, [id]);
      await db.query(`UPDATE payments SET status = 'refunded' WHERE ride_id = ?`, [id]);
    }

    return res.json({
      success: true,
      message: `Scheduled ride ${schedule_status}.`
    });
  } catch (err) {
    console.error('[updateScheduleStatus]', err);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

module.exports = { scheduleRide, getScheduledRides, updateScheduleStatus };
