const pool = require('../config/db');

const checkSetup = async (req, res, next) => {
    // Izinkan akses ke rute /setup, aset statis (CSS/JS), dan halaman login/auth
    if (req.path.startsWith('/setup') || req.path.startsWith('/css') || req.path.startsWith('/js') || req.path === '/login') {
        return next();
    }

    try {
        // Cek apakah tabel company_profile sudah ada
        const tableCheck = await pool.query(`
            SELECT EXISTS (
                SELECT FROM information_schema.tables 
                WHERE table_name = 'company_profile'
            );
        `);

        if (!tableCheck.rows[0].exists) {
            return res.redirect('/setup');
        }

        const { rows } = await pool.query('SELECT setup_completed FROM company_profile LIMIT 1');
        
        // Jika setup belum selesai, arahkan ke wizard instalasi
        if (rows.length === 0 || rows[0].setup_completed === false) {
            return res.redirect('/setup');
        }
        
        next();
    } catch (err) {
        // Jika database belum terhubung sama sekali, arahkan ke /setup
        return res.redirect('/setup');
    }
};

module.exports = checkSetup;