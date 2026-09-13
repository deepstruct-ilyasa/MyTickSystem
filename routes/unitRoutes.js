const express = require('express');
const router = express.Router();
const unitController = require('../controllers/unitController');
const { isAuthenticated, hasRole } = require('../middlewares/authMiddleware');
const uploadExcel = require('../middlewares/uploadExcelMiddleware');

router.get('/', isAuthenticated, hasRole(['superadmin', 'admin_cabang']), unitController.listUnits);
router.post('/create', isAuthenticated, hasRole(['superadmin', 'admin_cabang']), unitController.createUnit);
router.post('/update/:id', isAuthenticated, hasRole(['superadmin', 'admin_cabang']), unitController.updateUnit);
router.post('/delete/:id', isAuthenticated, hasRole(['superadmin', 'admin_cabang']), unitController.deleteUnit);
router.post('/import', isAuthenticated, hasRole(['superadmin', 'admin_cabang']), uploadExcel.single('file'), unitController.bulkImportUnits);
router.get('/template', isAuthenticated, hasRole(['superadmin', 'admin_cabang']), unitController.downloadUnitTemplate);

module.exports = router;