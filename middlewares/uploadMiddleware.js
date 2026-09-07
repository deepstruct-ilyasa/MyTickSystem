const multer = require('multer');
const path = require('path');
const fs = require('fs');

const uploadDir = 'public/uploads/profile';
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const nip = req.session.user && req.session.user.nip ? req.session.user.nip : 'unknown';
        const branchCode = req.session.user && req.session.user.branch_code ? req.session.user.branch_code : 'HQ';
        
        const ext = path.extname(file.originalname);
        
        // Format akhir yang bersih: profile-NIP-KodeCabang.extension
        // Contoh: profile-000006-IC1.png
        const customFilename = `profile-${nip}-${branchCode}${ext}`;
        
        cb(null, customFilename);
    }
});

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
    limits: { fileSize: 2 * 1024 * 1024 } 
});

module.exports = upload;