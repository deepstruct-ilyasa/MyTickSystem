const pool = require('../config/db');
const bcrypt = require('bcryptjs');

exports.listUsers = async (req, res) => {
    try {
        const currentUser = req.session.user;
        
        // 1. Query Utama Tabel User (Sesuai Batasan Role)
        let query = `
            SELECT u.id, u.nip, u.name, u.role, u.branch_id, u.unit_id, u.supervisor_id, 
                   b.name as branch_name, un.name as unit_name, sup.name as supervisor_name
            FROM users u
            LEFT JOIN branches b ON u.branch_id = b.id
            LEFT JOIN units un ON u.unit_id = un.id
            LEFT JOIN users sup ON u.supervisor_id = sup.id
            WHERE 1=1
        `;
        let params = [];

        if (currentUser.role === 'admin_cabang') {
            query += ` AND u.branch_id = $1`;
            params.push(currentUser.branch_id);
        } else if (currentUser.role === 'manager') {
            query += ` AND u.branch_id = $1 AND (u.unit_id = $2 OR un.parent_unit_id = $2)`;
            params.push(currentUser.branch_id, currentUser.unit_id);
        } else if (currentUser.role === 'supervisor') {
            query += ` AND u.branch_id = $1 AND u.unit_id = $2`;
            params.push(currentUser.branch_id, currentUser.unit_id);
        }
        
        query += ` ORDER BY u.role, u.name ASC`;
        const { rows: usersList } = await pool.query(query, params);

        // 2. Filter Data Cabang untuk Dropdown Form
        let branchQuery = 'SELECT id, name FROM branches';
        let branchParams = [];
        if (currentUser.role !== 'superadmin') {
            branchQuery += ' WHERE id = $1';
            branchParams.push(currentUser.branch_id);
        }
        const { rows: branches } = await pool.query(branchQuery, branchParams);

        // 3. Filter Data Unit untuk Dropdown Form
        let unitQuery = 'SELECT id, branch_id, parent_unit_id, name FROM units WHERE 1=1';
        let unitParams = [];
        if (currentUser.role === 'admin_cabang') {
            unitQuery += ' AND branch_id = $1';
            unitParams.push(currentUser.branch_id);
        } else if (currentUser.role === 'manager') {
            unitQuery += ' AND branch_id = $1 AND (id = $2 OR parent_unit_id = $2)';
            unitParams.push(currentUser.branch_id, currentUser.unit_id);
        } else if (currentUser.role === 'supervisor') {
            unitQuery += ' AND branch_id = $1 AND id = $2';
            unitParams.push(currentUser.branch_id, currentUser.unit_id);
        }
        const { rows: units } = await pool.query(unitQuery, unitParams);

        // 4. Data Superiors (Atasan) - Diperbaiki agar Superadmin bisa mengambil semua atasan lintas cabang
        let superiorsQuery = `SELECT id, branch_id, unit_id, name, role FROM users WHERE role IN ('manager', 'supervisor')`;
        let superiorsParams = [];

        if (currentUser.role !== 'superadmin') {
            superiorsQuery += ` AND branch_id = $1`;
            superiorsParams.push(currentUser.branch_id);
        }

        const { rows: superiors } = await pool.query(superiorsQuery, superiorsParams);

        res.render('layouts/main', {
            title: 'Manajemen User - Ticketing System',
            user: currentUser,
            partialsPath: '../pages/users',
            usersList: usersList,
            branches: branches,
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
    const currentUser = req.session.user;
    const { branch_id, unit_id, supervisor_id, nip, name, password, role } = req.body;
    
    try {
        if (currentUser.role === 'admin_cabang' && Number(branch_id) !== Number(currentUser.branch_id)) {
            return res.status(403).send('Akses ditolak: di luar cabang Anda.');
        }

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);
        
        const finalUnit = (unit_id && unit_id !== '') ? unit_id : null;
        const finalSupervisor = (supervisor_id && supervisor_id !== '') ? supervisor_id : null;

        await pool.query(
            `INSERT INTO users (branch_id, unit_id, supervisor_id, nip, name, password, role)
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [branch_id, finalUnit, finalSupervisor, nip, name, hashedPassword, role]
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
        const finalUnit = (unit_id && unit_id !== '') ? unit_id : null;
        const finalSupervisor = (supervisor_id && supervisor_id !== '') ? supervisor_id : null;

        await pool.query(
            `UPDATE users SET branch_id = $1, unit_id = $2, supervisor_id = $3, nip = $4, name = $5, role = $6 WHERE id = $7`,
            [branch_id, finalUnit, finalSupervisor, nip, name, role, id]
        );

        res.redirect('/users?success=Data user berhasil diperbarui!');
    } catch (err) {
        console.error('[USER UPDATE ERROR]', err);
        res.redirect('/users?error=Gagal memperbarui user.');
    }
};

// --- FUNGSI INI YANG SEBELUMNYA KETINGGALAN DAN BIKIN ERROR ---
exports.resetPassword = async (req, res) => {
    const { id } = req.params;
    try {
        const salt = await bcrypt.genSalt(10);
        const defaultPassword = await bcrypt.hash('123456', salt);

        await pool.query(
            `UPDATE users SET password = $1 WHERE id = $2`,
            [defaultPassword, id]
        );

        res.redirect('/users?success=Password user berhasil direset ke default (123456)!');
    } catch (err) {
        console.error('[RESET PASSWORD ERROR]', err);
        res.redirect('/users?error=Gagal mereset password.');
    }
};

exports.deleteUser = async (req, res) => {
    const { id } = req.params;
    try {
        await pool.query('DELETE FROM users WHERE id = $1', [id]);
        res.redirect('/users?success=User berhasil dihapus!');
    } catch (err) {
        console.error('[USER DELETE ERROR]', err);
        res.redirect('/users?error=Gagal hapus user.');
    }
};