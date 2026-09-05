const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const { isAuthenticated, hasRole } = require('../middlewares/authMiddleware');

// Akses melihat list (Superadmin, Admin Cabang, Manager, Supervisor)
router.get('/', isAuthenticated, hasRole(['superadmin', 'admin_cabang', 'manager', 'supervisor']), userController.listUsers);

// Perluas hak akses create, update, delete untuk Manager & Supervisor
router.post('/create', isAuthenticated, hasRole(['superadmin', 'admin_cabang', 'manager', 'supervisor']), userController.createUser);
router.post('/update/:id', isAuthenticated, hasRole(['superadmin', 'admin_cabang', 'manager', 'supervisor']), userController.updateUser);
router.post('/delete/:id', isAuthenticated, hasRole(['superadmin', 'admin_cabang', 'manager', 'supervisor']), userController.deleteUser);
router.post('/reset-password/:id', isAuthenticated, hasRole(['superadmin', 'admin_cabang']), userController.resetPassword);

module.exports = router;