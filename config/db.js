const { Pool } = require('pg');
require('dotenv').config();

const getDbConfig = () => {
    return {
        user: process.env.DB_USER || '',
        host: process.env.DB_HOST || 'localhost',
        database: process.env.DB_NAME || '',
        password: process.env.DB_PASSWORD || '',
        port: process.env.DB_PORT ? parseInt(process.env.DB_PORT) : 5432,
    };
};

let pool = new Pool(getDbConfig());

const refreshPool = () => {
    try {
        pool.end();
    } catch (e) {}
    pool = new Pool(getDbConfig());
};

// Test Koneksi awal
pool.query('SELECT NOW()', (err) => {
    if (err) {
        console.warn('[DB WARNING] Database belum terhubung saat start awal. Akan diinisialisasi ulang setelah Setup Wizard selesai.');
    } else {
        console.log(`[DB SUCCESS] Berhasil terkoneksi ke database: ${process.env.DB_NAME || 'Unknown'}`);
    }
});

// Pastikan module.exports mengekspor fungsi-fungsi ini dengan benar
module.exports = {
    query: (text, params) => pool.query(text, params),
    getClient: () => pool.connect(),
    refreshPool
};