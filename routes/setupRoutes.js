const express = require('express');
const router = express.Router();
const setupController = require('../controllers/setupController');

router.get('/', setupController.renderSetupPage);
router.post('/test-db', setupController.testDatabaseConnection);
router.post('/', setupController.processSetup);


module.exports = router;