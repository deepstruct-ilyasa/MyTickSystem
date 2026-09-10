const pool = require('../config/db');

async function createNotification(userId, ticketId, title, message) {
    try {
        await pool.query(
            `INSERT INTO notifications (user_id, ticket_id, title, message) VALUES ($1, $2, $3, $4)`,
            [userId, ticketId, title, message]
        );
    } catch (err) {
        console.error('Gagal membuat notifikasi:', err);
    }
}

async function notifyHierarchical(targetUnitId, branchId, ticketId, title, baseMessage, excludeUserId = null) {
    try {
        const targetUserIds = new Set();

        // 1. Ambil nama unit tujuan
        const unitRes = await pool.query(`SELECT name FROM units WHERE id = $1`, [targetUnitId]);
        const targetUnitName = unitRes.rows[0]?.name || 'Unit Terkait';

        // 2. Ambil user di Unit Tujuan (Staf & Supervisor/SPV)
        const unitUsers = await pool.query(
            `SELECT id FROM users WHERE unit_id = $1`, 
            [targetUnitId]
        );
        unitUsers.rows.forEach(u => targetUserIds.add(u.id));

        // 3. Ambil Manager yang membawahi unit ini
        const managerQuery = await pool.query(`
            SELECT id FROM users 
            WHERE role = 'manager' 
            AND (
                unit_id = $1 
                OR unit_id IN (SELECT parent_unit_id FROM units WHERE id = $1)
                OR id IN (
                    SELECT supervisor_id FROM users WHERE unit_id = $1
                )
            )
        `, [targetUnitId]);
        managerQuery.rows.forEach(u => targetUserIds.add(u.id));

        // 4. Ambil Admin Cabang di cabang tersebut
        const adminCabangQuery = await pool.query(
            `SELECT id FROM users WHERE branch_id = $1 AND role = 'admin_cabang'`,
            [branchId]
        );
        adminCabangQuery.rows.forEach(u => targetUserIds.add(u.id));

        // 5. Ambil Superadmin (global)
        const superadminQuery = await pool.query(
            `SELECT id FROM users WHERE role = 'superadmin'`
        );
        superadminQuery.rows.forEach(u => targetUserIds.add(u.id));

        // Ambil nama cabang untuk superadmin
        const branchRes = await pool.query(`SELECT name FROM branches WHERE id = $1`, [branchId]);
        const branchName = branchRes.rows[0]?.name ? ` [Cabang: ${branchRes.rows[0].name}]` : '';

        // Kirim notifikasi dengan pesan yang disesuaikan berdasarkan role penerima
        for (const userId of targetUserIds) {
            if (excludeUserId && parseInt(userId) === parseInt(excludeUserId)) {
                continue; 
            }

            const userCheck = await pool.query(`SELECT role FROM users WHERE id = $1`, [userId]);
            const userRole = userCheck.rows[0]?.role;

            let finalMessage = baseMessage;

            // Jika role SPV ke atas, ubah "unit Anda" menjadi nama unit tujuannya
            if (['supervisor', 'manager', 'admin_cabang', 'superadmin'].includes(userRole)) {
                finalMessage = finalMessage.replace('ditujukan ke unit Anda', `ditujukan ke unit ${targetUnitName}`);
            }

            if (userRole === 'superadmin') {
                finalMessage += `${branchName}`;
            }

            await createNotification(userId, ticketId, title, finalMessage);
        }
    } catch (err) {
        console.error('Gagal mengirim notifikasi hierarki:', err);
    }
}

module.exports = { createNotification, notifyHierarchical };