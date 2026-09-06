require('dotenv').config();
require('./config/db.js');
const express = require('express');
const path = require('path');
const session = require('express-session');

// Import Utility & Middleware
const initializeDatabase = require('./utils/initDb');
const checkSetup = require('./middlewares/checkSetup');
const { isAuthenticated } = require('./middlewares/authMiddleware');

// Import Routes
const setupRoutes = require('./routes/setupRoutes');
const authRoutes = require('./routes/authRoutes');
const branchRoutes = require('./routes/branchRoutes');
const unitRoutes = require('./routes/unitRoutes');
const userRoutes = require('./routes/userRoutes');
const profileRoutes = require('./routes/profileRoutes');
const ticketRoutes = require('./routes/ticketRoutes');

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
app.use('/setup', setupRoutes);
app.use('/', authRoutes);
app.use('/branches', branchRoutes);
app.use('/units', unitRoutes);
app.use('/users', userRoutes);
app.use('/profile', profileRoutes);
app.use('/tickets', ticketRoutes);


app.get('/', isAuthenticated, (req, res) => {
    res.redirect('/dashboard');
});

app.get('/dashboard', isAuthenticated, (req, res) => {
    res.render('layouts/main', { 
        title: 'Dashboard - Ticketing System',
        user: req.session.user,
        partialsPath: '../pages/dashboard' // Kirim path file view-nya di sini
    });
});


// ==========================================
// 6. JALANKAN SERVER
// ==========================================
app.listen(PORT, '0.0.0.0', () => {
    console.log(`[SERVER] Aplikasi berjalan di http://0.0.0.0:${PORT}`);
    console.log(`[ENV] Mode: ${process.env.NODE_ENV || 'development'}`);
});
