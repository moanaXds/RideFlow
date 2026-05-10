const db = require('../config/db');

// ── GET /api/driver/pending-rides ────────────────────────────
const getPendingRides = async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT r.*, u.name AS rider_name, u.phone AS rider_phone
       FROM rides r
       JOIN users u ON u.id = r.rider_id
       WHERE r.status = 'requested' AND r.driver_id IS NULL
       ORDER BY r.created_at ASC`
    );
    return res.json({ success: true, rides: rows });
  } catch (err) {
    console.error('[getPendingRides]', err);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

// ── POST /api/driver/rides/:id/accept ────────────────────────
const acceptRide = async (req, res) => {
  const { id } = req.params;
  try {
    const [driverRows] = await db.query(
      `SELECT d.id, d.is_online, d.is_verified, d.flagged, v.is_verified AS v_verified
       FROM drivers d
       LEFT JOIN vehicles v ON v.driver_id = d.id
       WHERE d.user_id = ?`,
      [req.user.id]
    );

    if (driverRows.length === 0) {
      return res.status(404).json({ success: false, message: 'Driver profile not found.' });
    }
    const driver = driverRows[0];

    if (!driver.is_online)    return res.status(400).json({ success: false, message: 'Go online before accepting rides.' });
    if (!driver.is_verified)  return res.status(403).json({ success: false, message: 'Driver not verified.' });
    if (!driver.v_verified)   return res.status(403).json({ success: false, message: 'Vehicle not verified.' });
    if (driver.flagged)       return res.status(403).json({ success: false, message: 'Account flagged by admin.' });

    const [rideRows] = await db.query(
      `SELECT * FROM rides WHERE id = ? AND status = 'requested'`,
      [id]
    );
    if (rideRows.length === 0) {
      return res.status(404).json({ success: false, message: 'Ride no longer available.' });
    }

    await db.query(
      `UPDATE rides SET driver_id = ?, status = 'accepted' WHERE id = ?`,
      [driver.id, id]
    );

    return res.json({ success: true, message: 'Ride accepted.' });
  } catch (err) {
    console.error('[acceptRide]', err);
    return res.status(500).json({ success: false, message: 'Server error accepting ride.' });
  }
};

// ── POST /api/driver/rides/:id/reject ────────────────────────
const rejectRide = async (req, res) => {
  const { id } = req.params;
  try {
    // Simply do not assign — ride stays 'requested' for another driver
    return res.json({ success: true, message: 'Ride rejected. It remains open for other drivers.' });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

// ── PATCH /api/driver/availability ──────────────────────────
const toggleAvailability = async (req, res) => {
  const { is_online } = req.body;
  if (typeof is_online !== 'boolean') {
    return res.status(400).json({ success: false, message: 'is_online (boolean) is required.' });
  }
  try {
    const [result] = await db.query(
      `UPDATE drivers SET is_online = ? WHERE user_id = ?`,
      [is_online ? 1 : 0, req.user.id]
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: 'Driver profile not found.' });
    }
    return res.json({ success: true, message: `You are now ${is_online ? 'online' : 'offline'}.`, is_online });
  } catch (err) {
    console.error('[toggleAvailability]', err);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

// ── GET /api/driver/earnings ─────────────────────────────────
const getEarnings = async (req, res) => {
  try {
    const [driverRows] = await db.query(
      `SELECT d.id, d.total_earnings, d.avg_rating
       FROM drivers d WHERE d.user_id = ?`,
      [req.user.id]
    );
    if (driverRows.length === 0) {
      return res.status(404).json({ success: false, message: 'Driver not found.' });
    }

    const driver = driverRows[0];

    const [weekly] = await db.query(
      `SELECT COALESCE(SUM(p.amount), 0) AS week_earnings,
              COUNT(r.id) AS week_rides
       FROM rides r
       JOIN payments p ON p.ride_id = r.id
       WHERE r.driver_id = ? AND r.status = 'completed'
         AND r.created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)`,
      [driver.id]
    );

    const [today] = await db.query(
      `SELECT COALESCE(SUM(p.amount), 0) AS today_earnings,
              COUNT(r.id) AS today_rides
       FROM rides r
       JOIN payments p ON p.ride_id = r.id
       WHERE r.driver_id = ? AND r.status = 'completed'
         AND DATE(r.created_at) = CURDATE()`,
      [driver.id]
    );

    return res.json({
      success: true,
      earnings: {
        total:         parseFloat(driver.total_earnings),
        avg_rating:    parseFloat(driver.avg_rating),
        week_earnings: parseFloat(weekly[0].week_earnings),
        week_rides:    weekly[0].week_rides,
        today_earnings: parseFloat(today[0].today_earnings),
        today_rides:   today[0].today_rides
      }
    });
  } catch (err) {
    console.error('[getEarnings]', err);
    return res.status(500).json({ success: false, message: 'Server error fetching earnings.' });
  }
};

// ── POST /api/driver/vehicle ─────────────────────────────────
const registerVehicle = async (req, res) => {
  const { make, model, plate_number, color, vehicle_type } = req.body;
  if (!make || !model || !plate_number) {
    return res.status(400).json({ success: false, message: 'make, model, plate_number required.' });
  }
  try {
    const [driverRows] = await db.query('SELECT id FROM drivers WHERE user_id = ?', [req.user.id]);
    if (driverRows.length === 0) {
      return res.status(404).json({ success: false, message: 'Driver profile not found.' });
    }
    const driver_id = driverRows[0].id;

    const [existing] = await db.query('SELECT id FROM vehicles WHERE plate_number = ?', [plate_number]);
    if (existing.length > 0) {
      return res.status(409).json({ success: false, message: 'Plate number already registered.' });
    }

    const [result] = await db.query(
      `INSERT INTO vehicles (driver_id, make, model, plate_number, color, vehicle_type) VALUES (?, ?, ?, ?, ?, ?)`,
      [driver_id, make, model, plate_number, color || null, vehicle_type || 'economy']
    );

    // Link vehicle to driver record
    await db.query(`UPDATE drivers SET license_number = COALESCE(license_number, 'PENDING') WHERE id = ?`, [driver_id]);

    return res.status(201).json({ success: true, message: 'Vehicle registered. Awaiting admin verification.', vehicle_id: result.insertId });
  } catch (err) {
    console.error('[registerVehicle]', err);
    return res.status(500).json({ success: false, message: 'Server error registering vehicle.' });
  }
};

// ── PATCH /api/driver/rides/:id/status ──────────────────────
const updateRideStatusByDriver = async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;
  try {
    const [driverRows] = await db.query('SELECT id FROM drivers WHERE user_id = ?', [req.user.id]);
    if (!driverRows.length) return res.status(404).json({ success: false, message: 'Driver not found.' });

    const validStatuses = ['en_route', 'in_progress', 'completed', 'cancelled'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid status.' });
    }

    const [rideRows] = await db.query(
      `SELECT * FROM rides WHERE id = ? AND driver_id = ?`,
      [id, driverRows[0].id]
    );
    if (!rideRows.length) return res.status(404).json({ success: false, message: 'Ride not found.' });

    const transitions = {
      accepted: ['en_route', 'cancelled'],
      en_route: ['in_progress', 'cancelled'],
      in_progress: ['completed', 'cancelled']
    };
    if (!(transitions[rideRows[0].status] || []).includes(status)) {
      return res.status(400).json({ success: false, message: `Cannot go from ${rideRows[0].status} to ${status}.` });
    }

    await db.query('UPDATE rides SET status = ? WHERE id = ?', [status, id]);

    if (status === 'completed') {
      await db.query(`UPDATE payments SET status = 'completed' WHERE ride_id = ?`, [id]);
      await db.query(`UPDATE drivers SET total_earnings = total_earnings + ? WHERE id = ?`,
        [rideRows[0].fare || 0, driverRows[0].id]);
    }

    return res.json({ success: true, message: `Ride updated to ${status}.` });
  } catch (err) {
    console.error('[updateRideStatusByDriver]', err);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

module.exports = {
  getPendingRides,
  acceptRide,
  rejectRide,
  toggleAvailability,
  getEarnings,
  registerVehicle,
  updateRideStatusByDriver
};
