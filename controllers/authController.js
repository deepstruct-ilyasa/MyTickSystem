const pool = require('../config/db');
const bcrypt = require('bcryptjs');

// Menampilkan halaman login
exports.renderLogin = (req, res) => {
    // Jika user sudah login, langsung lempar ke dashboard
    if (req.session && req.session.user) {
        return res.redirect('/dashboard');
    }
    res.render('pages/login');
};

// Memproses data login
exports.processLogin = async (req, res) => {
    const { nip, password } = req.body;

    try {
        // Cari user berdasarkan NIP
        const query = `
            SELECT u.*, b.name as branch_name, un.name as unit_name 
            FROM users u
            LEFT JOIN branches b ON u.branch_id = b.id
            LEFT JOIN units un ON u.unit_id = un.id
            WHERE u.nip = $1
        `;
        const { rows } = await pool.query(query, [nip]);

        if (rows.length === 0) {
            return res.render('pages/login', { error: 'NIP tidak ditemukan dalam sistem!' });
        }

        const user = rows[0];

        // Cocokan password dengan hash bcrypt
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.render('pages/login', { error: 'Password salah!' });
        }

        // Simpan data penting ke dalam session
        req.session.user = {
            id: user.id,
            nip: user.nip,
            name: user.name,
            role: user.role,
            branch_id: user.branch_id,
            unit_id: user.unit_id,
            branch_name: user.branch_name,
            unit_name: user.unit_name
        };

        console.log(`[LOGIN SUCCESS] User ${user.name} (${user.role}) berhasil masuk.`);
        return res.redirect('/dashboard');

    } catch (err) {
        console.error('[LOGIN ERROR]', err);
        return res.status(500).send('Terjadi kesalahan pada server saat proses login.');
    }
};

// Logout
exports.logout = (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            console.error('[LOGOUT ERROR]', err);
        }
        res.redirect('/login');
    });
};