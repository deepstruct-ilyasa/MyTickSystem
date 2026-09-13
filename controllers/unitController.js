const pool = require('../config/db');
const xlsx = require('xlsx');

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
    let { branch_id, parent_unit_id, name, unit_code } = req.body;
    const user = req.session.user;

    try {
        // Paksa branch_id menggunakan session jika role-nya admin_cabang
        if (user.role === 'admin_cabang') {
            branch_id = user.branch_id;
        }

        if (!branch_id) {
            return res.status(403).send('Akses ditolak atau Cabang tidak valid!');
        }

        const parentId = parent_unit_id && parent_unit_id !== '' ? parent_unit_id : null;

        // 1. Hitung nomor urut terbesar KHUSUS untuk cabang ini
        const lastSeqRes = await pool.query(
            'SELECT COALESCE(MAX(branch_sequence), 0) as max_seq FROM units WHERE branch_id = $1',
            [branch_id]
        );
        const nextBranchSeq = lastSeqRes.rows[0].max_seq + 1;

        // 2. Gunakan langsung kode unit yang diketik/dikirim dari form (tanpa random generator lagi)
        const finalCode = unit_code ? unit_code.trim().toUpperCase() : '';

        if (!finalCode || !name) {
            return res.redirect('/units?error=Nama unit dan Kode unit wajib diisi.');
        }

        // 3. Simpan ke database
        await pool.query(
            'INSERT INTO units (branch_id, parent_unit_id, name, unit_code, branch_sequence) VALUES ($1, $2, $3, $4, $5)',
            [branch_id, parentId, name, finalCode, nextBranchSeq]
        );
        
        res.redirect('/units?success=Unit berhasil ditambahkan!');
    } catch (err) {
        console.error('[UNIT ADD ERROR]', err);
        res.redirect('/units?error=Gagal menambah unit. Kode unit mungkin sudah terdaftar.');
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


exports.bulkImportUnits = async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ success: false, message: 'File Excel belum diunggah!' });
    }

    const user = req.session.user;
    // ⭐ SUPERADMIN ambil dari form, ADMIN CABANG ambil dari session
    const branch_id = user.role === 'superadmin' ? req.body.branch_id : user.branch_id; 

    if (!branch_id) {
        return res.status(400).json({ success: false, message: 'Cabang belum dipilih!' });
    }

    try {
        await pool.query('BEGIN');

        const workbook = xlsx.read(req.file.buffer, { type: 'buffer' });
        const sheetName = workbook.SheetNames[0];
        const rows = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName]);

        if (rows.length === 0) {
            await pool.query('ROLLBACK');
            return res.status(400).json({ success: false, message: 'File Excel kosong.' });
        }

        let importedCount = 0;
        let errors = [];

        // Tahap 1: Masukkan unit utama (tanpa parent)
        for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            const { unit_code, name, parent_unit_code } = row;

            if (!unit_code || !name) {
                errors.push(`Baris ${i + 2}: Kode Unit dan Nama Unit wajib diisi.`);
                continue;
            }

            if (!parent_unit_code) {
                // ⭐ Cek apakah unit dengan branch_id & unit_code ini sudah ada ⭐
                const existingUnit = await pool.query(
                    'SELECT id, branch_sequence FROM units WHERE branch_id = $1 AND unit_code = $2',
                    [branch_id, unit_code.toString()]
                );

                let branch_sequence;
                if (existingUnit.rows.length > 0) {
                    branch_sequence = existingUnit.rows[0].branch_sequence;
                } else {
                    // Hitung sequence berikutnya khusus untuk cabang ini
                    const seqRes = await pool.query(
                        'SELECT COALESCE(MAX(branch_sequence), 0) + 1 AS next_seq FROM units WHERE branch_id = $1',
                        [branch_id]
                    );
                    branch_sequence = seqRes.rows[0].next_seq;
                }

                await pool.query(`
                    INSERT INTO units (branch_id, unit_code, name, parent_unit_id, branch_sequence)
                    VALUES ($1, $2, $3, NULL, $4)
                    ON CONFLICT (branch_id, unit_code) 
                    DO UPDATE SET name = EXCLUDED.name
                `, [branch_id, unit_code.toString(), name, branch_sequence]);
                importedCount++;
            }
        }

        // Tahap 2: Masukkan sub-unit (memiliki parent)
        for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            const { unit_code, name, parent_unit_code } = row;

            if (unit_code && name && parent_unit_code) {
                const parentRes = await pool.query(
                    'SELECT id FROM units WHERE unit_code = $1 AND branch_id = $2', 
                    [parent_unit_code.toString(), branch_id]
                );

                if (parentRes.rows.length > 0) {
                    const parent_unit_id = parentRes.rows[0].id;

                    // ⭐ Cek branch_sequence untuk sub-unit ⭐
                    const existingUnit = await pool.query(
                        'SELECT id, branch_sequence FROM units WHERE branch_id = $1 AND unit_code = $2',
                        [branch_id, unit_code.toString()]
                    );

                    let branch_sequence;
                    if (existingUnit.rows.length > 0) {
                        branch_sequence = existingUnit.rows[0].branch_sequence;
                    } else {
                        const seqRes = await pool.query(
                            'SELECT COALESCE(MAX(branch_sequence), 0) + 1 AS next_seq FROM units WHERE branch_id = $1',
                            [branch_id]
                        );
                        branch_sequence = seqRes.rows[0].next_seq;
                    }

                    await pool.query(`
                        INSERT INTO units (branch_id, unit_code, name, parent_unit_id, branch_sequence)
                        VALUES ($1, $2, $3, $4, $5)
                        ON CONFLICT (branch_id, unit_code) 
                        DO UPDATE SET name = EXCLUDED.name, parent_unit_id = EXCLUDED.parent_unit_id
                    `, [branch_id, unit_code.toString(), name, parent_unit_id, branch_sequence]);
                    importedCount++;
                } else {
                    errors.push(`Baris ${i + 2}: Parent Unit "${parent_unit_code}" tidak ditemukan.`);
                }
            }
        }

        await pool.query('COMMIT');
        return res.json({
            success: true,
            message: `Berhasil mengimpor ${importedCount} unit kerja!`,
            errors: errors.length > 0 ? errors : null
        });

    } catch (err) {
        await pool.query('ROLLBACK');
        console.error('[IMPORT UNIT ERROR]', err);
        return res.status(500).json({ success: false, message: 'Gagal memproses file unit.' });
    }
};

exports.downloadUnitTemplate = (req, res) => {
    const wb = xlsx.utils.book_new();
    
    // Data contoh baris pertama template
    const templateData = [
        { unit_code: "IT-HO", name: "Divisi Teknologi Informasi", parent_unit_code: "" },
        { unit_code: "NOC", name: "Network Operations Center", parent_unit_code: "IT-HO" }
    ];
    
    const ws = xlsx.utils.json_to_sheet(templateData);
    xlsx.utils.book_append_sheet(wb, ws, "Template Unit");
    
    // Tulis ke buffer dan kirim sebagai download file
    const buffer = xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });
    
    res.setHeader('Content-Disposition', 'attachment; filename="Template_Import_Unit.xlsx"');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(buffer);
};