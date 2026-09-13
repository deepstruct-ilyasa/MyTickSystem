const pool = require('../config/db');
const bcrypt = require('bcryptjs');
const xlsx = require('xlsx');

exports.listUsers = async (req, res) => {
    try {
        const user = req.session.user;
        
        // 1. Query Utama untuk Menampilkan Tabel User (Sesuai Hak Akses)
        let query = `
            SELECT u.id, u.nip, u.name, u.role, b.name as branch_name, un.name as unit_name, sup.name as supervisor_name
            FROM users u
            LEFT JOIN branches b ON u.branch_id = b.id
            LEFT JOIN units un ON u.unit_id = un.id
            LEFT JOIN users sup ON u.supervisor_id = sup.id
            WHERE 1=1
        `;
        let params = [];

        if (user.role === 'admin_cabang') {
            // Admin Cabang: Lihat semua user di cabangnya
            query += ` AND u.branch_id = $1`;
            params.push(user.branch_id);
        } else if (user.role === 'manager') {
            // Manager (Struktural): Lihat staf & supervisor di unitnya (dan sub-unitnya)
            query += ` AND (u.unit_id = $1 OR un.parent_unit_id = $1)`;
            params.push(user.unit_id);
        } else if (user.role === 'supervisor') {
            // [PERUBAHAN BARU] Supervisor (Struktural): Otomatis melihat semua user di dalam unit tempat dia ditugaskan
            query += ` AND u.unit_id = $1`;
            params.push(user.unit_id);
        }
        
        query += ` ORDER BY u.role, u.name ASC`;
        const { rows: usersList } = await pool.query(query, params);

        // 2. Data Pelengkap untuk Form Tambah User (Dropdown)
        let branchQuery = 'SELECT id, name FROM branches';
        let branchParams = [];
        if (user.role === 'admin_cabang') {
            branchQuery += ' WHERE id = $1';
            branchParams.push(user.branch_id);
        }
        const { rows: branches } = await pool.query(branchQuery, branchParams);
        const { rows: units } = await pool.query('SELECT id, branch_id, parent_unit_id, name FROM units');
        const { rows: superiors } = await pool.query(`SELECT id, branch_id, unit_id, name, role FROM users WHERE role IN ('manager', 'supervisor')`);

        res.render('layouts/main', {
            title: 'Manajemen User - MyTickSystem',
            user: user,
            partialsPath: '../pages/users',
            usersList: usersList,
            branches: branches,
            // Kita ubah data units & superiors jadi string JSON agar bisa dibaca oleh Alpine.js di HTML
            unitsJSON: JSON.stringify(units),
            superiorsJSON: JSON.stringify(superiors),
            error: req.query.error || null,
            success: req.query.success || null
        });
    } catch (err) {
        console.error('[USER ERROR]', err);
        res.status(500).send('Terjadi kesalahan pada server.');
    }
};

exports.createUser = async (req, res) => {
    const { branch_id, unit_id, supervisor_id, nip, name, password, role } = req.body;
    try {
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);
        
        // Konversi aman ke integer atau null jika kosong
        const finalBranch = (branch_id && branch_id !== '') ? parseInt(branch_id, 10) : null;
        const finalUnit = (unit_id && unit_id !== '') ? parseInt(unit_id, 10) : null;
        const finalSupervisor = (supervisor_id && supervisor_id !== '') ? parseInt(supervisor_id, 10) : null;

        // ⭐ HITUNG NOMOR URUT MANDIRI KHUSUS UNTUK CABANG INI ⭐
        let nextBranchSeq = 1;
        if (finalBranch) {
            const lastSeqRes = await pool.query(
                'SELECT COALESCE(MAX(branch_sequence), 0) as max_seq FROM users WHERE branch_id = $1',
                [finalBranch]
            );
            nextBranchSeq = lastSeqRes.rows[0].max_seq + 1;
        }

        // Simpan data user beserta branch_sequence-nya
        await pool.query(
            `INSERT INTO users (branch_id, unit_id, supervisor_id, nip, name, password, role, branch_sequence)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
            [finalBranch, finalUnit, finalSupervisor, nip, name, hashedPassword, role, nextBranchSeq]
        );
        
        res.redirect('/users?success=User berhasil ditambah!');
    } catch (err) {
        console.error('[USER ADD ERROR]', err);
        res.redirect('/users?error=Gagal menambah user. NIP mungkin sudah terdaftar.');
    }
};

exports.updateUser = async (req, res) => {
    const { id } = req.params;
    const { branch_id, unit_id, supervisor_id, nip, name, role } = req.body;
    
    try {
        const finalBranch = (branch_id && branch_id !== '') ? parseInt(branch_id, 10) : null;
        const finalUnit = (unit_id && unit_id !== '') ? parseInt(unit_id, 10) : null;
        const finalSupervisor = (supervisor_id && supervisor_id !== '') ? parseInt(supervisor_id, 10) : null;

        await pool.query(`
            UPDATE users 
            SET branch_id = $1, unit_id = $2, supervisor_id = $3, 
                nip = $4, name = $5, role = $6
            WHERE id = $7
        `, [finalBranch, finalUnit, finalSupervisor, nip, name, role, id]);

        // PROTEKSI SESSION
        if (req.session.user && req.session.user.id === parseInt(id)) {
            req.session.user.branch_id = finalBranch;
            req.session.user.unit_id = finalUnit;
            req.session.user.role = role;
            req.session.user.name = name;
        }

        res.redirect('/users?success=Data user berhasil diupdate!');
    } catch (err) {
        console.error('[USER UPDATE ERROR]', err);
        res.redirect(`/users?error=Gagal mengupdate user.`);
    }
};

exports.deleteUser = async (req, res) => {
    const { id } = req.params;
    try {
        await pool.query('DELETE FROM users WHERE id = $1', [id]);
        res.redirect('/users?success=User berhasil dihapus!');
    } catch (err) {
        console.error('[USER DELETE ERROR]', err);
        res.redirect('/users?error=Gagal hapus user. User mungkin masih memiliki tiket yang terikat padanya.');
    }
};


exports.bulkImportUsers = async (req, res) => {
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

        // TAHAP 1: Masukkan data user dasar (mengabaikan supervisor dulu) dengan branch_sequence otomatis
        for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            const { nip, name, password, role, unit_code } = row;

            if (!nip || !name || !unit_code) {
                errors.push(`Baris ${i + 2}: Kolom wajib (nip, name, unit_code) harus diisi.`);
                continue;
            }

            // Cari ID unit berdasarkan unit_code di cabang admin yang sedang login
            const unitRes = await pool.query(
                'SELECT id FROM units WHERE unit_code = $1 AND branch_id = $2', 
                [unit_code.toString(), branch_id]
            );

            if (unitRes.rows.length === 0) {
                errors.push(`Baris ${i + 2}: Kode Unit "${unit_code}" tidak ditemukan di cabang ini.`);
                continue;
            }
            const unit_id = unitRes.rows[0].id;

            // Atur password default jika kosong
            const plainPassword = password ? password.toString() : '123456';
            const hashedPassword = await bcrypt.hash(plainPassword, 10);
            const userRole = role ? role.toLowerCase() : 'user';

            // Cek apakah user sudah ada untuk mempertahankan branch_sequence lama atau membuat baru
            const existingUser = await pool.query('SELECT id, branch_sequence FROM users WHERE nip = $1', [nip.toString()]);
            
            let branch_sequence;
            if (existingUser.rows.length > 0) {
                branch_sequence = existingUser.rows[0].branch_sequence;
            } else {
                const seqRes = await pool.query(
                    'SELECT COALESCE(MAX(branch_sequence), 0) + 1 AS next_seq FROM users WHERE branch_id = $1',
                    [branch_id]
                );
                branch_sequence = seqRes.rows[0].next_seq;
            }

            // Insert atau Update jika NIP sudah ada (Upsert) dengan branch_sequence
            await pool.query(`
                INSERT INTO users (nip, name, password, role, branch_id, unit_id, supervisor_id, branch_sequence)
                VALUES ($1, $2, $3, $4, $5, $6, NULL, $7)
                ON CONFLICT (nip) 
                DO UPDATE SET name = EXCLUDED.name, role = EXCLUDED.role, unit_id = EXCLUDED.unit_id
            `, [nip.toString(), name, hashedPassword, userRole, branch_id, unit_id, branch_sequence]);

            importedCount++;
        }

        // TAHAP 2: Update relasi Supervisor / Atasan berdasarkan supervisor_nip
        for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            if (row.nip && row.supervisor_nip) {
                // Cari ID atasan berdasarkan NIP
                const supRes = await pool.query('SELECT id FROM users WHERE nip = $1', [row.supervisor_nip.toString()]);
                if (supRes.rows.length > 0) {
                    const supervisor_id = supRes.rows[0].id;
                    await pool.query('UPDATE users SET supervisor_id = $1 WHERE nip = $2', [supervisor_id, row.nip.toString()]);
                }
            }
        }

        await pool.query('COMMIT');
        return res.json({
            success: true,
            message: `Berhasil mengimpor ${importedCount} data user!`,
            errors: errors.length > 0 ? errors : null
        });

    } catch (err) {
        await pool.query('ROLLBACK');
        console.error('[IMPORT USER ERROR]', err);
        return res.status(500).json({ success: false, message: 'Gagal memproses file user.' });
    }
};


exports.downloadUserTemplate = async (req, res) => {
    const user = req.session.user;
    // ⭐ SUPERADMIN ambil dari query URL (?branch_id=X), ADMIN CABANG ambil dari session
    const branch_id = user.role === 'superadmin' ? req.query.branch_id : user.branch_id;

    if (!branch_id) {
        return res.status(400).send('Harap pilih cabang terlebih dahulu sebelum mengunduh template!');
    }

    try {
        // 1. Ambil data unit di cabang ini
        const unitsRes = await pool.query(
            'SELECT id, unit_code, name, parent_unit_id FROM units WHERE branch_id = $1 ORDER BY name ASC',
            [branch_id]
        );

        // 2. Ambil data user yang berpotensi jadi atasan (manager / supervisor) di cabang ini beserta NIP-nya
        const leadersRes = await pool.query(
            'SELECT nip, name, role, unit_id FROM users WHERE branch_id = $1 AND role IN (\'manager\', \'supervisor\')',
            [branch_id]
        );

        // 3. Susun data untuk Sheet 2 dengan format: unit_code | unit_name | manager | supervisor | nip
        const unitReferenceData = unitsRes.rows.map(unit => {
            let managerName = "-";
            let managerNip = "-";
            
            // HANYA cari manager yang benar-benar ada di unit ini atau unit induknya (tanpa fallback acak)
            let directManager = leadersRes.rows.find(l => l.unit_id === unit.id && l.role === 'manager');
            if (!directManager && unit.parent_unit_id) {
                directManager = leadersRes.rows.find(l => l.unit_id === unit.parent_unit_id && l.role === 'manager');
            }

            if (directManager) {
                managerName = directManager.name;
                managerNip = directManager.nip;
            }

            let supervisorName = "-";
            let supervisorNip = "-";
            
            const directSupervisor = leadersRes.rows.find(l => l.unit_id === unit.id && l.role === 'supervisor');
            if (directSupervisor) {
                supervisorName = directSupervisor.name;
                supervisorNip = directSupervisor.nip;
            }

            const primaryNip = supervisorNip !== "-" ? supervisorNip : (managerNip !== "-" ? managerNip : "-");

            return {
                unit_code: unit.unit_code,
                unit_name: unit.name,
                manager: managerName,
                supervisor: supervisorName,
                nip: primaryNip
            };
        });

        const wb = xlsx.utils.book_new();

        // Sheet 1: Template Utama User
        const templateData = [
            { nip: "19900101", name: "Budi Santoso", password: "123", role: "manager", unit_code: "IT-HO", supervisor_nip: "" },
            { nip: "19920202", name: "Siti Rahma", password: "123", role: "supervisor", unit_code: "NOC", supervisor_nip: "19900101" },
            { nip: "19950303", name: "Ahmad Fauzi", password: "123", role: "staf", unit_code: "NOC", supervisor_nip: "19920202" }
        ];
        const wsUser = xlsx.utils.json_to_sheet(templateData);
        xlsx.utils.book_append_sheet(wb, wsUser, "Template User");

        // Sheet 2: Referensi Unit dengan format baru
        const finalUnitData = unitReferenceData.length > 0 
            ? unitReferenceData 
            : [{ unit_code: "CONTOH-KODE", unit_name: "Nama Unit", manager: "-", supervisor: "-", nip: "-" }];
            
        const wsUnit = xlsx.utils.json_to_sheet(finalUnitData);
        xlsx.utils.book_append_sheet(wb, wsUnit, "Referensi Unit & Atasan");

        // Kirim file ke browser
        const buffer = xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });

        res.setHeader('Content-Disposition', 'attachment; filename="Template_Import_User_Lengkap.xlsx"');
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.send(buffer);

    } catch (err) {
        console.error('[DOWNLOAD USER TEMPLATE ERROR]', err);
        res.status(500).send('Gagal mengunduh template.');
    }
};