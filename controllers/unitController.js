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
            title: 'Manajemen Unit - Ticketing System',
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

        // LOGIKA DINAMIS: 
        // Jika parentId KOSONG (Berarti ini Unit Manajemen / Manager), 
        // kita generate kode unit otomatis dari nama depannya biar user gak pusing.
        // Jika parentId TERISI (Unit Biasa), kita pakai inputan unit_code dari form.
        let finalCode = unit_code;
        if (!parentId) {
            // Contoh auto-generate kode dari nama: "Manager Pelayanan" -> "MGR-PELAYANAN" atau inisial unik
            finalCode = 'MGR-' + name.replace(/\s+/g, '').toUpperCase().substring(0, 6) + '-' + Math.floor(100 + Math.random() * 900);
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