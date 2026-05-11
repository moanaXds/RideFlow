const db = require('../config/db');

// ── GET /api/cities ───────────────────────────────────────────
const getCities = async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT id, name, country_code, timezone, is_active,
              base_fare, per_km_rate, per_min_rate
       FROM cities WHERE is_active = 1
       ORDER BY name ASC`
    );
    return res.json({ success: true, cities: rows });
  } catch (err) {
    console.error('[getCities]', err);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

// ── GET /api/cities/:id/surge ─────────────────────────────────
// Returns active surge multiplier for a city right now
const getCitySurge = async (req, res) => {
  const { id } = req.params;
  try {
    const [rows] = await db.query(
      `SELECT surge_multiplier, reasons FROM vw_active_surge WHERE city_id = ?`,
      [id]
    );

    const surge = rows.length > 0 ? parseFloat(rows[0].surge_multiplier) : 1.00;
    const reasons = rows.length > 0 ? rows[0].reasons : null;

    return res.json({
      success: true,
      city_id: parseInt(id),
      surge_multiplier: surge,
      reasons
    });
  } catch (err) {
    console.error('[getCitySurge]', err);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

// ── POST /api/cities (admin only) ────────────────────────────
const createCity = async (req, res) => {
  const { name, country_code, timezone, base_fare, per_km_rate, per_min_rate } = req.body;
  if (!name) {
    return res.status(400).json({ success: false, message: 'City name is required.' });
  }
  try {
    const [result] = await db.query(
      `INSERT INTO cities (name, country_code, timezone, base_fare, per_km_rate, per_min_rate)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        name,
        country_code || 'US',
        timezone || 'UTC',
        base_fare   || null,
        per_km_rate || null,
        per_min_rate|| null
      ]
    );
    return res.status(201).json({ success: true, message: 'City created.', city_id: result.insertId });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ success: false, message: 'City already exists.' });
    }
    console.error('[createCity]', err);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

// ── PATCH /api/cities/:id (admin only) ───────────────────────
const updateCity = async (req, res) => {
  const { id } = req.params;
  const { name, country_code, timezone, is_active, base_fare, per_km_rate, per_min_rate } = req.body;
  try {
    const fields = [];
    const params = [];

    if (name         !== undefined) { fields.push('name = ?');          params.push(name); }
    if (country_code !== undefined) { fields.push('country_code = ?');  params.push(country_code); }
    if (timezone     !== undefined) { fields.push('timezone = ?');      params.push(timezone); }
    if (is_active    !== undefined) { fields.push('is_active = ?');     params.push(is_active ? 1 : 0); }
    if (base_fare    !== undefined) { fields.push('base_fare = ?');     params.push(base_fare); }
    if (per_km_rate  !== undefined) { fields.push('per_km_rate = ?');   params.push(per_km_rate); }
    if (per_min_rate !== undefined) { fields.push('per_min_rate = ?');  params.push(per_min_rate); }

    if (!fields.length) {
      return res.status(400).json({ success: false, message: 'No fields to update.' });
    }
    params.push(id);
    await db.query(`UPDATE cities SET ${fields.join(', ')} WHERE id = ?`, params);
    return res.json({ success: true, message: 'City updated.' });
  } catch (err) {
    console.error('[updateCity]', err);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

// ── GET /api/cities/:id/surge-rules (admin) ───────────────────
const getSurgeRules = async (req, res) => {
  const { id } = req.params;
  try {
    const [rows] = await db.query(
      `SELECT id, multiplier, starts_at, ends_at, days_of_week, is_active, reason, created_at
       FROM surge_pricing WHERE city_id = ?
       ORDER BY multiplier DESC`,
      [id]
    );
    return res.json({ success: true, surge_rules: rows });
  } catch (err) {
    console.error('[getSurgeRules]', err);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

// ── POST /api/cities/:id/surge-rules (admin) ─────────────────
const createSurgeRule = async (req, res) => {
  const { id } = req.params;
  const { multiplier, starts_at, ends_at, days_of_week, reason } = req.body;

  if (!multiplier || parseFloat(multiplier) < 1.0) {
    return res.status(400).json({ success: false, message: 'multiplier >= 1.0 is required.' });
  }
  try {
    const [result] = await db.query(
      `INSERT INTO surge_pricing
         (city_id, multiplier, starts_at, ends_at, days_of_week, reason)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [id, parseFloat(multiplier), starts_at || null, ends_at || null, days_of_week || null, reason || null]
    );
    return res.status(201).json({ success: true, message: 'Surge rule created.', rule_id: result.insertId });
  } catch (err) {
    console.error('[createSurgeRule]', err);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

// ── PATCH /api/cities/surge-rules/:rule_id (admin) ───────────
const updateSurgeRule = async (req, res) => {
  const { rule_id } = req.params;
  const { multiplier, starts_at, ends_at, days_of_week, reason, is_active } = req.body;
  try {
    const fields = [];
    const params = [];

    if (multiplier   !== undefined) { fields.push('multiplier = ?');    params.push(parseFloat(multiplier)); }
    if (starts_at    !== undefined) { fields.push('starts_at = ?');     params.push(starts_at); }
    if (ends_at      !== undefined) { fields.push('ends_at = ?');       params.push(ends_at); }
    if (days_of_week !== undefined) { fields.push('days_of_week = ?');  params.push(days_of_week); }
    if (reason       !== undefined) { fields.push('reason = ?');        params.push(reason); }
    if (is_active    !== undefined) { fields.push('is_active = ?');     params.push(is_active ? 1 : 0); }

    if (!fields.length) {
      return res.status(400).json({ success: false, message: 'No fields to update.' });
    }
    params.push(rule_id);
    await db.query(`UPDATE surge_pricing SET ${fields.join(', ')} WHERE id = ?`, params);
    return res.json({ success: true, message: 'Surge rule updated.' });
  } catch (err) {
    console.error('[updateSurgeRule]', err);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

module.exports = {
  getCities,
  getCitySurge,
  createCity,
  updateCity,
  getSurgeRules,
  createSurgeRule,
  updateSurgeRule
};
