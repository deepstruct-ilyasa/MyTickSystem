const pool = require('../config/db');
const bcrypt = require('bcryptjs');

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
            title: 'Manajemen User - Ticketing System',
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
        
        const finalSupervisor = (supervisor_id && supervisor_id !== '') ? supervisor_id : null;

        await pool.query(
            `INSERT INTO users (branch_id, unit_id, supervisor_id, nip, name, password, role)
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [branch_id, unit_id, finalSupervisor, nip, name, hashedPassword, role]
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
        const finalSupervisor = (supervisor_id && supervisor_id !== '') ? supervisor_id : null;

        await pool.query(`
            UPDATE users 
            SET branch_id = $1, unit_id = $2, supervisor_id = $3, 
                nip = $4, name = $5, role = $6
            WHERE id = $7
        `, [branch_id, unit_id, finalSupervisor, nip, name, role, id]);

        // PROTEKSI SESSION: Jika user merubah datanya sendiri (misal superadmin update dirinya)
        if (req.session.user && req.session.user.id === parseInt(id)) {
            req.session.user.branch_id = branch_id;
            req.session.user.unit_id = unit_id;
            req.session.user.role = role;
            req.session.user.name = name;
        }

        res.redirect('/users?success=Data user (termasuk mutasi) berhasil diupdate!');
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