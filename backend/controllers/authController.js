const bcrypt = require('bcryptjs');
const jwt    = require('jsonwebtoken');
const db     = require('../config/db');

// ── POST /api/auth/register ──────────────────────────────────
const register = async (req, res) => {
  const { name, email, password, phone, role } = req.body;

  if (!name || !email || !password || !role) {
    return res.status(400).json({ success: false, message: 'name, email, password, role are required.' });
  }
  const allowedRoles = ['rider', 'driver'];
  if (!allowedRoles.includes(role)) {
    return res.status(400).json({ success: false, message: 'Role must be rider or driver.' });
  }

  try {
    // Check duplicate email
    const [existing] = await db.query('SELECT id FROM users WHERE email = ?', [email]);
    if (existing.length > 0) {
      return res.status(409).json({ success: false, message: 'Email already registered.' });
    }
    
    const hashed = await bcrypt.hash(password, 10);
    
    const [result] = await db.query(
      'INSERT INTO users (name, email, password, phone, role) VALUES (?, ?, ?, ?, ?)',
      [name, email, hashed, phone || null, role]
    );
    const userId = result.insertId;

    // Auto-create driver record if registering as driver
    if (role === 'driver') {
      await db.query('INSERT INTO drivers (user_id) VALUES (?)', [userId]);
    }

    const token = jwt.sign(
      { id: userId, email, role },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );

    return res.status(201).json({
      success: true,
      message: 'Registration successful.',
      token,
      user: { id: userId, name, email, phone, role }
    });
  } catch (err) {
    console.error('[register]', err);
    return res.status(500).json({ success: false, message: 'Server error during registration.' });
  }
};

// ── POST /api/auth/login ─────────────────────────────────────
const login = async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ success: false, message: 'Email and password are required.' });
  }
  
  try {
    const [rows] = await db.query(
      'SELECT id, name, email, password, phone, role FROM users WHERE email = ?',
      [email]
    );
    if (rows.length === 0) {
      return res.status(401).json({ success: false, message: 'Invalid email or password.' });
    }

    const user = rows[0];
    const match = await bcrypt.compare(password, user.password);
    if (!match) {
      return res.status(401).json({ success: false, message: 'Invalid email or password.' });
    }

    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );

    return res.json({
      success: true,
      message: 'Login successful.',
      token,
      user: { id: user.id, name: user.name, email: user.email, phone: user.phone, role: user.role }
    });
  } catch (err) {
    console.error('[login]', err);
    return res.status(500).json({ success: false, message: 'Server error during login.' });
  }
};

// ── GET /api/auth/profile ────────────────────────────────────
const getProfile = async (req, res) => {
  try {
    const [rows] = await db.query(
      'SELECT id, name, email, phone, role, profile_pic, created_at FROM users WHERE id = ?',
      [req.user.id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }

    let profile = { ...rows[0] };

    // Attach driver info if applicable
    if (profile.role === 'driver') {
      const [driverRows] = await db.query(
        `SELECT d.id AS driver_id, d.license_number, d.is_online, d.is_verified,
                d.avg_rating, d.total_earnings, d.flagged,
                v.make, v.model, v.plate_number, v.color, v.vehicle_type, v.is_verified AS vehicle_verified
         FROM drivers d
         LEFT JOIN vehicles v ON v.driver_id = d.id
         WHERE d.user_id = ?`,
        [req.user.id]
      );
      profile.driver = driverRows[0] || null;
    }

    return res.json({ success: true, user: profile });
  } catch (err) {
    console.error('[getProfile]', err);
    return res.status(500).json({ success: false, message: 'Server error fetching profile.' });
  }
};

module.exports = { register, login, getProfile };
