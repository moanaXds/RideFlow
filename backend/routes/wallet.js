const express    = require('express');
const router     = express.Router();
const { authenticate } = require('../middleware/auth');
const {
  getBalance,
  recharge,
  getTransactions,
  walletPay,
  getDriverBalance,
  driverWithdraw,
  getDriverTransactions
} = require('../controllers/walletController');

// All wallet routes require authentication
router.use(authenticate);

// User wallet
router.get('/balance',               getBalance);
router.post('/recharge',             recharge);
router.get('/transactions',          getTransactions);
router.post('/pay',                  walletPay);

// Driver wallet (driver-role guard is enforced in controller)
router.get('/driver-balance',        getDriverBalance);
router.post('/driver-withdraw',      driverWithdraw);
router.get('/driver-transactions',   getDriverTransactions);

module.exports = router;
