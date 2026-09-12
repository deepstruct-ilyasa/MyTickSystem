const express = require('express');
const router = express.Router();
const settingsController = require('../controllers/settingsController');
const { isAuthenticated, hasRole } = require('../middlewares/authMiddleware');

router.get('/', isAuthenticated, hasRole(['superadmin']), settingsController.getSettings);
router.post('/', isAuthenticated, hasRole(['superadmin']), settingsController.updateSettings);

module.exports = router;