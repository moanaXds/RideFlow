const db = require('../config/db');

// ── GET /api/admin/analytics ─────────────────────────────────
const getAnalytics = async (req, res) => {
  try {
    const [[totals]] = await db.query(`
      SELECT
        (SELECT COUNT(*) FROM users WHERE role = 'rider')    AS total_riders,
        (SELECT COUNT(*) FROM users WHERE role = 'driver')   AS total_drivers,
        (SELECT COUNT(*) FROM rides)                          AS total_rides,
        (SELECT COUNT(*) FROM rides WHERE status='completed') AS completed_rides,
        (SELECT COUNT(*) FROM rides WHERE status='cancelled') AS cancelled_rides,
        (SELECT COALESCE(SUM(amount),0) FROM payments WHERE status='completed') AS total_revenue,
        (SELECT COUNT(*) FROM drivers WHERE flagged=1)        AS flagged_drivers,
        (SELECT COUNT(*) FROM drivers WHERE is_verified=1)   AS verified_drivers
    `);

    const [revenueByDay] = await db.query(`
      SELECT DATE(p.created_at) AS date, SUM(p.amount) AS revenue, COUNT(*) AS rides
      FROM payments p WHERE p.status = 'completed'
        AND p.created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)
      GROUP BY DATE(p.created_at) ORDER BY date ASC
    `);

    return res.json({ success: true, analytics: totals, revenue_by_day: revenueByDay });
  } catch (err) {
    console.error('[getAnalytics]', err);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

// ── GET /api/admin/users ─────────────────────────────────────
const getAllUsers = async (req, res) => {
  const { role, page = 1, limit = 20 } = req.query;
  const offset = (page - 1) * limit;

  try {
    let query = `SELECT id, name, email, phone, role, created_at FROM users`;
    const params = [];
    if (role) { query += ` WHERE role = ?`; params.push(role); }
    query += ` ORDER BY created_at DESC LIMIT ? OFFSET ?`;
    params.push(parseInt(limit), parseInt(offset));

    const [rows] = await db.query(query, params);
    const [[{ total }]] = await db.query(
      `SELECT COUNT(*) AS total FROM users${role ? ' WHERE role = ?' : ''}`,
      role ? [role] : []
    );
    return res.json({ success: true, users: rows, total, page: parseInt(page) });
  } catch (err) {
    console.error('[getAllUsers]', err);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

// ── GET /api/admin/drivers ───────────────────────────────────
const getAllDrivers = async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT d.id AS driver_id, u.id AS user_id, u.name, u.email, u.phone,
             d.license_number, d.is_online, d.is_verified, d.avg_rating,
             d.total_earnings, d.flagged,
             v.make, v.model, v.plate_number, v.color, v.vehicle_type,
             v.is_verified AS vehicle_verified, v.id AS vehicle_id
      FROM drivers d
      JOIN users u ON u.id = d.user_id
      LEFT JOIN vehicles v ON v.driver_id = d.id
      ORDER BY d.created_at DESC
    `);
    return res.json({ success: true, drivers: rows });
  } catch (err) {
    console.error('[getAllDrivers]', err);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

// ── PATCH /api/admin/drivers/:id/verify ─────────────────────
const verifyDriver = async (req, res) => {
  const { id } = req.params; // driver.id
  const { is_verified, license_number } = req.body;
  try {
    const updates = [];
    const params  = [];
    if (typeof is_verified === 'boolean') { updates.push('is_verified = ?'); params.push(is_verified ? 1 : 0); }
    if (license_number) { updates.push('license_number = ?'); params.push(license_number); }
    if (!updates.length) return res.status(400).json({ success: false, message: 'No fields to update.' });

    params.push(id);
    await db.query(`UPDATE drivers SET ${updates.join(', ')} WHERE id = ?`, params);
    return res.json({ success: true, message: 'Driver updated.' });
  } catch (err) {
    console.error('[verifyDriver]', err);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

// ── PATCH /api/admin/vehicles/:id/verify ────────────────────
const verifyVehicle = async (req, res) => {
  const { id } = req.params;
  const { is_verified } = req.body;
  try {
    await db.query(`UPDATE vehicles SET is_verified = ? WHERE id = ?`, [is_verified ? 1 : 0, id]);
    return res.json({ success: true, message: 'Vehicle verification updated.' });
  } catch (err) {
    console.error('[verifyVehicle]', err);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

// ── PATCH /api/admin/drivers/:id/flag ───────────────────────
const flagDriver = async (req, res) => {
  const { id } = req.params;
  const { flagged } = req.body;
  try {
    await db.query(`UPDATE drivers SET flagged = ? WHERE id = ?`, [flagged ? 1 : 0, id]);
    return res.json({ success: true, message: `Driver ${flagged ? 'flagged' : 'unflagged'}.` });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

// ── GET /api/admin/rides ─────────────────────────────────────
const getAllRides = async (req, res) => {
  const { status, page = 1, limit = 20 } = req.query;
  const offset = (page - 1) * limit;
  try {
    let where = '';
    const params = [];
    if (status) { where = 'WHERE r.status = ?'; params.push(status); }
    params.push(parseInt(limit), parseInt(offset));

    const [rows] = await db.query(`
      SELECT r.*, u.name AS rider_name,
             du.name AS driver_name,
             p.amount, p.payment_method, p.status AS payment_status
      FROM rides r
      JOIN users u ON u.id = r.rider_id
      LEFT JOIN drivers d ON d.id = r.driver_id
      LEFT JOIN users du ON du.id = d.user_id
      LEFT JOIN payments p ON p.ride_id = r.id
      ${where}
      ORDER BY r.created_at DESC LIMIT ? OFFSET ?
    `, params);

    return res.json({ success: true, rides: rows });
  } catch (err) {
    console.error('[getAllRides]', err);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

module.exports = { getAnalytics, getAllUsers, getAllDrivers, verifyDriver, verifyVehicle, flagDriver, getAllRides };
