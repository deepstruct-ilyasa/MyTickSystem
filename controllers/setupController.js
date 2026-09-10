const pool = require('../config/db');
const bcrypt = require('bcryptjs');

exports.renderSetupPage = (req, res) => {
    res.render('pages/setup'); // Memanggil file EJS
};

exports.processSetup = async (req, res) => {
    const { company_name, company_address, admin_name, admin_nip, admin_password } = req.body;
    
    const client = await pool.connect();
    try {
        await client.query('BEGIN'); // Mulai transaksi database

        // 1. Simpan Profil Perusahaan dan tandai setup_completed = true
        await client.query(
            'INSERT INTO company_profile (name, setup_completed) VALUES ($1, $2)',
            [company_name, true]
        );

        // 2. Buat Cabang Default (Misal: Kantor Pusat)
        const branchRes = await client.query(
            `INSERT INTO branches (branch_code, name, address) 
             VALUES ($1, $2, $3) RETURNING id`,
            ['HO', 'Head Office', company_address]
        );
        const branchId = branchRes.rows[0].id;

        // 3. Buat Unit Default (Misal: Manajemen) di bawah Cabang Pusat
        const unitRes = await client.query(
            `INSERT INTO units (branch_id, name, unit_code) 
             VALUES ($1, $2, $3) RETURNING id`,
            [branchId, 'Administrator Sistem', 'SA']
        );
        const unitId = unitRes.rows[0].id;

        // 4. Enkripsi Password & Buat User Superadmin
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(admin_password, salt);

        await client.query(
            `INSERT INTO users (branch_id, unit_id, nip, name, password, role) 
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [branchId, unitId, admin_nip, admin_name, hashedPassword, 'superadmin']
        );

        await client.query('COMMIT'); // Simpan permanen!
        console.log('[SETUP SUCCESS] Perusahaan dan Superadmin berhasil dibuat.');
        
        // Arahkan ke halaman login (nanti kita buat halamannya)
        res.redirect('/login'); 
    } catch (err) {
        await client.query('ROLLBACK'); // Batalkan semua jika ada error
        console.error('[SETUP ERROR]', err);
        res.status(500).send('Terjadi kesalahan saat memproses setup.');
    } finally {
        client.release();
    }
};