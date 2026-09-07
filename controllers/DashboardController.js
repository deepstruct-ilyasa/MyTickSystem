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

            if (branch_id && branch_id !== 'all') {
                whereClauses.push(`t.branch_id = $${paramIndex++}`);
                queryParams.push(branch_id);
            }

            // --- PENGAMANAN RBAC BERDASARKAN ROLE ---
            if (user.role === 'admin_cabang') {
                whereClauses.push(`t.branch_id = $${paramIndex++}`);
                queryParams.push(user.branch_id);
            } else if (user.role === 'manager' || user.role === 'supervisor') {
                if ((!unit_id || unit_id === 'all') && (!user_id || user_id === 'all')) {
                    if (activeTab === 'inbox') {
                        whereClauses.push(`t.target_unit_id IN (
                            SELECT id FROM units WHERE id = (SELECT unit_id FROM users WHERE id = $${paramIndex}) 
                            OR parent_unit_id = (SELECT unit_id FROM users WHERE id = $${paramIndex})
                        )`);
                    } else {
                        whereClauses.push(`t.creator_id IN (
                            SELECT id FROM users WHERE unit_id = (SELECT unit_id FROM users WHERE id = $${paramIndex})
                            OR unit_id IN (SELECT id FROM units WHERE parent_unit_id = (SELECT unit_id FROM users WHERE id = $${paramIndex}))
                        )`);
                    }
                    queryParams.push(user.id);
                    paramIndex++;
                }
            } else if (user.role !== 'superadmin') {
                if ((!unit_id || unit_id === 'all') && (!user_id || user_id === 'all')) {
                    if (activeTab === 'inbox') {
                        whereClauses.push(`t.target_unit_id = $${paramIndex++}`);
                    } else {
                        whereClauses.push(`t.creator_id IN (SELECT id FROM users WHERE unit_id = $${paramIndex++})`);
                    }
                    queryParams.push(user.unit_id);
                }
            }

            // --- LOGIKA PEMISAHAN KETAT INBOX VS OUTBOX ---
            if (activeTab === 'inbox') {
                if (user_id && user_id !== 'all') {
                    whereClauses.push(`t.target_unit_id IN (SELECT unit_id FROM users WHERE id = $${paramIndex})`);
                    queryParams.push(user_id);
                    paramIndex++;
                } else if (unit_id && unit_id !== 'all') {
                    whereClauses.push(`t.target_unit_id = $${paramIndex++}`);
                    queryParams.push(unit_id);
                } else if (manager_id && manager_id !== 'all') {
                    whereClauses.push(`t.target_unit_id IN (
                        SELECT id FROM units WHERE id = (SELECT unit_id FROM users WHERE id = $${paramIndex}) 
                        OR parent_unit_id = (SELECT unit_id FROM users WHERE id = $${paramIndex})
                    )`);
                    queryParams.push(manager_id);
                    paramIndex++;
                }
            } else {
                if (user_id && user_id !== 'all') {
                    whereClauses.push(`t.creator_id = $${paramIndex++}`);
                    queryParams.push(user_id);
                    paramIndex++;
                } else if (unit_id && unit_id !== 'all') {
                    whereClauses.push(`t.creator_id IN (SELECT id FROM users WHERE unit_id = $${paramIndex++})`);
                    queryParams.push(unit_id);
                } else if (manager_id && manager_id !== 'all') {
                    whereClauses.push(`t.creator_id IN (
                        SELECT id FROM users WHERE unit_id = (SELECT unit_id FROM users WHERE id = $${paramIndex})
                        OR unit_id IN (SELECT id FROM units WHERE parent_unit_id = (SELECT unit_id FROM users WHERE id = $${paramIndex}))
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
                    COUNT(CASE WHEN t.status = 'Process' THEN 1 END) as total_process,
                    COUNT(CASE WHEN t.status = 'Resolved' THEN 1 END) as total_resolved,
                    COUNT(CASE WHEN t.status = 'Closed' THEN 1 END) as total_closed
                FROM tickets t
                LEFT JOIN units u_target ON t.target_unit_id = u_target.id
                ${whereString}
            `;
            const statsRes = await pool.query(statsQuery, queryParams);
            const stats = statsRes.rows[0];

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
                LEFT JOIN units u_origin ON u_creator.unit_id = u_origin.id
                LEFT JOIN units u_target ON t.target_unit_id = u_target.id
                ${whereString}
                ORDER BY t.created_at DESC
                LIMIT 5
            `;
            const recentRes = await pool.query(recentQuery, queryParams);

            const branchesRes = await pool.query('SELECT id, name FROM branches ORDER BY name ASC');
            const managersRes = await pool.query("SELECT id, name FROM users WHERE role = 'manager' ORDER BY name ASC");

            // --- Kueri Units Berdasarkan Role ---
            let unitsQuery = "SELECT id, name FROM units WHERE 1=1";
            let unitsParams = [];
            if (user.role === 'manager' || user.role === 'supervisor') {
                unitsQuery += " AND (id = (SELECT unit_id FROM users WHERE id = $1) OR parent_unit_id = (SELECT unit_id FROM users WHERE id = $1))";
                unitsParams.push(user.id);
            }
            unitsQuery += " ORDER BY name ASC";
            const unitsRes = await pool.query(unitsQuery, unitsParams);

            // --- Kueri Users Berdasarkan Role ---
            let usersQuery = "SELECT id, name FROM users WHERE 1=1";
            let usersParams = [];
            if (user.role === 'manager' || user.role === 'supervisor') {
                usersQuery += " AND (unit_id = (SELECT unit_id FROM users WHERE id = $1) OR unit_id IN (SELECT id FROM units WHERE parent_unit_id = (SELECT unit_id FROM users WHERE id = $1)))";
                usersParams.push(user.id);
            } else if (user.role !== 'superadmin' && user.role !== 'admin_cabang') {
                usersQuery += " AND unit_id = $1";
                usersParams.push(user.unit_id);
            }
            usersQuery += " ORDER BY name ASC";
            const usersRes = await pool.query(usersQuery, usersParams);

            res.render('layouts/main', {
                title: 'Dashboard - Ticketing System',
                user: user,
                partialsPath: '../pages/dashboard',
                stats: stats,
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

            if (user.role === 'admin_cabang') {
                whereClauses.push(`t.branch_id = $${paramIndex++}`);
                queryParams.push(user.branch_id);
            } else if (user.role === 'manager' || user.role === 'supervisor') {
                if ((!unit_id || unit_id === 'all') && (!user_id || user_id === 'all')) {
                    if (activeTab === 'inbox') {
                        whereClauses.push(`t.target_unit_id IN (
                            SELECT id FROM units WHERE id = (SELECT unit_id FROM users WHERE id = $${paramIndex}) 
                            OR parent_unit_id = (SELECT unit_id FROM users WHERE id = $${paramIndex})
                        )`);
                    } else {
                        whereClauses.push(`t.creator_id IN (
                            SELECT id FROM users WHERE unit_id = (SELECT unit_id FROM users WHERE id = $${paramIndex})
                            OR unit_id IN (SELECT id FROM units WHERE parent_unit_id = (SELECT unit_id FROM users WHERE id = $${paramIndex}))
                        )`);
                    }
                    queryParams.push(user.id);
                    paramIndex++;
                }
            } else if (user.role !== 'superadmin') {
                if ((!unit_id || unit_id === 'all') && (!user_id || user_id === 'all')) {
                    if (activeTab === 'inbox') {
                        whereClauses.push(`t.target_unit_id = $${paramIndex++}`);
                    } else {
                        whereClauses.push(`t.creator_id IN (SELECT id FROM users WHERE unit_id = $${paramIndex++})`);
                    }
                    queryParams.push(user.unit_id);
                }
            }

            if (activeTab === 'inbox') {
                if (user_id && user_id !== 'all') {
                    whereClauses.push(`t.target_unit_id IN (SELECT unit_id FROM users WHERE id = $${paramIndex})`);
                    queryParams.push(user_id);
                    paramIndex++;
                } else if (unit_id && unit_id !== 'all') {
                    whereClauses.push(`t.target_unit_id = $${paramIndex++}`);
                    queryParams.push(unit_id);
                } else if (manager_id && manager_id !== 'all') {
                    whereClauses.push(`t.target_unit_id IN (
                        SELECT id FROM units WHERE id = (SELECT unit_id FROM users WHERE id = $${paramIndex}) 
                        OR parent_unit_id = (SELECT unit_id FROM users WHERE id = $${paramIndex})
                    )`);
                    queryParams.push(manager_id);
                    paramIndex++;
                }
            } else {
                if (user_id && user_id !== 'all') {
                    whereClauses.push(`t.creator_id = $${paramIndex++}`);
                    queryParams.push(user_id);
                    paramIndex++;
                } else if (unit_id && unit_id !== 'all') {
                    whereClauses.push(`t.creator_id IN (SELECT id FROM users WHERE unit_id = $${paramIndex++})`);
                    queryParams.push(unit_id);
                } else if (manager_id && manager_id !== 'all') {
                    whereClauses.push(`t.creator_id IN (
                        SELECT id FROM users WHERE unit_id = (SELECT unit_id FROM users WHERE id = $${paramIndex})
                        OR unit_id IN (SELECT id FROM units WHERE parent_unit_id = (SELECT unit_id FROM users WHERE id = $${paramIndex}))
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
                    COUNT(CASE WHEN t.status = 'Process' THEN 1 END) as total_process,
                    COUNT(CASE WHEN t.status = 'Resolved' THEN 1 END) as total_resolved,
                    COUNT(CASE WHEN t.status = 'Closed' THEN 1 END) as total_closed
                FROM tickets t
                LEFT JOIN units u_target ON t.target_unit_id = u_target.id
                ${whereString}
            `;
            const statsRes = await pool.query(statsQuery, queryParams);

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
                LEFT JOIN units u_origin ON u_creator.unit_id = u_origin.id
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

            // --- Cascading Dropdown Units (Filtered by Role) ---
            let unitsQuery = "SELECT id, name FROM units WHERE 1=1";
            let unitsParams = [];
            let uIdx = 1;
            if (user.role === 'manager' || user.role === 'supervisor') {
                unitsQuery += ` AND (id = (SELECT unit_id FROM users WHERE id = $${uIdx}) OR parent_unit_id = (SELECT unit_id FROM users WHERE id = $${uIdx}))`;
                unitsParams.push(user.id);
                uIdx++;
            } else {
                if (branch_id && branch_id !== 'all') {
                    unitsQuery += ` AND branch_id = $${uIdx++}`;
                    unitsParams.push(branch_id);
                }
                if (manager_id && manager_id !== 'all') {
                    unitsQuery += ` AND (
                        id = (SELECT unit_id FROM users WHERE id = $${uIdx}) 
                        OR parent_unit_id = (SELECT unit_id FROM users WHERE id = $${uIdx})
                    )`;
                    unitsParams.push(manager_id);
                    uIdx++;
                }
            }
            unitsQuery += " ORDER BY name ASC";
            const unitsRes = await pool.query(unitsQuery, unitsParams);

            // --- Cascading Dropdown Users (Filtered by Role) ---
            let usersQuery = "SELECT id, name FROM users WHERE 1=1";
            let usersParams = [];
            let usrIdx = 1;
            if (user.role === 'manager' || user.role === 'supervisor') {
                usersQuery += ` AND (unit_id = (SELECT unit_id FROM users WHERE id = $${usrIdx}) OR unit_id IN (SELECT id FROM units WHERE parent_unit_id = (SELECT unit_id FROM users WHERE id = $${usrIdx})))`;
                usersParams.push(user.id);
                usrIdx++;
            } else {
                if (branch_id && branch_id !== 'all') {
                    usersQuery += ` AND branch_id = $${usrIdx++}`;
                    usersParams.push(branch_id);
                }
                if (manager_id && manager_id !== 'all') {
                    usersQuery += ` AND (
                        unit_id = (SELECT unit_id FROM users WHERE id = $${usrIdx}) 
                        OR unit_id IN (SELECT id FROM units WHERE parent_unit_id = (SELECT unit_id FROM users WHERE id = $${usrIdx}))
                        OR supervisor_id = $${usrIdx}
                    )`;
                    usersParams.push(manager_id);
                    usrIdx++;
                }
            }
            if (unit_id && unit_id !== 'all') {
                usersQuery += ` AND unit_id = $${usrIdx++}`;
                usersParams.push(unit_id);
            }
            usersQuery += " ORDER BY name ASC";
            const usersRes = await pool.query(usersQuery, usersParams);

            res.json({ 
                success: true, 
                stats: statsRes.rows[0],
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