const pool = require('../config/db');
const fs = require('fs');
const path = require('path');

const TicketController = {
    async renderCreateForm(req, res) {
        try {
            const user = req.session.user;

            const categoryQuery = await pool.query(
                'SELECT category, issue_description FROM ticket_categories ORDER BY category ASC'
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

            // 1. Ambil Data Tiket Masuk (Inbox) berdasarkan unit tujuan aktif saat ini
            let inboxQuery = `
                SELECT t.id, t.ticket_number, t.category, t.issue_description, 
                t.priority, t.status, t.created_at,
                u_creator.name as creator_name, 
                b_creator.name as branch_name,
                u_target.name as target_unit_name
                FROM tickets t
                JOIN users u_creator ON t.creator_id = u_creator.id
                JOIN branches b_creator ON t.branch_id = b_creator.id
                JOIN units u_target ON t.target_unit_id = u_target.id
            `;
            let inboxParams = [];

            if (user.role === 'superadmin') {
                // Superadmin melihat semua tiket masuk global
            } else if (user.role === 'admin_cabang') {
                inboxQuery += ' WHERE t.branch_id = $1';
                inboxParams = [user.branch_id];
            } else {
                // Staf/Unit: Hanya tiket yang benar-benar dipegang oleh unitnya saat ini
                inboxQuery += ' WHERE t.target_unit_id = $1';
                inboxParams = [user.unit_id];
            }
            inboxQuery += ' ORDER BY t.created_at DESC';
            const inboxRes = await pool.query(inboxQuery, inboxParams);

            // 2. Ambil Data Tiket Keluar / Dibuat Sendiri (Outbox)
            const outboxQuery = `
                SELECT t.id, t.ticket_number, t.category, t.issue_description, 
                t.priority, t.status, t.created_at,
                u_creator.name as creator_name, 
                b_creator.name as branch_name,
                u_target.name as target_unit_name
                FROM tickets t
                JOIN users u_creator ON t.creator_id = u_creator.id
                JOIN branches b_creator ON t.branch_id = b_creator.id
                JOIN units u_target ON t.target_unit_id = u_target.id
                WHERE t.creator_id = $1
                ORDER BY t.created_at DESC
            `;
            const outboxRes = await pool.query(outboxQuery, [user.id]);

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
                const ext = path.extname(req.file.originalname);
                const newFilename = `${ticketNumber}-Lampiran${ext}`;
                const oldPath = req.file.path;
                const newPath = path.join(__dirname, '../public/uploads/tickets', newFilename);

                fs.renameSync(oldPath, newPath);
                attachmentUrl = `/uploads/tickets/${newFilename}`;
            }

            const insertTicketQuery = `
                INSERT INTO tickets (
                    ticket_number, branch_id, creator_id, target_unit_id, 
                    category, issue_description, description, priority, 
                    status, attachment_url, created_at
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'Open', $9, CURRENT_TIMESTAMP)
                RETURNING id;
            `;

            const ticketResult = await client.query(insertTicketQuery, [
                ticketNumber,
                user.branch_id,
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
            res.redirect('/tickets/create?success=Tiket berhasil dibuat dengan nomor ' + ticketNumber);

        } catch (error) {
            await client.query('ROLLBACK');
            if (req.file && fs.existsSync(req.file.path)) {
                fs.unlinkSync(req.file.path);
            }
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
                JOIN units u_origin ON u_creator.unit_id = u_origin.id
                JOIN units u_target ON t.target_unit_id = u_target.id
                WHERE t.id = $1
            `, [ticketId]);

            if (ticketQuery.rows.length === 0) {
                return res.redirect('/tickets?error=Tiket tidak ditemukan.');
            }

            const ticket = ticketQuery.rows[0];

            const logsQuery = await pool.query(`
                SELECT l.*, u.name as actor_name, u.role as actor_role
                FROM ticket_logs l
                JOIN users u ON l.actor_id = u.id
                WHERE l.ticket_id = $1
                ORDER BY l.created_at ASC
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
                SELECT t.status, t.target_unit_id, u_creator.unit_id as creator_unit_id
                FROM tickets t
                JOIN users u_creator ON t.creator_id = u_creator.id
                WHERE t.id = $1
            `, [ticketId]);

            if (currentTicketRes.rows.length === 0) {
                return res.redirect('/tickets?error=Tiket tidak ditemukan.');
            }
            const ticket = currentTicketRes.rows[0];
            const currentStatus = ticket.status;

            // Validasi Hak Akses: Hanya unit tujuan aktif saat ini (atau superadmin) yang boleh mengubah
            if (user.role !== 'superadmin' && currentStatus !== 'Closed') {
                if (parseInt(user.unit_id) !== parseInt(ticket.target_unit_id)) {
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
                    // Dilarang keras mentransfer kembali ke unit pelapor asli
                    if (parseInt(new_target_unit_id) !== parseInt(ticket.creator_unit_id)) {
                        isValidTransition = true;
                        targetStatusToSave = 'Open'; // Status otomatis kembali ke Open di unit baru!
                    }
                }
            } else if (currentStatus === 'Open' && newStatus === 'Process') {
                isValidTransition = true;
            } else if (currentStatus === 'Process' && (newStatus === 'Resolved' || newStatus === 'Closed')) {
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

            if (newStatus === 'Transferred') {
                // Update target_unit_id ke unit baru DAN reset status menjadi 'Open'
                await client.query(`
                    UPDATE tickets 
                    SET status = $1, target_unit_id = $2 
                    WHERE id = $3
                `, [targetStatusToSave, new_target_unit_id, ticketId]);

                const targetUnitRes = await client.query('SELECT name FROM units WHERE id = $1', [new_target_unit_id]);
                const unitName = targetUnitRes.rows[0]?.name || 'Unit Lain';

                const logMessage = `Tiket ditransfer / dieskalasi ke Unit: ${unitName}. Status direset ke Open. Alasan: ${message}`;
                await client.query(`
                    INSERT INTO ticket_logs (ticket_id, actor_id, action, message, created_at)
                    VALUES ($1, $2, 'TRANSFERRED', $3, CURRENT_TIMESTAMP)
                `, [ticketId, user.id, logMessage]);

            } else {
                await client.query(`
                    UPDATE tickets SET status = $1 WHERE id = $2
                `, [targetStatusToSave, ticketId]);

                await client.query(`
                    INSERT INTO ticket_logs (ticket_id, actor_id, action, message, created_at)
                    VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
                `, [ticketId, user.id, targetStatusToSave.toUpperCase(), message]);
            }

            await client.query('COMMIT');
            res.redirect(`/tickets/${ticketId}?success=Status tiket berhasil diperbarui.`);
        } catch (error) {
            await client.query('ROLLBACK');
            console.error('[TicketController] Gagal memperbarui status tiket:', error);
            res.redirect(`/tickets/${req.params.id}?error=Gagal memperbarui status tiket.`);
        } finally {
            client.release();
        }
    }
};

module.exports = TicketController;