const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const { isAuthenticated, hasRole } = require('../middlewares/authMiddleware');
const uploadExcel = require('../middlewares/uploadExcelMiddleware');

// Akses melihat list (Superadmin, Admin Cabang, Manager, Supervisor)
router.get('/', isAuthenticated, hasRole(['superadmin', 'admin_cabang', 'manager', 'supervisor']), userController.listUsers);

// Akses modifikasi hanya untuk Superadmin & Admin Cabang
router.post('/create', isAuthenticated, hasRole(['superadmin', 'admin_cabang']), userController.createUser);
router.post('/update/:id', isAuthenticated, hasRole(['superadmin', 'admin_cabang']), userController.updateUser);
router.post('/delete/:id', isAuthenticated, hasRole(['superadmin', 'admin_cabang']), userController.deleteUser);
router.get('/template', isAuthenticated, hasRole(['superadmin', 'admin_cabang']), userController.downloadUserTemplate);
router.post('/import', isAuthenticated, hasRole(['superadmin', 'admin_cabang']), uploadExcel.single('file'), userController.bulkImportUsers);

module.exports = router;