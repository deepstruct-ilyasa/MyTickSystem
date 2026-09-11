const pool = require('../config/db');

const DashboardController = {
    async index(req, res) {
        try {
            const user = req.session.user;
            const { branch_id, manager_id, unit_id, user_id, tab } = req.query;
            const activeTab = tab === 'outbox' ? 'outbox' : 'inbox';

            let whereClauses = [];
            let queryParams = [];
            let paramIndex = 1;

            // --- FILTER MANUAL DARI DROPDOWN ---
            if (branch_id && branch_id !== 'all') {
                whereClauses.push(`t.branch_id = $${paramIndex++}`);
                queryParams.push(branch_id);
            }

            // --- PENGAMANAN RBAC BERDASARKAN ROLE & RUANG LINGKUP ---
            if (user.role === 'superadmin') {
                // Superadmin melihat semua data
            } else if (user.role === 'admin_cabang') {
                whereClauses.push(`t.branch_id = $${paramIndex++}`);
                queryParams.push(user.branch_id);
            } else if (user.role === 'manager' || user.role === 'supervisor') {
                whereClauses.push(`t.branch_id = $${paramIndex++}`);
                queryParams.push(user.branch_id);

                if ((!unit_id || unit_id === 'all') && (!user_id || user_id === 'all')) {
                    if (activeTab === 'inbox') {
                        whereClauses.push(`t.target_unit_id IN (
                            SELECT un.id FROM units un WHERE un.id = (SELECT u.unit_id FROM users u WHERE u.id = $${paramIndex})
                            OR un.parent_unit_id = (SELECT u2.unit_id FROM users u2 WHERE u2.id = $${paramIndex})
                        )`);
                    } else {
                        whereClauses.push(`t.creator_unit_id IN (
                            SELECT un.id FROM units un WHERE un.id = (SELECT u.unit_id FROM users u WHERE u.id = $${paramIndex})
                            OR un.parent_unit_id = (SELECT u2.unit_id FROM users u2 WHERE u2.id = $${paramIndex})
                        )`);
                    }
                    queryParams.push(user.id);
                    paramIndex++;
                }
            } else {
                if ((!unit_id || unit_id === 'all') && (!user_id || user_id === 'all')) {
                    if (activeTab === 'inbox') {
                        whereClauses.push(`t.target_unit_id = (SELECT unit_id FROM users WHERE id = $${paramIndex})`);
                    } else {
                        whereClauses.push(`t.creator_unit_id = (SELECT unit_id FROM users WHERE id = $${paramIndex})`);
                    }
                    queryParams.push(user.id);
                    paramIndex++;
                }
            }

            // --- LOGIKA PEMISAHAN KETAT INBOX VS OUTBOX ---
            if (activeTab === 'inbox') {
                if (user_id && user_id !== 'all') {
                    whereClauses.push(`t.creator_id = $${paramIndex++}`);
                    queryParams.push(user_id);
                } else if (unit_id && unit_id !== 'all') {
                    whereClauses.push(`t.target_unit_id = $${paramIndex++}`);
                    queryParams.push(unit_id);
                } else if (manager_id && manager_id !== 'all') {
                    whereClauses.push(`t.target_unit_id IN (
                        SELECT id FROM units WHERE id = $${paramIndex} 
                        OR parent_unit_id = $${paramIndex}
                    )`);
                    queryParams.push(manager_id);
                    paramIndex++;
                }
            } else {
                if (user_id && user_id !== 'all') {
                    whereClauses.push(`t.creator_id = $${paramIndex++}`);
                    queryParams.push(user_id);
                } else if (unit_id && unit_id !== 'all') {
                    whereClauses.push(`t.creator_unit_id = $${paramIndex++}`);
                    queryParams.push(unit_id);
                } else if (manager_id && manager_id !== 'all') {
                    whereClauses.push(`t.creator_unit_id IN (
                        SELECT id FROM units WHERE id = $${paramIndex}
                        OR parent_unit_id = $${paramIndex}
                    )`);
                    queryParams.push(manager_id);
                    paramIndex++;
                }
            }

            let whereString = whereClauses.length > 0 ? 'WHERE ' + whereClauses.join(' AND ') : '';

            const statsQuery = `
                SELECT 
                    COUNT(*) as total_inbox,
                    COUNT(CASE WHEN t.status = 'Open' OR t.status = 'Transferred' THEN 1 END) as total_open,
                    COUNT(CASE WHEN t.status = 'Inprogress' THEN 1 END) as total_inprogress,
                    COUNT(CASE WHEN t.status = 'Resolved' THEN 1 END) as total_resolved,
                    COUNT(CASE WHEN t.status = 'Closed' THEN 1 END) as total_closed
                FROM tickets t
                LEFT JOIN units u_target ON t.target_unit_id = u_target.id
                ${whereString}
            `;
            const statsRes = await pool.query(statsQuery, queryParams);
            const stats = statsRes.rows[0];

            // --- TAMBAHAN KUERI: Top Kategori Tiket Terbanyak ---
            const categoryQuery = `
                SELECT t.category, COUNT(*) as total
                FROM tickets t
                LEFT JOIN units u_target ON t.target_unit_id = u_target.id
                ${whereString}
                GROUP BY t.category
                ORDER BY total DESC
                LIMIT 20
            `;
            const categoryRes = await pool.query(categoryQuery, queryParams);

            const recentQuery = `
                SELECT t.id, t.ticket_number, t.category, t.issue_description, 
                t.priority, t.status, t.created_at,
                u_creator.name as creator_name, 
                b_creator.name as branch_name,
                u_origin.name as creator_unit_name,
                u_target.name as target_unit_name
                FROM tickets t
                JOIN users u_creator ON t.creator_id = u_creator.id
                JOIN branches b_creator ON t.branch_id = b_creator.id
                LEFT JOIN units u_origin ON t.creator_unit_id = u_origin.id
                LEFT JOIN units u_target ON t.target_unit_id = u_target.id
                ${whereString}
                ORDER BY t.created_at DESC
                LIMIT 5
            `;
            const recentRes = await pool.query(recentQuery, queryParams);

            const branchesRes = await pool.query('SELECT id, name FROM branches ORDER BY name ASC');
            const managersRes = await pool.query("SELECT id, name FROM users WHERE role = 'manager' ORDER BY name ASC");

            let unitsQuery = "SELECT id, name FROM units WHERE 1=1";
            let unitsParams = [];
            if (user.role === 'admin_cabang') {
                unitsQuery += " AND branch_id = $1";
                unitsParams.push(user.branch_id);
            } else if (user.role === 'manager' || user.role === 'supervisor') {
                unitsQuery += " AND branch_id = $1 AND (id IN (SELECT unit_id FROM users WHERE id = $2) OR parent_unit_id IN (SELECT unit_id FROM users WHERE id = $2))";
                unitsParams.push(user.branch_id, user.id);
            }
            unitsQuery += " ORDER BY name ASC";
            const unitsRes = await pool.query(unitsQuery, unitsParams);

            let usersQuery = "SELECT id, name FROM users WHERE 1=1";
            let usersParams = [];
            if (user.role === 'admin_cabang') {
                usersQuery += " AND branch_id = $1";
                usersParams.push(user.branch_id);
            } else if (user.role === 'manager' || user.role === 'supervisor') {
                usersQuery += " AND branch_id = $1";
                usersParams.push(user.branch_id);
            } else if (branch_id && branch_id !== 'all') {
                usersQuery += " AND branch_id = $1";
                usersParams.push(branch_id);
            }
            usersQuery += " ORDER BY name ASC";
            const usersRes = await pool.query(usersQuery, usersParams);

            res.render('layouts/main', {
                title: 'Dashboard - MyTickSystem',
                user: user,
                partialsPath: '../pages/dashboard',
                stats: stats,
                topCategories: categoryRes.rows, // Dikirim ke view
                recentTickets: recentRes.rows,
                branches: branchesRes.rows,
                managers: managersRes.rows,
                units: unitsRes.rows,
                usersList: usersRes.rows,
                filters: { branch_id, manager_id, unit_id, user_id, tab: activeTab },
                error: req.query.error || null,
                success: req.query.success || null
            });
        } catch (error) {
            console.error('[DashboardController] Error memuat halaman dashboard:', error);
            res.status(500).send('Terjadi kesalahan internal server.');
        }
    },

    async getFilterOptions(req, res) {
        try {
            const user = req.session.user;
            const { branch_id, manager_id, unit_id, user_id, tab } = req.query;
            const activeTab = tab === 'outbox' ? 'outbox' : 'inbox';

            let whereClauses = [];
            let queryParams = [];
            let paramIndex = 1;

            if (branch_id && branch_id !== 'all') {
                whereClauses.push(`t.branch_id = $${paramIndex++}`);
                queryParams.push(branch_id);
            }

            if (user.role === 'superadmin') {
                // Superadmin bebas
            } else if (user.role === 'admin_cabang') {
                whereClauses.push(`t.branch_id = $${paramIndex++}`);
                queryParams.push(user.branch_id);
            } else if (user.role === 'manager' || user.role === 'supervisor') {
                whereClauses.push(`t.branch_id = $${paramIndex++}`);
                queryParams.push(user.branch_id);

                if ((!unit_id || unit_id === 'all') && (!user_id || user_id === 'all')) {
                    if (activeTab === 'inbox') {
                        whereClauses.push(`t.target_unit_id IN (
                            SELECT un.id FROM units un WHERE un.id = (SELECT u.unit_id FROM users u WHERE u.id = $${paramIndex})
                            OR un.parent_unit_id = (SELECT u2.unit_id FROM users u2 WHERE u2.id = $${paramIndex})
                        )`);
                    } else {
                        whereClauses.push(`t.creator_unit_id IN (
                            SELECT un.id FROM units un WHERE un.id = (SELECT u.unit_id FROM users u WHERE u.id = $${paramIndex})
                            OR un.parent_unit_id = (SELECT u2.unit_id FROM users u2 WHERE u2.id = $${paramIndex})
                        )`);
                    }
                    queryParams.push(user.id);
                    paramIndex++;
                }
            } else {
                if ((!unit_id || unit_id === 'all') && (!user_id || user_id === 'all')) {
                    if (activeTab === 'inbox') {
                        whereClauses.push(`t.target_unit_id = (SELECT unit_id FROM users WHERE id = $${paramIndex})`);
                    } else {
                        whereClauses.push(`t.creator_unit_id = (SELECT unit_id FROM users WHERE id = $${paramIndex})`);
                    }
                    queryParams.push(user.id);
                    paramIndex++;
                }
            }

            if (activeTab === 'inbox') {
                if (user_id && user_id !== 'all') {
                    whereClauses.push(`t.creator_id = $${paramIndex++}`);
                    queryParams.push(user_id);
                } else if (unit_id && unit_id !== 'all') {
                    whereClauses.push(`t.target_unit_id = $${paramIndex++}`);
                    queryParams.push(unit_id);
                } else if (manager_id && manager_id !== 'all') {
                    whereClauses.push(`t.target_unit_id IN (
                        SELECT id FROM units WHERE id = $${paramIndex} 
                        OR parent_unit_id = $${paramIndex}
                    )`);
                    queryParams.push(manager_id);
                    paramIndex++;
                }
            } else {
                if (user_id && user_id !== 'all') {
                    whereClauses.push(`t.creator_id = $${paramIndex++}`);
                    queryParams.push(user_id);
                } else if (unit_id && unit_id !== 'all') {
                    whereClauses.push(`t.creator_unit_id = $${paramIndex++}`);
                    queryParams.push(unit_id);
                } else if (manager_id && manager_id !== 'all') {
                    whereClauses.push(`t.creator_unit_id IN (
                        SELECT id FROM units WHERE id = $${paramIndex}
                        OR parent_unit_id = $${paramIndex}
                    )`);
                    queryParams.push(manager_id);
                    paramIndex++;
                }
            }

            let whereString = whereClauses.length > 0 ? 'WHERE ' + whereClauses.join(' AND ') : '';

            const statsQuery = `
                SELECT 
                    COUNT(*) as total_inbox,
                    COUNT(CASE WHEN t.status = 'Open' OR t.status = 'Transferred' THEN 1 END) as total_open,
                    COUNT(CASE WHEN t.status = 'Inprogress' THEN 1 END) as total_inprogress,
                    COUNT(CASE WHEN t.status = 'Resolved' THEN 1 END) as total_resolved,
                    COUNT(CASE WHEN t.status = 'Closed' THEN 1 END) as total_closed
                FROM tickets t
                LEFT JOIN units u_target ON t.target_unit_id = u_target.id
                ${whereString}
            `;
            const statsRes = await pool.query(statsQuery, queryParams);

            // --- TAMBAHAN KUERI API: Top Kategori ---
            const categoryQuery = `
                SELECT t.category, COUNT(*) as total
                FROM tickets t
                LEFT JOIN units u_target ON t.target_unit_id = u_target.id
                ${whereString}
                GROUP BY t.category
                ORDER BY total DESC
                LIMIT 5
            `;
            const categoryRes = await pool.query(categoryQuery, queryParams);

            const recentQuery = `
                SELECT t.id, t.ticket_number, t.category, t.issue_description, 
                t.priority, t.status, t.created_at,
                u_creator.name as creator_name, 
                b_creator.name as branch_name,
                u_origin.name as creator_unit_name,
                u_target.name as target_unit_name
                FROM tickets t
                JOIN users u_creator ON t.creator_id = u_creator.id
                JOIN branches b_creator ON t.branch_id = b_creator.id
                LEFT JOIN units u_origin ON t.creator_unit_id = u_origin.id
                LEFT JOIN units u_target ON t.target_unit_id = u_target.id
                ${whereString}
                ORDER BY t.created_at DESC
                LIMIT 5
            `;
            const recentRes = await pool.query(recentQuery, queryParams);

            let managersQuery = "SELECT id, name FROM users WHERE role = 'manager'";
            let managersParams = [];
            if (branch_id && branch_id !== 'all') {
                managersQuery += " AND branch_id = $1";
                managersParams.push(branch_id);
            }
            managersQuery += " ORDER BY name ASC";
            const managersRes = await pool.query(managersQuery, managersParams);

            let unitsQuery = "SELECT id, name FROM units WHERE 1=1";
            let unitsParams = [];
            if (user.role === 'admin_cabang') {
                unitsQuery += " AND branch_id = $1";
                unitsParams.push(user.branch_id);
            } else if (user.role === 'manager' || user.role === 'supervisor') {
                unitsQuery += " AND branch_id = $1";
                unitsParams.push(user.branch_id);
            } else if (branch_id && branch_id !== 'all') {
                unitsQuery += " AND branch_id = $1";
                unitsParams.push(branch_id);
            }
            unitsQuery += " ORDER BY name ASC";
            const unitsRes = await pool.query(unitsQuery, unitsParams);

            let usersQuery = "SELECT id, name FROM users WHERE 1=1";
            let usersParams = [];
            if (user.role === 'admin_cabang') {
                usersQuery += " AND branch_id = $1";
                usersParams.push(user.branch_id);
            } else if (user.role === 'manager' || user.role === 'supervisor') {
                usersQuery += " AND branch_id = $1";
                usersParams.push(user.branch_id);
            } else if (branch_id && branch_id !== 'all') {
                usersQuery += " AND branch_id = $1";
                usersParams.push(branch_id);
            }
            usersQuery += " ORDER BY name ASC";
            const usersRes = await pool.query(usersQuery, usersParams);

            res.json({ 
                success: true, 
                stats: statsRes.rows[0],
                topCategories: categoryRes.rows, // Dikirim via API JSON
                recentTickets: recentRes.rows,
                managers: managersRes.rows, 
                units: unitsRes.rows, 
                users: usersRes.rows 
            });
        } catch (error) {
            console.error('[DashboardController] Error fetch filter options:', error);
            res.status(500).json({ success: false, message: 'Internal server error' });
        }
    }
};

module.exports = DashboardController;