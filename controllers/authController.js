const pool = require('../config/db');
const bcrypt = require('bcryptjs');

// Menampilkan halaman login
exports.renderLogin = async (req, res) => { // ⭐ Ubah menjadi async
    if (req.session && req.session.user) {
        return res.redirect('/dashboard');
    }
    
    try {
        // ⭐ Ambil status PWA asli dari database
        const pwaSetting = await pool.query("SELECT value FROM settings WHERE key = 'PWA_ENABLED'");
        const isPwaEnabled = pwaSetting.rows.length > 0 && pwaSetting.rows[0].value === 'true';
        
        res.render('pages/login', { pwaEnabled: isPwaEnabled, error: null });
    } catch (err) {
        console.error('[PWA SETTING ERROR]', err);
        res.render('pages/login', { pwaEnabled: false, error: null });
    }
};

// Memproses data login
exports.processLogin = async (req, res) => {
    const { nip, password } = req.body;
    
    try {
        // ⭐ Ambil status PWA asli dari database untuk dikembalikan saat error
        const pwaSetting = await pool.query("SELECT value FROM settings WHERE key = 'PWA_ENABLED'");
        const isPwaEnabled = pwaSetting.rows.length > 0 && pwaSetting.rows[0].value === 'true';

        const query = `
            SELECT u.*, b.name as branch_name, b.branch_code as branch_code, un.name as unit_name 
            FROM users u
            LEFT JOIN branches b ON u.branch_id = b.id
            LEFT JOIN units un ON u.unit_id = un.id
            WHERE u.nip = $1
        `;
        const { rows } = await pool.query(query, [nip]);

        if (rows.length === 0) {
            return res.render('pages/login', { error: 'NIP tidak ditemukan dalam sistem!', pwaEnabled: isPwaEnabled });
        }

        const user = rows[0];
        const isMatch = await bcrypt.compare(password, user.password);
        
        if (!isMatch) {
            return res.render('pages/login', { error: 'Password salah!', pwaEnabled: isPwaEnabled });
        }

        req.session.user = {
            id: user.id,
            nip: user.nip,
            name: user.name,
            role: user.role,
            branch_id: user.branch_id,
            branch_code: user.branch_code || 'HQ',
            unit_id: user.unit_id,
            branch_name: user.branch_name || 'Pusat',
            unit_name: user.unit_name || 'Manajemen',
            profile_picture: user.profile_picture
        };

        return res.redirect('/dashboard');

    } catch (err) {
        console.error('[LOGIN ERROR]', err);
        return res.status(500).send('Terjadi kesalahan pada server saat proses login.');
    }
};

// Logout (Tetap sama)
exports.logout = (req, res) => {
    req.session.destroy((err) => {
        if (err) console.error('[LOGOUT ERROR]', err);
        res.redirect('/login');
    });
};