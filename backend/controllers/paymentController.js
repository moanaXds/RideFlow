const db = require('../config/db');

// ── GET /api/payments/ride/:ride_id ─────────────────────────
const getPaymentByRide = async (req, res) => {
  const { ride_id } = req.params;
  try {
    const [rows] = await db.query(
      `SELECT p.*, r.pickup_location, r.dropoff_location, r.distance_km, r.duration_minutes, r.fare
       FROM payments p
       JOIN rides r ON r.id = p.ride_id
       WHERE p.ride_id = ?`,
      [ride_id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Payment record not found.' });
    }
    return res.json({ success: true, payment: rows[0] });
  } catch (err) {
    console.error('[getPaymentByRide]', err);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

// ── POST /api/payments/apply-promo ──────────────────────────
const applyPromo = async (req, res) => {
  const { ride_id, promo_code } = req.body;
  if (!ride_id || !promo_code) {
    return res.status(400).json({ success: false, message: 'ride_id and promo_code are required.' });
  }

  try {
    // Validate promo code
    const [promoRows] = await db.query(
      `SELECT * FROM promo_codes
       WHERE code = ? AND is_active = 1 AND used_count < max_uses
         AND (expires_at IS NULL OR expires_at > NOW())`,
      [promo_code]
    );
    if (promoRows.length === 0) {
      return res.status(400).json({ success: false, message: 'Invalid or expired promo code.' });
    }

    const promo = promoRows[0];

    // Get payment record
    const [payRows] = await db.query(
      `SELECT * FROM payments WHERE ride_id = ? AND status = 'pending'`,
      [ride_id]
    );
    if (payRows.length === 0) {
      return res.status(404).json({ success: false, message: 'No pending payment found for this ride.' });
    }

    const payment = payRows[0];
    if (payment.promo_code) {
      return res.status(409).json({ success: false, message: 'Promo already applied.' });
    }

    const discount = ((payment.amount * promo.discount_percent) / 100).toFixed(2);
    const newAmount = (payment.amount - parseFloat(discount)).toFixed(2);

    await db.query(
      `UPDATE payments SET amount = ?, discount_amount = ?, promo_code = ? WHERE ride_id = ?`,
      [newAmount, discount, promo_code, ride_id]
    );

    // Increment promo usage
    await db.query(
      `UPDATE promo_codes SET used_count = used_count + 1 WHERE id = ?`,
      [promo.id]
    );

    return res.json({
      success: true,
      message: `Promo applied! You saved $${discount}.`,
      discount,
      new_amount: newAmount
    });
  } catch (err) {
    console.error('[applyPromo]', err);
    return res.status(500).json({ success: false, message: 'Server error applying promo.' });
  }
};

// ── GET /api/payments/history ────────────────────────────────
const getPaymentHistory = async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT p.*, r.pickup_location, r.dropoff_location, r.created_at AS ride_date,
              u.name AS rider_name
       FROM payments p
       JOIN rides r ON r.id = p.ride_id
       JOIN users u ON u.id = r.rider_id
       WHERE r.rider_id = ?
       ORDER BY p.created_at DESC`,
      [req.user.id]
    );
    return res.json({ success: true, payments: rows });
  } catch (err) {
    console.error('[getPaymentHistory]', err);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

// ── POST /api/payments/:id/complete ─────────────────────────
const completePayment = async (req, res) => {
  const { id } = req.params;
  const { payment_method } = req.body;
  try {
    const [rows] = await db.query(`SELECT * FROM payments WHERE id = ?`, [id]);
    if (!rows.length) return res.status(404).json({ success: false, message: 'Payment not found.' });
    if (rows[0].status === 'completed') return res.status(400).json({ success: false, message: 'Already completed.' });

    await db.query(
      `UPDATE payments SET status = 'completed', payment_method = COALESCE(?, payment_method) WHERE id = ?`,
      [payment_method || null, id]
    );
    return res.json({ success: true, message: 'Payment completed.' });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

module.exports = { getPaymentByRide, applyPromo, getPaymentHistory, completePayment };
