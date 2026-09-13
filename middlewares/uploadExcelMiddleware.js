const multer = require('multer');

const storage = multer.memoryStorage();

const excelFileFilter = (req, file, cb) => {
    const allowedMimeTypes = [
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
        'application/vnd.ms-excel', // .xls
        'text/csv',
        'application/csv'
    ];

    if (allowedMimeTypes.includes(file.mimetype) || file.originalname.match(/\.(xlsx|xls|csv)$/i)) {
        cb(null, true);
    } else {
        cb(new Error('Hanya file Excel (.xlsx, .xls) atau CSV yang diperbolehkan!'), false);
    }
};

const uploadExcel = multer({ 
    storage: storage, 
    fileFilter: excelFileFilter, 
    limits: { fileSize: 5 * 1024 * 1024 } // Maksimal 5MB
});

module.exports = uploadExcel;