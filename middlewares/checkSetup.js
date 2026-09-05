const pool = require('../config/db');

const checkSetup = async (req, res, next) => {
    // Abaikan pengecekan jika user sedang mengakses URL setup atau file statis (CSS/JS)
    if (req.path === '/setup' || req.path.startsWith('/css') || req.path.startsWith('/js')) {
        return next();
    }

    try {
        const { rows } = await pool.query('SELECT setup_completed FROM company_profile LIMIT 1');
        
        // Jika data perusahaan belum ada, atau setup belum selesai, redirect!
        if (rows.length === 0 || rows[0].setup_completed === false) {
            return res.redirect('/setup');
        }
        
        // Jika sudah setup, silakan lanjut
        next();
    } catch (err) {
        console.error('[MIDDLEWARE ERROR] Gagal mengecek status setup:', err);
        res.status(500).send('Internal Server Error saat mengecek Database');
    }
};

module.exports = checkSetup;