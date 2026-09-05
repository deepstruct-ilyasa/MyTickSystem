const express = require('express');
const router = express.Router();
const unitController = require('../controllers/unitController');
const { isAuthenticated, hasRole } = require('../middlewares/authMiddleware');

router.get('/', isAuthenticated, hasRole(['superadmin', 'admin_cabang']), unitController.listUnits);
router.post('/create', isAuthenticated, hasRole(['superadmin', 'admin_cabang']), unitController.createUnit);
router.post('/delete/:id', isAuthenticated, hasRole(['superadmin', 'admin_cabang']), unitController.deleteUnit);

module.exports = router;