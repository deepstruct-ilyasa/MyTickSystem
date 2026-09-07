const express = require('express');
const router = express.Router();
const DashboardController = require('../controllers/DashboardController');
const { isAuthenticated } = require('../middlewares/authMiddleware');


router.get('/dashboard/api/filter-options', isAuthenticated, DashboardController.getFilterOptions);

// Rute utama dashboard (menggunakan controller terpisah)
router.get('/', isAuthenticated, DashboardController.index);
router.get('/dashboard', isAuthenticated, DashboardController.index);

module.exports = router; // <-- Harus mengekspor router!