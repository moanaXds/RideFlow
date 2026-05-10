const express  = require('express');
const router   = express.Router();
const { getPaymentByRide, applyPromo, getPaymentHistory, completePayment } = require('../controllers/paymentController');
const { authenticate } = require('../middleware/auth');

router.use(authenticate);

// GET  /api/payments/history               — payment history for rider
router.get('/history', getPaymentHistory);

// GET  /api/payments/ride/:ride_id         — get payment for specific ride
router.get('/ride/:ride_id', getPaymentByRide);

// POST /api/payments/apply-promo           — apply a promo code
router.post('/apply-promo', applyPromo);

// POST /api/payments/:id/complete          — mark payment as completed
router.post('/:id/complete', completePayment);

module.exports = router;
