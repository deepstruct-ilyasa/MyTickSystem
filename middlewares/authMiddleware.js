// Middleware untuk memastikan user sudah login
exports.isAuthenticated = (req, res, next) => {
    if (req.session && req.session.user) {
        return next();
    }
    return res.redirect('/login');
};

// Middleware RBAC (Role-Based Access Control)
// Contoh penggunaan: hasRole(['superadmin', 'admin_cabang'])
exports.hasRole = (allowedRoles) => {
    return (req, res, next) => {
        if (!req.session || !req.session.user) {
            return res.redirect('/login');
        }

        const userRole = req.session.user.role;

        if (allowedRoles.includes(userRole)) {
            return next(); // Role diizinkan, silakan lanjut
        }

        // Jika tidak punya hak akses, kembalikan error 403 Forbidden
        return res.status(403).render('pages/error', {
            message: 'Akses ditolak! Anda tidak memiliki hak akses untuk halaman ini.'
        });
    };
};