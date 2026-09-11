const pool = require('./config/db'); // Sesuaikan path koneksi database kamu
const bcrypt = require('bcryptjs');

async function seedDatabase() {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        console.log('[SEEDER] Memulai proses seeding database...');

        // 1. Hash password default '123456'
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash('123456', salt);

        // ==========================================
        // 2. SEED TABEL: branches
        // ==========================================        
        await client.query(`
            INSERT INTO branches (id, branch_code, name, address) VALUES
            (2, 'IC1', 'Ilyasa Corp 1', 'Alamat Ilyasa Corp cabang 1'),
            (3, 'IC2', 'Ilyasa Corp 2', 'Alamat Ilyasa Corp cabang 2');
        `);
        console.log('[SEEDER] Data branches berhasil dimasukkan.');

        // ==========================================
        // 3. SEED TABEL: units (Disertai branch_sequence)
        // ==========================================
        await client.query(`
            INSERT INTO units (id, branch_id, parent_unit_id, name, unit_code, branch_sequence) VALUES
            (2, 2, NULL, 'Manajemen Operasional', 'MGR-MANA-38', 1),
            (3, 2, NULL, 'Manajemen Arsip', 'MGR-MANA-15', 2),
            (6, 2, 2, 'Information Technology', 'IT', 3),
            (7, 2, 2, 'Sarana Prasarana', 'SARRAS', 4),
            (12, 2, 3, 'Arsip 1', 'ARS1', 5),
            (13, 2, 3, 'Arsip 2', 'ARS2', 6);
        `);
        console.log('[SEEDER] Data units berhasil dimasukkan.');

        // ==========================================
        // 4. SEED TABEL: users (Disertai branch_sequence)
        // ==========================================
        await client.query(`
            INSERT INTO users (id, branch_id, unit_id, supervisor_id, nip, name, password, role, profile_picture, branch_sequence) VALUES
            (2, 2, 2, NULL, 'budi', 'Budi Mgr Opr', $1, 'manager', NULL, 1),
            (3, 2, 6, 2, 'Rudi', 'Rudi SPV IT', $1, 'supervisor', NULL, 2),
            (4, 2, 7, 2, 'Sudi', 'Sudi SPV Sarpras', $1, 'supervisor', NULL, 3),
            (5, 2, 6, 3, 'Studi', 'Studi IT', $1, 'staf', NULL, 4),
            (6, 2, 7, 4, 'Sbudi', 'Sbudi Sarpras', $1, 'staf', NULL, 5),
            (7, 2, 3, NULL, 'Ari', 'Ari Mgr Arsip', $1, 'manager', NULL, 6),
            (8, 2, 12, 7, 'Ari1', 'Ari 1 SPV Arsip', $1, 'supervisor', NULL, 7),
            (9, 2, 13, 7, 'Ari2', 'Ari 2 SPV Arsip', $1, 'supervisor', NULL, 8),
            (10, 2, 12, 8, 'Sari1', 'Sari 1 Arsip', $1, 'staf', NULL, 9),
            (11, 2, 13, 9, 'Sari2', 'Sari 2 Arsip', $1, 'staf', NULL, 10),
            (12, 2, NULL, NULL, '000001', 'Admin Cabang IC 1', $1, 'admin_cabang', NULL, 11);
        `, [hashedPassword]);
        console.log('[SEEDER] Data users berhasil dimasukkan.');

        // ==========================================
        // 5. SINKRONISASI SEQUENCE POSTGRESQL (PENTING!)
        // ==========================================
        // Karena kita menginput ID secara manual, sequence auto-increment database 
        // harus disinkronkan agar tidak bentrok saat data baru ditambahkan lewat aplikasi.
        await client.query(`
            SELECT setval('branches_id_seq', COALESCE((SELECT MAX(id) FROM branches), 1));
            SELECT setval('units_id_seq', COALESCE((SELECT MAX(id) FROM units), 1));
            SELECT setval('users_id_seq', COALESCE((SELECT MAX(id) FROM users), 1));
        `);
        console.log('[SEEDER] Sequence ID database berhasil disinkronkan.');

        await client.query('COMMIT');
        console.log('[SEEDER SUKSES] Seluruh data berhasil di-seed dengan password default: 123456!');
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('[SEEDER ERROR] Gagal melakukan seeding database:', err);
    } finally {
        client.release();
        process.exit();
    }
}

seedDatabase();