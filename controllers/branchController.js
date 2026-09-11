const pool = require('../config/db');

// Menampilkan daftar cabang
exports.listBranches = async (req, res) => {
    try {
        const user = req.session.user;
        let query = 'SELECT * FROM branches ORDER BY id ASC';
        let params = [];

        // Jika admin_cabang, batasi hanya melihat cabangnya sendiri
        if (user.role === 'admin_cabang') {
            query = 'SELECT * FROM branches WHERE id = $1 ORDER BY id ASC';
            params = [user.branch_id];
        }

        const { rows } = await pool.query(query, params);

        res.render('layouts/main', {
            title: 'Manajemen Cabang - MyTickSystem',
            user: user,
            partialsPath: '../pages/branches',
            branches: rows,
            error: req.query.error || null,
            success: req.query.success || null
        });
    } catch (err) {
        console.error('[BRANCH ERROR]', err);
        res.status(500).send('Terjadi kesalahan pada server.');
    }
};

// Proses Tambah Cabang (Hanya Superadmin)
exports.createBranch = async (req, res) => {
    const { branch_code, name, address } = req.body;
    try {
        await pool.query(
            'INSERT INTO branches (branch_code, name, address) VALUES ($1, $2, $3)',
            [branch_code, name, address]
        );
        res.redirect('/branches?success=Cabang berhasil ditambahkan!');
    } catch (err) {
        console.error('[BRANCH ADD ERROR]', err);
        res.redirect('/branches?error=Gagal menambah cabang. Kode cabang mungkin sudah ada.');
    }
};

// Proses Update Cabang
exports.updateBranch = async (req, res) => {
    const { id } = req.params;
    const { branch_code, name, address } = req.body;
    const user = req.session.user;

    try {
        // Validasi jika admin_cabang mencoba mengedit cabang orang lain
        if (user.role === 'admin_cabang' && user.branch_id != id) {
            return res.status(403).send('Akses ditolak!');
        }

        await pool.query(
            'UPDATE branches SET branch_code = $1, name = $2, address = $3 WHERE id = $4',
            [branch_code, name, address, id]
        );
        res.redirect('/branches?success=Cabang berhasil diperbarui!');
    } catch (err) {
        console.error('[BRANCH UPDATE ERROR]', err);
        res.redirect('/branches?error=Gagal memperbarui cabang.');
    }
};

// Proses Hapus Cabang (Constraint Restrict)
exports.deleteBranch = async (req, res) => {
    const { id } = req.params;
    const user = req.session.user;

    if (user.role !== 'superadmin') {
        return res.status(403).send('Hanya Superadmin yang dapat menghapus cabang!');
    }

    try {
        await pool.query('DELETE FROM branches WHERE id = $1', [id]);
        res.redirect('/branches?success=Cabang berhasil dihapus!');
    } catch (err) {
        console.error('[BRANCH DELETE ERROR]', err);
        // Error karena relasi RESTRICT (masih ada user/unit yang menempel)
        res.redirect('/branches?error=Cabang tidak bisa dihapus karena masih terikat dengan Unit atau User!');
    }
};