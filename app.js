require('dotenv').config();
require('./config/db.js');
const express = require('express');
const path = require('path');
const session = require('express-session');
const pool = require('./config/db');

// Import Utility & Middleware
const initializeDatabase = require('./utils/initDb');
const checkSetup = require('./middlewares/checkSetup');
const { isAuthenticated } = require('./middlewares/authMiddleware');
const loadSettings = require('./middlewares/settingsMiddleware');

// Import Routes
const setupRoutes = require('./routes/setupRoutes');
const authRoutes = require('./routes/authRoutes');
const dashboardRoutes = require('./routes/dashboardRoutes'); // <-- Route Dashboard terpisah
const ticketRoutes = require('./routes/ticketRoutes');       // <-- Jangan lupa pastikan route ticket juga di-import jika belum
const branchRoutes = require('./routes/branchRoutes');
const unitRoutes = require('./routes/unitRoutes');
const userRoutes = require('./routes/userRoutes');
const profileRoutes = require('./routes/profileRoutes');
const settingsRoutes = require('./routes/settingsRoutes');


const app = express();
const PORT = process.env.PORT || 4000;

// Jalankan auto-migrasi database saat server baru pertama kali menyala
initializeDatabase();

// ==========================================
// 1. SETUP MIDDLEWARE DASAR
// ==========================================
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ==========================================
// 2. SETUP VIEW ENGINE (EJS)
// ==========================================
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// ==========================================
// 3. SETUP SESSION
// ==========================================
app.use(session({
    secret: process.env.SESSION_SECRET || 'SecretSuperKuat2026',
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false }
}));

// ==========================================
// 4. MIDDLEWARE CHECK SETUP (PENJAGA PINTU)
// ==========================================
app.use(checkSetup);

// ==========================================
// 5. ROUTING APLIKASI
// ==========================================
app.use(loadSettings);
app.use('/setup', setupRoutes);
app.use('/', authRoutes);
app.use('/', dashboardRoutes);           // <-- Menangani rute '/' dan '/dashboard' via DashboardController
app.use('/tickets', ticketRoutes);       // <-- Menangani rute manajemen tiket
app.use('/branches', branchRoutes);
app.use('/units', unitRoutes);
app.use('/users', userRoutes);
app.use('/profile', profileRoutes);
app.use('/settings', settingsRoutes);

// ==========================================
// 5.1 TAMBAHAN ENDPOINT API NOTIFIKASI
// ==========================================
// 1. API: Ambil daftar notifikasi user yang login
app.get('/api/notifications', async (req, res) => {
    try {
        if (!req.session || !req.session.user) {
            return res.status(401).json({ success: false, error: 'Unauthorized' });
        }
        
        const userId = req.session.user.id;
        
        const notifs = await pool.query(
            `SELECT * FROM notifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT 10`,
            [userId]
        );
        
        const unreadCount = await pool.query(
            `SELECT COUNT(*) FROM notifications WHERE user_id = $1 AND is_read = FALSE`,
            [userId]
        );

        res.json({
            success: true,
            notifications: notifs.rows,
            unreadCount: parseInt(unreadCount.rows[0].count)
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// 2. API: Tandai semua notifikasi sudah dibaca
app.post('/api/notifications/read-all', async (req, res) => {
    try {
        if (!req.session || !req.session.user) {
            return res.status(401).json({ success: false, error: 'Unauthorized' });
        }

        const userId = req.session.user.id;
        await pool.query(`UPDATE notifications SET is_read = TRUE WHERE user_id = $1`, [userId]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// 3. API: Tandai SATU notifikasi spesifik sudah dibaca berdasarkan ID
app.post('/api/notifications/:id/read', async (req, res) => {
    try {
        if (!req.session || !req.session.user) {
            return res.status(401).json({ success: false, error: 'Unauthorized' });
        }

        const notifId = req.params.id;
        const userId = req.session.user.id;

        // Update status is_read hanya untuk notifikasi milik user tersebut yang dipilih
        await pool.query(
            `UPDATE notifications SET is_read = TRUE WHERE id = $1 AND user_id = $2`,
            [notifId, userId]
        );

        res.json({ success: true });
    } catch (err) {
        console.error('[API Error] Gagal update single notification:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});


app.get('/offline', (req, res) => {
    res.render('layouts/main', {
        title: 'Offline - MyTickSystem',
        user: req.session.user || { role: 'guest' }, // Berikan fallback role guest
        partialsPath: '../pages/offline',
        error: null,
        success: null
    });
});

// ==========================================
// 6. JALANKAN SERVER
// ==========================================
app.listen(PORT, '0.0.0.0', () => {
    console.log(`[SERVER] Aplikasi berjalan di http://0.0.0.0:${PORT}`);
    console.log(`[ENV] Mode: ${process.env.NODE_ENV || 'development'}`);
});