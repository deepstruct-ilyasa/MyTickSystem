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
        // 3. SEED TABEL: units
        // ==========================================
        await client.query(`
            INSERT INTO units (id, branch_id, parent_unit_id, name, unit_code) VALUES
            (2, 2, NULL, 'Manajemen Operasional', 'MGR-MANA-38'),
            (3, 2, NULL, 'Manajemen Arsip', 'MGR-MANA-15'),
            (6, 2, 2, 'Information Technology', 'IT'),
            (7, 2, 2, 'Sarana Prasarana', 'SARRAS'),
            (12, 2, 3, 'Arsip 1', 'ARS1'),
            (13, 2, 3, 'Arsip 2', 'ARS2');
        `);
        console.log('[SEEDER] Data units berhasil dimasukkan.');

        // ==========================================
        // 4. SEED TABEL: users
        // ==========================================
        await client.query(`
            INSERT INTO users (id, branch_id, unit_id, supervisor_id, nip, name, password, role, profile_picture) VALUES
            (2, 2, 2, NULL, 'budi', 'Budi Mgr Opr', $1, 'manager', NULL),
            (3, 2, 6, 2, 'Rudi', 'Rudi SPV IT', $1, 'supervisor', NULL),
            (4, 2, 7, 2, 'Sudi', 'Sudi SPV Sarpras', $1, 'supervisor', NULL),
            (5, 2, 6, 3, 'Studi', 'Studi IT', $1, 'staf', NULL),
            (6, 2, 7, 4, 'Sbudi', 'Sbudi Sarpras', $1, 'staf', NULL),
            (7, 2, 3, NULL, 'Ari', 'Ari Mgr Arsip', $1, 'manager', NULL),
            (8, 2, 12, 7, 'Ari1', 'Ari 1 SPV Arsip', $1, 'supervisor', NULL),
            (9, 2, 13, 7, 'Ari2', 'Ari 2 SPV Arsip', $1, 'supervisor', NULL),
            (10, 2, 12, 8, 'Sari1', 'Sari 1 Arsip', $1, 'staf', NULL),
            (11, 2, 13, 9, 'Sari2', 'Sari 2 Arsip', $1, 'staf', NULL),
            (12, 2, NULL, NULL, '000001', 'Admin Cabang IC 1', $1, 'admin_cabang', NULL);
        `, [hashedPassword]);
        console.log('[SEEDER] Data users berhasil dimasukkan.');

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