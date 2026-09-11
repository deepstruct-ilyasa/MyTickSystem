const pool = require('../config/db');

// Menampilkan daftar unit
exports.listUnits = async (req, res) => {
    try {
        const user = req.session.user;
        let query = `
            SELECT u.*, b.name as branch_name, p.name as parent_name 
            FROM units u
            JOIN branches b ON u.branch_id = b.id
            LEFT JOIN units p ON u.parent_unit_id = p.id
        `;
        let params = [];

        if (user.role === 'admin_cabang') {
            query += ' WHERE u.branch_id = $1';
            params = [user.branch_id];
        }
        query += ' ORDER BY u.branch_id, u.id ASC';

        const unitsRes = await pool.query(query, params);

        let branchQuery = 'SELECT * FROM branches ORDER BY name ASC';
        let branchParams = [];
        if (user.role === 'admin_cabang') {
            branchQuery = 'SELECT * FROM branches WHERE id = $1';
            branchParams = [user.branch_id];
        }
        const branchesRes = await pool.query(branchQuery, branchParams);

        // Ambil data unit manajemen (parent_unit_id IS NULL) untuk pilihan atasan/manager
        const managementUnitsRes = await pool.query(
            user.role === 'admin_cabang' 
                ? 'SELECT * FROM units WHERE parent_unit_id IS NULL AND branch_id = $1'
                : 'SELECT * FROM units WHERE parent_unit_id IS NULL',
            user.role === 'admin_cabang' ? [user.branch_id] : []
        );

        res.render('layouts/main', {
            title: 'Manajemen Unit - MyTickSystem',
            user: user,
            partialsPath: '../pages/units',
            units: unitsRes.rows,
            branches: branchesRes.rows,
            managementUnits: managementUnitsRes.rows,
            error: req.query.error || null,
            success: req.query.success || null
        });
    } catch (err) {
        console.error('[UNIT ERROR]', err);
        res.status(500).send('Terjadi kesalahan pada server.');
    }
};

// Proses Tambah Unit (Tanpa ribet kode untuk unit manajemen)
exports.createUnit = async (req, res) => {
    const { branch_id, parent_unit_id, name, unit_code } = req.body;
    const user = req.session.user;

    try {
        if (user.role === 'admin_cabang' && user.branch_id != branch_id) {
            return res.status(403).send('Akses ditolak!');
        }

        const parentId = parent_unit_id && parent_unit_id !== '' ? parent_unit_id : null;

        // LOGIKA DINAMIS RINGKAS: 
        // Jika parentId KOSONG (Unit Manajemen), buat kode MGR-[3-4 huruf unik] + [angka acak 2 digit biar singkat]
        let finalCode = unit_code;
        if (!parentId) {
            // Mengambil maksimal 4 huruf pertama dari nama unit (dibersihkan dari spasi, dijadikan huruf besar)
            const cleanName = name.replace(/[^a-zA-Z]/g, '').toUpperCase().substring(0, 4);
            const randomSuffix = Math.floor(10 + Math.random() * 90); // Angka acak 2 digit (10-99)
            
            finalCode = `MGR-${cleanName}-${randomSuffix}`;
        }

        await pool.query(
            'INSERT INTO units (branch_id, parent_unit_id, name, unit_code) VALUES ($1, $2, $3, $4)',
            [branch_id, parentId, name, finalCode]
        );
        res.redirect('/units?success=Unit berhasil ditambahkan!');
    } catch (err) {
        console.error('[UNIT ADD ERROR]', err);
        res.redirect('/units?error=Gagal menambah unit. Periksa kembali data.');
    }
};


exports.updateUnit = async (req, res) => {
    const unitId = req.params.id;
    const { branch_id, parent_unit_id, name, unit_code } = req.body;
    const user = req.session.user;

    try {
        // [PENGAMANAN BACKEND] Hanya Superadmin dan Admin Cabang yang boleh edit
        if (user.role !== 'superadmin' && user.role !== 'admin_cabang') {
            return res.redirect('/units?error=Akses ditolak. Anda tidak memiliki wewenang untuk mengedit unit.');
        }

        // Jika admin cabang, pastikan dia hanya mengedit unit di cabangnya sendiri
        if (user.role === 'admin_cabang' && user.branch_id != branch_id) {
            return res.status(403).send('Akses ditolak!');
        }

        const parentId = parent_unit_id && parent_unit_id !== '' ? parent_unit_id : null;

        await pool.query(
            'UPDATE units SET branch_id = $1, parent_unit_id = $2, name = $3, unit_code = $4 WHERE id = $5',
            [branch_id, parentId, name, unit_code, unitId]
        );

        res.redirect('/units?success=Unit berhasil diperbarui!');
    } catch (err) {
        console.error('[UNIT UPDATE ERROR]', err);
        res.redirect('/units?error=Gagal memperbarui unit. Periksa kembali data.');
    }
};


// Proses Hapus Unit
exports.deleteUnit = async (req, res) => {
    const { id } = req.params;
    const user = req.session.user;

    try {
        if (user.role === 'admin_cabang') {
            const check = await pool.query('SELECT branch_id FROM units WHERE id = $1', [id]);
            if (check.rows.length === 0 || check.rows[0].branch_id !== user.branch_id) {
                return res.status(403).send('Akses ditolak!');
            }
        }

        await pool.query('DELETE FROM units WHERE id = $1', [id]);
        res.redirect('/units?success=Unit berhasil dihapus!');
    } catch (err) {
        console.error('[UNIT DELETE ERROR]', err);
        res.redirect('/units?error=Gagal hapus! Pastikan tidak ada User atau Unit Biasa yang masih terikat pada unit ini.');
    }
};