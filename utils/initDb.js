const db = require('../config/db');

const initializeDatabase = async () => {
    try {
        const client = await db.getClient();
        try {
            await client.query('BEGIN'); // Mulai transaksi

            // 1. Tabel Perusahaan (Setup Wizard)
            await client.query(`
                CREATE TABLE IF NOT EXISTS company_profile (
                    id SERIAL PRIMARY KEY,
                    name VARCHAR(255) NOT NULL,
                    logo VARCHAR(255),
                    setup_completed BOOLEAN DEFAULT FALSE
                );
            `);

            // 2. Tabel Cabang
            await client.query(`
                CREATE TABLE IF NOT EXISTS branches (
                    id SERIAL PRIMARY KEY,
                    branch_code VARCHAR(50) UNIQUE NOT NULL,
                    name VARCHAR(255) NOT NULL,
                    address TEXT
                );
            `);

            // 3. Tabel Unit (Self-Referencing untuk Hierarki)
            await client.query(`
                CREATE TABLE IF NOT EXISTS units (
                    id SERIAL PRIMARY KEY,
                    branch_id INTEGER REFERENCES branches(id) ON DELETE RESTRICT,
                    parent_unit_id INTEGER REFERENCES units(id) ON DELETE RESTRICT,
                    name VARCHAR(255) NOT NULL,
                    unit_code VARCHAR(50) NOT NULL,
                    branch_sequence INTEGER
                );
            `);

            // 4. Tabel User (Hierarki & RBAC)
            await client.query(`
                CREATE TABLE IF NOT EXISTS users (
                    id SERIAL PRIMARY KEY,
                    branch_id INTEGER REFERENCES branches(id) ON DELETE RESTRICT,
                    unit_id INTEGER REFERENCES units(id) ON DELETE RESTRICT,
                    supervisor_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
                    nip VARCHAR(100) UNIQUE NOT NULL,
                    name VARCHAR(255) NOT NULL,
                    password VARCHAR(255) NOT NULL,
                    role VARCHAR(50) NOT NULL,
                    profile_picture VARCHAR(255),
                    branch_sequence INTEGER
                );
            `);

            // 5. Tabel Master Kategori Tiket
            await client.query(`
                CREATE TABLE IF NOT EXISTS ticket_categories (
                    id SERIAL PRIMARY KEY,
                    branch_id INTEGER REFERENCES branches(id) ON DELETE CASCADE,
                    category VARCHAR(100) NOT NULL,
                    issue_description VARCHAR(255) NOT NULL,
                    created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
                    updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP
                );
            `);

            // 6. Tabel Tiket & SLA
            await client.query(`
                CREATE TABLE IF NOT EXISTS tickets (
                    id SERIAL PRIMARY KEY,
                    ticket_number VARCHAR(100) UNIQUE NOT NULL,
                    branch_id INTEGER REFERENCES branches(id) ON DELETE RESTRICT,
                    creator_id INTEGER REFERENCES users(id) ON DELETE RESTRICT,
                    creator_unit_id INTEGER REFERENCES units(id) ON DELETE RESTRICT,
                    target_unit_id INTEGER REFERENCES units(id) ON DELETE RESTRICT,
                    category VARCHAR(100) NOT NULL,
                    issue_description VARCHAR(255) NOT NULL,
                    description TEXT NOT NULL,
                    priority VARCHAR(50) NOT NULL,
                    status VARCHAR(50) DEFAULT 'Open',
                    attachment_url VARCHAR(255),
                    due_date TIMESTAMP,
                    resolved_at TIMESTAMP,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );
            `);

            // 7. Tabel Log Tiket (Eskalasi)
            await client.query(`
                CREATE TABLE IF NOT EXISTS ticket_logs (
                    id SERIAL PRIMARY KEY,
                    ticket_id INTEGER REFERENCES tickets(id) ON DELETE CASCADE,
                    actor_id INTEGER REFERENCES users(id) ON DELETE RESTRICT,
                    action VARCHAR(50) NOT NULL,
                    message TEXT,
                    previous_unit_id INTEGER REFERENCES units(id) ON DELETE SET NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );
            `);

            // 8. Tabel Sequence (Anti-bentrok penomoran tiket)
            await client.query(`
                CREATE TABLE IF NOT EXISTS ticket_sequences (
                    id SERIAL PRIMARY KEY,
                    branch_code VARCHAR(50) NOT NULL,
                    unit_code VARCHAR(50) NOT NULL,
                    date DATE NOT NULL,
                    last_sequence INTEGER NOT NULL,
                    UNIQUE(branch_code, unit_code, date)
                );
            `);

            // 9. Tabel Notifikasi In-App
            await client.query(`
                CREATE TABLE IF NOT EXISTS notifications (
                    id SERIAL PRIMARY KEY,
                    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                    ticket_id INTEGER REFERENCES tickets(id) ON DELETE CASCADE,
                    title VARCHAR(255) NOT NULL,
                    message TEXT NOT NULL,
                    is_read BOOLEAN DEFAULT FALSE,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );
            `);

            // 10. Tabel Setting
            await client.query(`
                CREATE TABLE IF NOT EXISTS settings (
                    key VARCHAR(100) PRIMARY KEY,
                    value TEXT,
                    description TEXT,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );
            `);

            // Indeks untuk mempercepat pencarian data notifikasi user
            await client.query(`
                CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
                CREATE INDEX IF NOT EXISTS idx_notifications_is_read ON notifications(is_read);
            `);

            await client.query('COMMIT'); // Simpan semua perubahan
            console.log('[DB SETUP] Migrasi tabel berhasil dijalankan dan siap digunakan!');
        } catch (err) {
            await client.query('ROLLBACK'); // Batalkan jika ada error
            console.error('[DB ERROR] Gagal migrasi tabel:', err);
        } finally {
            client.release();
        }
    } catch (dbErr) {
        console.warn('[DB WARNING] Database belum terhubung saat start awal. Akan diinisialisasi ulang setelah Setup Wizard selesai.');
    }
};

module.exports = initializeDatabase;