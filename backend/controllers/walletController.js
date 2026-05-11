const db = require('../config/db');

// ── GET /api/wallet/balance ───────────────────────────────────
const getBalance = async (req, res) => {
  try {
    // Ensure wallet row exists for user
    await db.query('INSERT IGNORE INTO wallets (user_id) VALUES (?)', [req.user.id]);

    const [rows] = await db.query(
      'SELECT id, balance, currency, updated_at FROM wallets WHERE user_id = ?',
      [req.user.id]
    );
    return res.json({ success: true, wallet: rows[0] });
  } catch (err) {
    console.error('[getBalance]', err);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

// ── POST /api/wallet/recharge ─────────────────────────────────
const recharge = async (req, res) => {
  const { amount } = req.body;
  if (!amount || parseFloat(amount) <= 0) {
    return res.status(400).json({ success: false, message: 'Valid amount is required.' });
  }

  try {
    await db.query('CALL sp_wallet_recharge(?, ?, ?)', [
      req.user.id,
      parseFloat(amount),
      `Recharge via API by user ${req.user.id}`
    ]);

    const [rows] = await db.query(
      'SELECT balance FROM wallets WHERE user_id = ?',
      [req.user.id]
    );
    return res.json({
      success: true,
      message: `Wallet recharged with $${parseFloat(amount).toFixed(2)}.`,
      new_balance: parseFloat(rows[0].balance)
    });
  } catch (err) {
    console.error('[recharge]', err);
    return res.status(500).json({ success: false, message: 'Server error during recharge.' });
  }
};

// ── GET /api/wallet/transactions ──────────────────────────────
const getTransactions = async (req, res) => {
  const { page = 1, limit = 20 } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(limit);

  try {
    // Get user wallet id
    const [wRows] = await db.query(
      'SELECT id FROM wallets WHERE user_id = ?',
      [req.user.id]
    );
    if (!wRows.length) return res.json({ success: true, transactions: [] });

    const [rows] = await db.query(
      `SELECT id, type, amount, balance_after, reference_type, reference_id, note, created_at
       FROM wallet_transactions
       WHERE wallet_type = 'user' AND wallet_id = ?
       ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      [wRows[0].id, parseInt(limit), offset]
    );
    return res.json({ success: true, transactions: rows });
  } catch (err) {
    console.error('[getTransactions]', err);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

// ── POST /api/wallet/pay ──────────────────────────────────────
// Debit wallet to pay for a pending ride
const walletPay = async (req, res) => {
  const { ride_id } = req.body;
  if (!ride_id) {
    return res.status(400).json({ success: false, message: 'ride_id is required.' });
  }

  try {
    // Verify ride belongs to this rider and has a pending payment
    const [rideRows] = await db.query(
      `SELECT r.fare FROM rides r
       JOIN payments p ON p.ride_id = r.id
       WHERE r.id = ? AND r.rider_id = ? AND p.status = 'pending'`,
      [ride_id, req.user.id]
    );
    if (!rideRows.length) {
      return res.status(404).json({ success: false, message: 'No pending payment found for this ride.' });
    }

    const amount = parseFloat(rideRows[0].fare);
    // Call stored procedure (handles atomicity + ledger insert)
    const [[result]] = await db.query(
      'CALL sp_wallet_pay(?, ?, ?, @success, @message); SELECT @success AS success, @message AS message;',
      [req.user.id, ride_id, amount]
    );

    // mysql2 returns multiple result sets; second set has OUT params
    const [outRows] = await db.query('SELECT @success AS success, @message AS message');
    const ok = outRows[0].success === 1;

    return res.status(ok ? 200 : 400).json({
      success: ok,
      message: outRows[0].message
    });
  } catch (err) {
    console.error('[walletPay]', err);
    return res.status(500).json({ success: false, message: 'Server error processing wallet payment.' });
  }
};

// ── GET /api/wallet/driver-balance ───────────────────────────
// Drivers only
const getDriverBalance = async (req, res) => {
  try {
    const [dRows] = await db.query(
      'SELECT id FROM drivers WHERE user_id = ?',
      [req.user.id]
    );
    if (!dRows.length) {
      return res.status(403).json({ success: false, message: 'Driver profile not found.' });
    }

    await db.query(
      'INSERT IGNORE INTO driver_wallets (driver_id) VALUES (?)',
      [dRows[0].id]
    );

    const [rows] = await db.query(
      `SELECT id, balance, pending_payout, total_withdrawn, currency, updated_at
       FROM driver_wallets WHERE driver_id = ?`,
      [dRows[0].id]
    );
    return res.json({ success: true, wallet: rows[0] });
  } catch (err) {
    console.error('[getDriverBalance]', err);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

// ── POST /api/wallet/driver-withdraw ─────────────────────────
const driverWithdraw = async (req, res) => {
  const { amount } = req.body;
  if (!amount || parseFloat(amount) <= 0) {
    return res.status(400).json({ success: false, message: 'Valid amount is required.' });
  }

  try {
    const [dRows] = await db.query(
      'SELECT id FROM drivers WHERE user_id = ?',
      [req.user.id]
    );
    if (!dRows.length) {
      return res.status(403).json({ success: false, message: 'Driver profile not found.' });
    }

    await db.query('CALL sp_driver_withdraw(?, ?, @success, @message)', [
      dRows[0].id,
      parseFloat(amount)
    ]);

    const [outRows] = await db.query(
      'SELECT @success AS success, @message AS message'
    );
    const ok = outRows[0].success === 1;

    return res.status(ok ? 200 : 400).json({
      success: ok,
      message: outRows[0].message
    });
  } catch (err) {
    console.error('[driverWithdraw]', err);
    return res.status(500).json({ success: false, message: 'Server error during withdrawal.' });
  }
};

// ── GET /api/wallet/driver-transactions ──────────────────────
const getDriverTransactions = async (req, res) => {
  const { page = 1, limit = 20 } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(limit);

  try {
    const [dRows] = await db.query(
      'SELECT id FROM drivers WHERE user_id = ?',
      [req.user.id]
    );
    if (!dRows.length) return res.json({ success: true, transactions: [] });

    const [dwRows] = await db.query(
      'SELECT id FROM driver_wallets WHERE driver_id = ?',
      [dRows[0].id]
    );
    if (!dwRows.length) return res.json({ success: true, transactions: [] });

    const [rows] = await db.query(
      `SELECT id, type, amount, balance_after, reference_type, reference_id, note, created_at
       FROM wallet_transactions
       WHERE wallet_type = 'driver' AND wallet_id = ?
       ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      [dwRows[0].id, parseInt(limit), offset]
    );
    return res.json({ success: true, transactions: rows });
  } catch (err) {
    console.error('[getDriverTransactions]', err);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

module.exports = {
  getBalance,
  recharge,
  getTransactions,
  walletPay,
  getDriverBalance,
  driverWithdraw,
  getDriverTransactions
};
