const { Pool } = require('pg');
require('dotenv').config();

// Menggunakan Pool agar koneksi ke database lebih efisien (bisa dipakai berulang kali)
const pool = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT,
});

// Test Koneksi
pool.connect((err, client, release) => {
    if (err) {
        return console.error('[DB ERROR] Gagal terkoneksi ke PostgreSQL:', err.stack);
    }
    console.log(`[DB SUCCESS] Berhasil terkoneksi ke database: ${process.env.DB_NAME}`);
    release(); // Lepaskan kembali client ke pool
});

module.exports = pool;