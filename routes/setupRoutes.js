const express = require('express');
const router = express.Router();
const setupController = require('../controllers/setupController');

// GET request untuk menampilkan form
router.get('/', setupController.renderSetupPage);

// POST request untuk memproses data form
router.post('/', setupController.processSetup);

module.exports = router;