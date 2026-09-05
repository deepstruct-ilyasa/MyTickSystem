const express = require('express');
const router = express.Router();
const profileController = require('../controllers/profileController');
const { isAuthenticated } = require('../middlewares/authMiddleware');
const upload = require('../middlewares/uploadMiddleware');

router.get('/', isAuthenticated, profileController.getProfile);
router.post('/update', isAuthenticated, profileController.updateProfile);
router.post('/update', isAuthenticated, upload.single('profile_picture'), profileController.updateProfile);

module.exports = router;