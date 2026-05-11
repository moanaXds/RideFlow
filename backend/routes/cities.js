const express    = require('express');
const router     = express.Router();
const { authenticate } = require('../middleware/auth');
const { authorize }    = require('../middleware/roleCheck');
const {
  getCities,
  getCitySurge,
  createCity,
  updateCity,
  getSurgeRules,
  createSurgeRule,
  updateSurgeRule
} = require('../controllers/cityController');

// Public (authenticated) — any role can read city list and surge
router.get('/',                        authenticate,                          getCities);
router.get('/:id/surge',               authenticate,                          getCitySurge);

// Admin-only city management
router.post('/',                       authenticate, authorize('admin'),       createCity);
router.patch('/:id',                   authenticate, authorize('admin'),       updateCity);

// Admin-only surge rule management
router.get('/:id/surge-rules',         authenticate, authorize('admin'),       getSurgeRules);
router.post('/:id/surge-rules',        authenticate, authorize('admin'),       createSurgeRule);
router.patch('/surge-rules/:rule_id',  authenticate, authorize('admin'),       updateSurgeRule);

module.exports = router;
