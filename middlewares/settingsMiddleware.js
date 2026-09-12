const db = require('../config/db');

const loadSettings = async (req, res, next) => {
    try {
        const result = await db.query('SELECT key, value FROM settings');
        const settings = {};
        result.rows.forEach(row => {
            settings[row.key] = row.value;
        });

        // Masukkan ke res.locals agar bisa diakses di semua file .ejs
        res.locals.settings = settings;
        res.locals.pwaEnabled = settings.PWA_ENABLED === 'true';
        res.locals.pwaMode = settings.PWA_MODE || 'main';
        res.locals.mainUrl = settings.MAIN_URL || '';
        res.locals.secondaryUrl = settings.SECONDARY_URL || '';

        next();
    } catch (err) {
        // Fallback jika tabel settings belum siap (misal saat sebelum instalasi)
        res.locals.settings = {};
        res.locals.pwaEnabled = false;
        next();
    }
};

module.exports = loadSettings;