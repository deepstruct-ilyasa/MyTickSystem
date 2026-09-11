const pool = require('../config/db');
const fs = require('fs');
const path = require('path');
const { createNotification, notifyHierarchical } = require('../utils/notificationHelper');
const sharp = require('sharp');

const TicketController = {
    async renderCreateForm(req, res) {
        try {
            const user = req.session.user;

            if (user.role === 'admin_cabang') {
                return res.redirect('/tickets?error=Admin Cabang tidak dapat membuat ticket.');
            }

            // [PERBAIKAN] Kategori yang muncul saat buat tiket difilter sesuai branch_id user yang login
            const categoryQuery = await pool.query(
                'SELECT category, issue_description FROM ticket_categories WHERE branch_id = $1 ORDER BY category ASC',
                [user.branch_id]
            );
            
            const unitQuery = await pool.query(`
                SELECT u.id, u.name, b.name as branch_name 
                FROM units u
                JOIN branches b ON u.branch_id = b.id
                ORDER BY b.name ASC, u.name ASC
            `);

            res.render('layouts/main', {
                title: 'Buat Tiket Baru - Ticketing System',
                user: user,
                partialsPath: '../pages/tickets/create',
                ticketCategories: categoryQuery.rows,
                units: unitQuery.rows,
                error: req.query.error || null,
                success: req.query.success || null
            });
        } catch (error) {
            console.error('[TicketController] Error memuat form tiket:', error);
            res.status(500).send('Terjadi kesalahan internal server.');
        }
    },

    async listTicketsUnified(req, res) {
        try {
            const user = req.session.user;

            let inboxQuery = `
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
                JOIN units u_target ON t.target_unit_id = u_target.id
            `;
            let inboxParams = [];

            let outboxQuery = `
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
                JOIN units u_target ON t.target_unit_id = u_target.id
            `;
            let outboxParams = [];

            if (user.role === 'superadmin') {
                // Superadmin melihat semua
            } else if (user.role === 'admin_cabang') {
                inboxQuery += ' WHERE t.branch_id = $1';
                inboxParams = [user.branch_id];
                
                outboxQuery += ' WHERE t.branch_id = $1';
                outboxParams = [user.branch_id];
            } else if (user.role === 'manager' || user.role === 'supervisor') {
                inboxQuery += ' WHERE t.target_unit_id IN (SELECT id FROM units WHERE id = $1 OR parent_unit_id = $1)';
                inboxParams = [user.unit_id];
                
                outboxQuery += ' WHERE t.creator_unit_id IN (SELECT id FROM units WHERE id = $1 OR parent_unit_id = $1)';
                outboxParams = [user.unit_id];
            } else {
                inboxQuery += ' WHERE t.target_unit_id = $1';
                inboxParams = [user.unit_id];
                
                outboxQuery += ' WHERE t.creator_unit_id = $1';
                outboxParams = [user.unit_id];
            }

            inboxQuery += ' ORDER BY t.created_at DESC';
            outboxQuery += ' ORDER BY t.created_at DESC';
            
            const inboxRes = await pool.query(inboxQuery, inboxParams);
            const outboxRes = await pool.query(outboxQuery, outboxParams);

            res.render('layouts/main', {
                title: 'Manajemen Tiket - Ticketing System',
                user: user,
                partialsPath: '../pages/tickets/index',
                inboxTickets: inboxRes.rows,
                outboxTickets: outboxRes.rows,
                error: req.query.error || null,
                success: req.query.success || null
            });
        } catch (error) {
            console.error('[TicketController] Error memuat halaman tiket:', error);
            res.status(500).send('Terjadi kesalahan internal server.');
        }
    },

    async createTicket(req, res) {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            const user = req.session.user;

            if (user.role === 'admin_cabang') {
                return res.redirect('/tickets?error=Aksi ditolak. Admin Cabang tidak diizinkan membuat tiket.');
            }

            const { category, issue_description, custom_issue, target_unit_id, priority, details } = req.body;
            
            const finalIssueDesc = issue_description === 'Lainnya' ? custom_issue : issue_description;

            const creatorInfo = await client.query(`
                SELECT b.branch_code, u.unit_code 
                FROM users us
                JOIN branches b ON us.branch_id = b.id
                JOIN units u ON us.unit_id = u.id
                WHERE us.id = $1
            `, [user.id]);

            const branchCode = creatorInfo.rows[0]?.branch_code || 'HQ';
            const unitCode = creatorInfo.rows[0]?.unit_code || 'GEN';
            const todayStr = new Date().toISOString().slice(0, 10);

            let sequenceNumber = 1;
            const seqCheck = await client.query(`
                SELECT last_sequence FROM ticket_sequences 
                WHERE branch_code = $1 AND unit_code = $2 AND date = $3::date
                FOR UPDATE
            `, [branchCode, unitCode, todayStr]);

            if (seqCheck.rows.length > 0) {
                sequenceNumber = seqCheck.rows[0].last_sequence + 1;
                await client.query(`
                    UPDATE ticket_sequences SET last_sequence = $1 
                    WHERE branch_code = $2 AND unit_code = $3 AND date = $4::date
                `, [sequenceNumber, branchCode, unitCode, todayStr]);
            } else {
                await client.query(`
                    INSERT INTO ticket_sequences (branch_code, unit_code, date, last_sequence) 
                    VALUES ($1, $2, $3::date, $4)
                `, [branchCode, unitCode, todayStr, sequenceNumber]);
            }

            const paddedSeq = String(sequenceNumber).padStart(3, '0');
            const dateFormatted = todayStr.replace(/-/g, '');
            const ticketNumber = `${branchCode}-${unitCode}-${dateFormatted}-${paddedSeq}`;

            let attachmentUrl = null;
            if (req.file) {
                const uploadDir = path.join(__dirname, '../public/uploads/tickets');
                
                // Buat folder otomatis jika belum ada
                if (!fs.existsSync(uploadDir)) {
                    fs.mkdirSync(uploadDir, { recursive: true });
                }

                const mimeType = req.file.mimetype;
                const finalExt = mimeType === 'application/pdf' ? '.pdf' : '.jpg';
                const newFilename = `${ticketNumber}-Lampiran${finalExt}`;
                const outputPath = path.join(uploadDir, newFilename);

                // Jika berupa gambar, kompres otomatis via Sharp (< 2MB)
                if (mimeType.startsWith('image/')) {
                    await sharp(req.file.buffer)
                        .resize(1200, 1200, { fit: 'inside', withoutEnlargement: true })
                        .jpeg({ quality: 80 })
                        .toFile(outputPath);
                    
                    attachmentUrl = `/uploads/tickets/${newFilename}`;
                } else if (mimeType === 'application/pdf') {
                    // Jika PDF, simpan langsung dari buffer RAM
                    fs.writeFileSync(outputPath, req.file.buffer);
                    attachmentUrl = `/uploads/tickets/${newFilename}`;
                }
            }

            const insertTicketQuery = `
                INSERT INTO tickets (
                    ticket_number, branch_id, creator_unit_id, creator_id, target_unit_id, 
                    category, issue_description, description, priority, 
                    status, attachment_url, created_at
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'Open', $10, CURRENT_TIMESTAMP)
                RETURNING id;
            `;

            const ticketResult = await client.query(insertTicketQuery, [
                ticketNumber,
                user.branch_id,
                user.unit_id,
                user.id,
                target_unit_id,
                category,
                finalIssueDesc,
                details,
                priority,
                attachmentUrl
            ]);

            const ticketId = ticketResult.rows[0].id;

            await client.query(`
                INSERT INTO ticket_logs (ticket_id, actor_id, action, message, created_at)
                VALUES ($1, $2, 'CREATE', 'Tiket berhasil dibuat dan dikirim ke unit terkait.', CURRENT_TIMESTAMP)
            `, [ticketId, user.id]);

            await client.query('COMMIT');

            await notifyHierarchical(
                target_unit_id, 
                user.branch_id,
                ticketId, 
                'Tiket Masuk Baru', 
                `Ada tiket baru (${ticketNumber}) dengan prioritas ${priority} ditujukan ke unit Anda.`,
                user.id
            );

            res.redirect('/tickets/create?success=Tiket berhasil dibuat dengan nomor ' + ticketNumber);

        } catch (error) {
            await client.query('ROLLBACK');
            
            // Catatan: Karena menggunakan memoryStorage, file tidak masuk ke disk terlebih dahulu, 
            // jadi perintah fs.unlinkSync untuk req.file sudah tidak diperlukan lagi.
            
            console.error('[TicketController] Gagal menyimpan tiket:', error);
            res.redirect('/tickets/create?error=Gagal menyimpan tiket. Silakan coba lagi.');
        } finally {
            client.release();
        }
    },

    async getTicketDetail(req, res) {
        try {
            const ticketId = req.params.id;
            const user = req.session.user;

            const ticketQuery = await pool.query(`
                SELECT t.*, 
                u_creator.name as creator_name, u_creator.nip as creator_nip,
                b_creator.name as branch_name,
                u_origin.name as creator_unit_name,
                u_target.name as target_unit_name
                FROM tickets t
                JOIN users u_creator ON t.creator_id = u_creator.id
                JOIN branches b_creator ON t.branch_id = b_creator.id
                LEFT JOIN units u_origin ON t.creator_unit_id = u_origin.id
                JOIN units u_target ON t.target_unit_id = u_target.id
                WHERE t.id = $1
            `, [ticketId]);

            if (ticketQuery.rows.length === 0) {
                return res.redirect('/tickets?error=Tiket tidak ditemukan.');
            }

            const ticket = ticketQuery.rows[0];

            const logsQuery = await pool.query(`
                SELECT 
                    tl.*, 
                    u.name as actor_name, 
                    u.role as actor_role,
                    un.name as actor_unit_name
                FROM ticket_logs tl
                LEFT JOIN users u ON tl.actor_id = u.id
                LEFT JOIN units un ON u.unit_id = un.id
                WHERE tl.ticket_id = $1
                ORDER BY tl.created_at ASC
            `, [ticketId]);

            const unitQuery = await pool.query(`
                SELECT u.id, u.name, b.name as branch_name 
                FROM units u
                JOIN branches b ON u.branch_id = b.id
                ORDER BY b.name ASC, u.name ASC
            `);

            res.render('layouts/main', {
                title: `Detail Tiket ${ticket.ticket_number} - Ticketing System`,
                user: user,
                partialsPath: '../pages/tickets/detail',
                ticket: ticket,
                logs: logsQuery.rows,
                units: unitQuery.rows,
                error: req.query.error || null,
                success: req.query.success || null
            });
        } catch (error) {
            console.error('[TicketController] Error memuat detail tiket:', error);
            res.status(500).send('Terjadi kesalahan internal server.');
        }
    },

    async updateTicketStatus(req, res) {
        const client = await pool.connect();
        try {
            const ticketId = req.params.id;
            const { status: newStatus, message, new_target_unit_id } = req.body;
            const user = req.session.user;

            const currentTicketRes = await client.query(`
                SELECT t.status, t.target_unit_id, t.creator_unit_id, t.ticket_number, t.creator_id, t.branch_id
                FROM tickets t
                WHERE t.id = $1
            `, [ticketId]);

            if (currentTicketRes.rows.length === 0) {
                return res.redirect('/tickets?error=Tiket tidak ditemukan.');
            }
            const ticket = currentTicketRes.rows[0];
            const currentStatus = ticket.status;

            if (user.role !== 'superadmin' && currentStatus !== 'Closed') {
                const isTransferringAction = (newStatus === 'Transferred');

                if (!isTransferringAction && parseInt(user.unit_id) !== parseInt(ticket.target_unit_id)) {
                    return res.redirect(`/tickets/${ticketId}?error=Anda tidak memiliki hak akses karena tiket sudah dialihkan ke unit lain.`);
                }
            }

            if (currentStatus === 'Closed') {
                return res.redirect(`/tickets/${ticketId}?error=Tiket ini sudah berstatus Closed dan terkunci total.`);
            }

            let isValidTransition = false;
            let targetStatusToSave = newStatus;

            if (newStatus === 'Transferred') {
                if (currentStatus !== 'Closed' && new_target_unit_id) {
                    if (parseInt(new_target_unit_id) !== parseInt(ticket.creator_unit_id)) {
                        isValidTransition = true;
                        targetStatusToSave = 'Open'; 
                    }
                }
            } else if (currentStatus === 'Open' && newStatus === 'Inprogress') {
                isValidTransition = true;
            } else if (currentStatus === 'Transferred' && newStatus === 'Inprogress') {
                isValidTransition = true;
            } else if (currentStatus === 'Inprogress' && (newStatus === 'Resolved' || newStatus === 'Closed')) {
                isValidTransition = true;
            } else if (currentStatus === 'Resolved' && newStatus === 'Closed') {
                isValidTransition = true;
            }

            if (!isValidTransition) {
                return res.redirect(`/tickets/${ticketId}?error=Perubahan status tidak valid atau dilarang mentransfer ke unit pelapor.`);
            }

            if (!message || message.trim() === '') {
                return res.redirect(`/tickets/${ticketId}?error=Catatan penanganan wajib diisi.`);
            }

            await client.query('BEGIN');

            let notificationTargetUnitId = null;
            let notificationBranchId = null;
            let creatorNotificationMessage = '';
            let hierarchicalNotificationTitle = '';
            let hierarchicalNotificationMessage = '';

            if (newStatus === 'Transferred') {
                await client.query(`
                    UPDATE tickets 
                    SET status = $1, target_unit_id = $2 
                    WHERE id = $3
                `, [targetStatusToSave, new_target_unit_id, ticketId]);

                const targetUnitRes = await client.query('SELECT name, branch_id FROM units WHERE id = $1', [new_target_unit_id]);
                const unitName = targetUnitRes.rows[0]?.name || 'Unit Lain';
                notificationBranchId = targetUnitRes.rows[0]?.branch_id || ticket.branch_id;
                notificationTargetUnitId = new_target_unit_id;

                const logMessage = `Tiket ditransfer / dieskalasi ke Unit: ${unitName}. Status direset ke Open. Alasan: ${message}`;
                await client.query(`
                    INSERT INTO ticket_logs (ticket_id, actor_id, action, message, created_at)
                    VALUES ($1, $2, 'TRANSFERRED', $3, CURRENT_TIMESTAMP)
                `, [ticketId, user.id, logMessage]);

                creatorNotificationMessage = `Tiket Anda (${ticket.ticket_number}) ditransfer ke Unit: ${unitName} (Status: Open).`;
                hierarchicalNotificationTitle = 'Tiket Eskalasi Masuk';
                hierarchicalNotificationMessage = `Tiket dialihkan (${ticket.ticket_number}) dan ditujukan ke unit Anda. Silakan segera ditindaklanjuti.`;

            } else {
                await client.query(`
                    UPDATE tickets SET status = $1 WHERE id = $2
                `, [targetStatusToSave, ticketId]);

                await client.query(`
                    INSERT INTO ticket_logs (ticket_id, actor_id, action, message, created_at)
                    VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
                `, [ticketId, user.id, targetStatusToSave.toUpperCase(), message]);

                creatorNotificationMessage = `Tiket Anda (${ticket.ticket_number}) sekarang berstatus: ${targetStatusToSave}.`;
            }

            await client.query('COMMIT');

            await createNotification(
                ticket.creator_id,
                ticketId,
                newStatus === 'Transferred' ? 'Tiket Ditransfer' : 'Pembaruan Status Tiket',
                creatorNotificationMessage
            );

            if (newStatus === 'Transferred' && notificationTargetUnitId) {
                await notifyHierarchical(
                    notificationTargetUnitId,
                    notificationBranchId,
                    ticketId,
                    hierarchicalNotificationTitle,
                    hierarchicalNotificationMessage,
                    user.id
                );
            }

            res.redirect(`/tickets/${ticketId}?success=Status tiket berhasil diperbarui.`);
        } catch (error) {
            await client.query('ROLLBACK');
            console.error('[TicketController] Gagal memperbarui status tiket:', error);
            res.redirect(`/tickets/${req.params.id}?error=Gagal memperbarui status tiket.`);
        } finally {
            client.release();
        }
    },

    async getCategories(req, res) {
        try {
            const user = req.session.user;
            
            // [PERBAIKAN] Mengembalikan JOIN branches agar master kategori menampilkan nama cabang dengan benar
            let query = `
                SELECT tc.*, b.name as branch_name, 
                       u_creator.name as creator_name, 
                       u_editor.name as editor_name 
                FROM ticket_categories tc
                JOIN branches b ON tc.branch_id = b.id
                LEFT JOIN users u_creator ON tc.created_by = u_creator.id
                LEFT JOIN users u_editor ON tc.updated_by = u_editor.id
            `;
            let params = [];

            // Jika bukan superadmin, batasi hanya melihat kategori milik cabangnya sendiri
            if (user.role !== 'superadmin' && user.branch_id) {
                query += ` WHERE tc.branch_id = $1`;
                params.push(user.branch_id);
            }

            query += ` ORDER BY b.name ASC, tc.category ASC, tc.issue_description ASC`;
            const categoriesRes = await pool.query(query, params);
            
            const branchesRes = await pool.query('SELECT id, name FROM branches ORDER BY name ASC');

            res.render('layouts/main', {
                title: 'Master Kategori - Ticketing System',
                user: user,
                partialsPath: '../pages/tickets/categories',
                categories: categoriesRes.rows,
                branches: branchesRes.rows,
                error: req.query.error || null,
                success: req.query.success || null
            });
        } catch (error) {
            console.error('[TicketController] Error memuat kategori:', error);
            res.status(500).send('Terjadi kesalahan internal server.');
        }
    },

    async createCategory(req, res) {
        try {
            const user = req.session.user;
            const allowedRoles = ['superadmin', 'admin_cabang', 'manager', 'supervisor'];

            if (!allowedRoles.includes(user.role)) {
                return res.redirect('/dashboard?error=Anda tidak memiliki wewenang untuk menambah kategori.');
            }

            const { category, issue_description, branch_id } = req.body;
            const targetBranchId = user.role === 'superadmin' ? branch_id : user.branch_id;
            const userId = user.id || user.user_id;

            if (!targetBranchId) {
                return res.redirect('/tickets/categories?error=Cabang tidak valid.');
            }

            await pool.query(`
                INSERT INTO ticket_categories (branch_id, category, issue_description, created_by, created_at)
                VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
            `, [targetBranchId, category, issue_description, userId]);

            res.redirect('/tickets/categories?success=Kategori berhasil ditambahkan.');
        } catch (error) {
            console.error('[TicketController] Gagal menambah kategori:', error);
            res.redirect('/tickets/categories?error=Gagal menambah kategori kendala.');
        }
    },

    async updateCategory(req, res) {
        try {
            const user = req.session.user;
            const allowedRoles = ['superadmin', 'admin_cabang', 'manager', 'supervisor'];

            if (!allowedRoles.includes(user.role)) {
                return res.redirect('/dashboard?error=Anda tidak memiliki wewenang untuk memperbarui kategori.');
            }

            const catId = req.params.id;
            const { category, issue_description, branch_id } = req.body;
            const targetBranchId = user.role === 'superadmin' ? branch_id : user.branch_id;
            const userId = user.id || user.user_id;

            await pool.query(`
                UPDATE ticket_categories 
                SET branch_id = $1, category = $2, issue_description = $3, updated_by = $4, updated_at = CURRENT_TIMESTAMP
                WHERE id = $5
            `, [targetBranchId, category, issue_description, userId, catId]);

            res.redirect('/tickets/categories?success=Kategori berhasil diperbarui.');
        } catch (error) {
            console.error('[TicketController] Gagal memperbarui kategori:', error);
            res.redirect('/tickets/categories?error=Gagal memperbarui kategori.');
        }
    },

    async deleteCategory(req, res) {
        try {
            const user = req.session.user;
            const allowedRoles = ['superadmin', 'admin_cabang', 'manager', 'supervisor'];

            if (!allowedRoles.includes(user.role)) {
                return res.redirect('/dashboard?error=Anda tidak memiliki wewenang untuk menghapus kategori.');
            }

            const catId = req.params.id;
            await pool.query('DELETE FROM ticket_categories WHERE id = $1', [catId]);
            res.redirect('/tickets/categories?success=Kategori berhasil dihapus.');
        } catch (error) {
            console.error('[TicketController] Gagal menghapus kategori:', error);
            res.redirect('/tickets/categories?error=Gagal menghapus kategori.');
        }
    }
};

module.exports = TicketController;