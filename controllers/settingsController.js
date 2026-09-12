const fs = require('fs');
const path = require('path');
const db = require('../config/db');

// 1. Ambil semua data settings
exports.getSettings = async (req, res) => {
    try {
        const user = req.session.user;
        const result = await db.query('SELECT * FROM settings');
        const settings = {};
        result.rows.forEach(row => {
            settings[row.key] = row.value;
        });

        res.render('layouts/main', {
            title: 'Pengaturan Sistem - MyTickSystem',
            user: user,
            partialsPath: '../pages/settings',
            settings: settings,
            error: req.query.error || null,
            success: req.query.success || null
        });
    } catch (err) {
        console.error('[SETTINGS ERROR]', err);
        res.status(500).send('Gagal memuat pengaturan.');
    }
};

// 2. Simpan perubahan settings & update .env otomatis (Hybrid Didukung Kembali)
exports.updateSettings = async (req, res) => {
    const pwa_enabled = req.body.pwa_enabled ? 'true' : 'false';
    const pwa_mode = req.body.pwa_mode;
    const main_url = req.body.main_url;
    const secondary_url = pwa_mode === 'redundant' ? (req.body.secondary_url || '') : '';

    try {
        // Update database PostgreSQL
        await db.query("UPDATE settings SET value = $1 WHERE key = 'PWA_ENABLED'", [pwa_enabled]);
        await db.query("UPDATE settings SET value = $1 WHERE key = 'PWA_MODE'", [pwa_mode]);
        await db.query("UPDATE settings SET value = $1 WHERE key = 'MAIN_URL'", [main_url]);
        await db.query("UPDATE settings SET value = $1 WHERE key = 'SECONDARY_URL'", [secondary_url]);

        // Update file .env secara otomatis di server
        const envPath = path.join(__dirname, '../.env');
        let envContent = fs.readFileSync(envPath, 'utf8');

        const updateEnvVar = (content, key, val) => {
            const regex = new RegExp(`^${key}=.*`, 'm');
            if (regex.test(content)) {
                return content.replace(regex, `${key}=${val}`);
            } else {
                return content + `\n${key}=${val}`;
            }
        };

        envContent = updateEnvVar(envContent, 'PWA_ENABLED', pwa_enabled);
        envContent = updateEnvVar(envContent, 'PWA_MODE', pwa_mode);
        envContent = updateEnvVar(envContent, 'MAIN_URL', main_url);
        envContent = updateEnvVar(envContent, 'SECONDARY_URL', secondary_url);

        fs.writeFileSync(envPath, envContent, 'utf8');

        return res.redirect('/settings?success=Pengaturan sistem berhasil diperbarui!');
    } catch (err) {
        console.error('[SETTINGS SAVE ERROR]', err);
        res.status(500).send('Gagal menyimpan pengaturan.');
    }
};