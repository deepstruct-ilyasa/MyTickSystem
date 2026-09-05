const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Pastikan folder tujuan tersedia (buat otomatis jika belum ada)
const uploadDir = 'public/uploads/profile';
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

// Konfigurasi penyimpanan file
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        // Ambil NIP dan Branch Code dari session user yang sedang login
        const nip = req.session.user.nip || 'unknown';
        const branchCode = req.session.user.branch_id || 'general'; // atau ubah jadi kode cabang jika ada di session
        
        const ext = path.extname(file.originalname);
        
        // Format akhir: profile-nip-branch_code-timestamp.ext (timestamp ditambahkan agar tidak bentrok jika ganti foto)
        const customFilename = `profile-${nip}-${branchCode}-${Date.now()}${ext}`;
        
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
    limits: { fileSize: 2 * 1024 * 1024 } // Maksimal 2MB
});

module.exports = upload;