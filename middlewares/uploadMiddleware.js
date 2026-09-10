const multer = require('multer');
const path = require('path');

// Gunakan memoryStorage agar file diproses dulu di RAM oleh Sharp
const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
        cb(null, true);
    } else {
        cb(new Error('Hanya file gambar yang diperbolehkan!'), false);
    }
};

const upload = multer({ 
    storage: storage, 
    fileFilter: fileFilter, 
    limits: { fileSize: 20 * 1024 * 1024 } 
});

module.exports = upload;