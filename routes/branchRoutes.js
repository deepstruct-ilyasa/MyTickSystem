const express = require('express');
const router = express.Router();
const branchController = require('../controllers/branchController');
const { isAuthenticated, hasRole } = require('../middlewares/authMiddleware');

// Hanya superadmin dan admin_cabang yang boleh akses manajemen cabang
router.get('/', isAuthenticated, hasRole(['superadmin', 'admin_cabang']), branchController.listBranches);
router.post('/create', isAuthenticated, hasRole(['superadmin']), branchController.createBranch);
router.post('/update/:id', isAuthenticated, hasRole(['superadmin', 'admin_cabang']), branchController.updateBranch);
router.post('/delete/:id', isAuthenticated, hasRole(['superadmin']), branchController.deleteBranch);

module.exports = router;