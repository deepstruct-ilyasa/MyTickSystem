const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const { Pool } = require('pg');
const { refreshPool } = require('../config/db');
const initializeDatabase = require('../utils/initDb');

// 1. Tampilkan Halaman Setup Tunggal
exports.renderSetupPage = async (req, res) => {
    try {
        const tempPool = new Pool({
            user: process.env.DB_USER,
            host: process.env.DB_HOST,
            database: process.env.DB_NAME,
            password: process.env.DB_PASSWORD,
            port: process.env.DB_PORT || 5432,
        });

        const checkTable = await tempPool.query(`
            SELECT EXISTS (
                SELECT FROM information_schema.tables 
                WHERE table_name = 'company_profile'
            );
        `);

        if (checkTable.rows[0].exists) {
            const { rows } = await tempPool.query('SELECT setup_completed FROM company_profile LIMIT 1');
            if (rows.length > 0 && rows[0].setup_completed === true) {
                await tempPool.end();
                return res.redirect('/login');
            }
        }
        await tempPool.end();
    } catch (err) {}

    res.render('pages/setup', {
        title: 'Setup Wizard - MyTickSystem',
        error: null,
        oldInput: {}
    });
};

// 2. Proses Seluruh Data Setup (Database + Profil + Admin)
exports.processSetup = async (req, res) => {
    const { 
        db_host, db_port, db_user, db_password, db_name, 
        company_name, company_address, admin_nip, admin_name, admin_password 
    } = req.body;

    try {
        // A. Uji coba koneksi ke PostgreSQL terlebih dahulu
        const testPool = new Pool({
            host: db_host,
            port: db_port,
            user: db_user,
            password: db_password,
            database: db_name
        });

        await testPool.query('SELECT NOW()');
        await testPool.end();

        // B. Tulis file .env otomatis
        const envPath = path.join(__dirname, '../.env');
        const envContent = `
PORT=4000
NODE_ENV=production
SESSION_SECRET=RahasiaSuperKuatTicketingApp2026_${Math.random().toString(36).substring(7)}

DB_USER=${db_user}
DB_PASSWORD=${db_password}
DB_HOST=${db_host}
DB_PORT=${db_port}
DB_NAME=${db_name}

PWA_ENABLED=false
PWA_MODE=main
MAIN_URL=http://localhost:4000
SECONDARY_URL=
`.trim();

        fs.writeFileSync(envPath, envContent, 'utf8');

        // C. Reload env & refresh pool
        require('dotenv').config();
        refreshPool();

        // D. Jalankan migrasi tabel database
        await initializeDatabase();

        // E. Simpan Profil Perusahaan & Superadmin
        const realPool = require('../config/db');
        
        await realPool.query(
            'INSERT INTO company_profile (name, setup_completed) VALUES ($1, TRUE)',
            [company_name]
        );

        // Buat cabang Head Office (HO)
        const branchRes = await realPool.query(
            'INSERT INTO branches (branch_code, name, address) VALUES ($1, $2, $3) RETURNING id',
            ['HO', 'Head Office', company_address]
        );
        const branchId = branchRes.rows[0].id;

        const hashedPassword = await bcrypt.hash(admin_password, 10);

        // Simpan Akun Superadmin (unit_id diset NULL karena tidak ada unit default)
        await realPool.query(
            `INSERT INTO users (branch_id, unit_id, nip, name, password, role, branch_sequence) 
             VALUES ($1, NULL, $2, $3, $4, $5, $6)`,
            [branchId, admin_nip, admin_name, hashedPassword, 'superadmin', 1]
        );

        // F. Seeding Data Default untuk Tabel Settings
        await realPool.query(`
            INSERT INTO settings (key, value, description) VALUES 
            ('PWA_ENABLED', 'false', 'Status aktif fitur Progressive Web App'),
            ('PWA_MODE', 'main', 'Mode operasional PWA (main / redundant)'),
            ('MAIN_URL', 'http://localhost:4000', 'URL utama server ber-HTTPS'),
            ('SECONDARY_URL', '', 'URL cadangan / secondary server ber-HTTPS')
            ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;
        `);

        res.redirect('/login?success=Instalasi sistem berhasil sepenuhnya! Silakan login.');
    } catch (err) {
        console.error('[SETUP ERROR]', err);
        res.render('pages/setup', {
            title: 'Setup Wizard - MyTickSystem',
            error: 'Gagal Instalasi: ' + err.message,
            oldInput: req.body
        });
    }
};

// Tambahan fungsi untuk API Test Connection
exports.testDatabaseConnection = async (req, res) => {
    const { db_host, db_port, db_user, db_password, db_name } = req.body;

    try {
        const testPool = new Pool({
            host: db_host,
            port: db_port,
            user: db_user,
            password: db_password,
            database: db_name,
            connectionTimeoutMillis: 3000 // Timeout 3 detik agar tidak loading terlalu lama jika gagal
        });

        await testPool.query('SELECT NOW()');
        await testPool.end();

        return res.json({ success: true, message: 'Koneksi ke database PostgreSQL berhasil! Server merespons dengan baik.' });
    } catch (err) {
        console.error('[TEST CONN ERROR]', err);
        return res.status(400).json({ success: false, message: 'Gagal terhubung: ' + err.message });
    }
};