const express = require('express');
const router = express.Router();
const TicketController = require('../controllers/TicketController');
const { isAuthenticated } = require('../middlewares/authMiddleware');
const upload = require('../middlewares/uploadTicket');

// GET Halaman Manajemen Tiket (Inbox & Outbox dalam 1 halaman)
router.get('/', isAuthenticated, TicketController.listTicketsUnified);

// GET Detail Tiket
router.get('/:id', isAuthenticated, TicketController.getTicketDetail);

// POST Update Status / Kirim Pesan Progres Tiket
router.post('/:id/update', isAuthenticated, TicketController.updateTicketStatus);

// GET Form Buat Tiket
router.get('/create', isAuthenticated, TicketController.renderCreateForm);

// POST Simpan Tiket
router.post('/create', isAuthenticated, upload.single('attachment'), TicketController.createTicket);

module.exports = router;