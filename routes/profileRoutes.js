const express = require('express');
const router = express.Router();
const profileController = require('../controllers/profileController');
const { isAuthenticated } = require('../middlewares/authMiddleware');
const upload = require('../middlewares/uploadMiddleware');
const multer = require('multer');

router.get('/', isAuthenticated, profileController.getProfile);
router.post('/update', isAuthenticated, (req, res, next) => {
    upload.single('profile_picture')(req, res, function (err) {
        if (err instanceof multer.MulterError) {
            if (err.code === 'LIMIT_FILE_SIZE') {
                return res.status(400).json({ 
                    success: false, 
                    message: 'Ukuran file terlalu besar! Maksimal ukuran file adalah 2MB.' 
                });
            }
            return res.status(400).json({ success: false, message: err.message });
        } else if (err) {
            return res.status(400).json({ success: false, message: err.message });
        }
        next();
    });
}, profileController.updateProfile);

module.exports = router;