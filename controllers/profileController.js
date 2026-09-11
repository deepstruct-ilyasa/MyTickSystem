const pool = require('../config/db');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');
const sharp = require('sharp'); // <-- Import sharp untuk auto-compress

// 1. Tampilkan Halaman Edit Profil Sendiri
exports.getProfile = async (req, res) => {
    try {
        const userId = req.session.user.id;
        const { rows } = await pool.query(
            `SELECT u.id, u.nip, u.name, u.role, u.profile_picture, b.name as branch_name, un.name as unit_name 
             FROM users u
             LEFT JOIN branches b ON u.branch_id = b.id
             LEFT JOIN units un ON u.unit_id = un.id
             WHERE u.id = $1`,
            [userId]
        );

        res.render('layouts/main', {
            title: 'Profil - MyTickSystem',
            user: req.session.user,
            partialsPath: '../pages/profile',
            profileUser: rows[0],
            error: req.query.error || null,
            success: req.query.success || null
        });
    } catch (err) {
        console.error('[PROFILE ERROR]', err);
        res.status(500).send('Terjadi kesalahan server.');
    }
};

// 2. Proses Update Profil (Nama, Password, & Auto-Convert Foto Profil via Sharp)
exports.updateProfile = async (req, res) => {
    const userId = req.session.user.id;
    const { name, current_password, new_password, confirm_password } = req.body;

    try {
        const { rows } = await pool.query('SELECT * FROM users WHERE id = $1', [userId]);
        const user = rows[0];

        // 1. Jika ada upload foto baru, proses kompresi otomatis menggunakan Sharp
        if (req.file) {
            const nip = req.session.user && req.session.user.nip ? req.session.user.nip : 'unknown';
            const branchCode = req.session.user && req.session.user.branch_code ? req.session.user.branch_code : 'HQ';
            
            // Format nama file akhir konsisten (.jpg agar ringan dan universal)
            const customFilename = `profile-${nip}-${branchCode}.jpg`;
            const uploadDir = path.join(__dirname, '../public/uploads/profile');
            
            if (!fs.existsSync(uploadDir)) {
                fs.mkdirSync(uploadDir, { recursive: true });
            }
            const outputPath = path.join(uploadDir, customFilename);

            // Hapus foto lama jika ada
            if (user.profile_picture) {
                const oldPath = path.join(uploadDir, user.profile_picture);
                if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
            }

            // AUTO-CONVERT & COMPRESS: Ubah ukuran jadi 400x400px dan kompres kualitas JPEG 80% (dijamin di bawah 2MB)
            await sharp(req.file.buffer)
                .resize(400, 400, { fit: 'cover' })
                .jpeg({ quality: 80 })
                .toFile(outputPath);

            await pool.query(`UPDATE users SET profile_picture = $1 WHERE id = $2`, [customFilename, userId]);
            req.session.user.profile_picture = customFilename;
        }

        // 2. Logika ganti password
        if (new_password && new_password.trim() !== '') {
            if (!current_password) return res.status(400).json({ success: false, message: 'Password lama wajib diisi.' });
            if (new_password !== confirm_password) return res.status(400).json({ success: false, message: 'Konfirmasi password tidak cocok.' });
            
            const isMatch = await bcrypt.compare(current_password, user.password);
            if (!isMatch) return res.status(400).json({ success: false, message: 'Password lama salah.' });

            const salt = await bcrypt.genSalt(10);
            const hashedPassword = await bcrypt.hash(new_password, salt);
            await pool.query(`UPDATE users SET password = $1 WHERE id = $2`, [hashedPassword, userId]);
        }

        // 3. Update Nama
        if (name) {
            await pool.query(`UPDATE users SET name = $1 WHERE id = $2`, [name, userId]);
            req.session.user.name = name;
        }

        // Kirim response JSON balik ke frontend
        return res.status(200).json({ 
            success: true, 
            message: 'Profil berhasil diperbarui!',
            newName: req.session.user.name,
            newPhoto: req.session.user.profile_picture
        });

    } catch (err) {
        console.error('[PROFILE UPDATE ERROR]', err);
        return res.status(500).json({ success: false, message: 'Gagal memperbarui profil.' });
    }
};