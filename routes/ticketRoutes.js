const express = require('express');
const router = express.Router();
const TicketController = require('../controllers/TicketController');
const { isAuthenticated } = require('../middlewares/authMiddleware');
const uploadExcel = require('../middlewares/uploadExcelMiddleware');
const uploadTicket = require('../middlewares/uploadTicket');

// Rute Master Kategori
router.get('/categories', isAuthenticated, TicketController.getCategories);
router.post('/categories/create', isAuthenticated, TicketController.createCategory);
router.post('/categories/:id/update', isAuthenticated, TicketController.updateCategory);
router.post('/categories/:id/delete', isAuthenticated, TicketController.deleteCategory);
router.get('/categories/template', isAuthenticated, TicketController.downloadCategoryTemplate);
router.post('/categories/import', isAuthenticated, uploadExcel.single('file'), TicketController.bulkImportCategories);

// Rute Tiket (PASTIKAN uploadTicket.single('attachment') ADA DI SINI)
router.get('/create', isAuthenticated, TicketController.renderCreateForm);
router.post('/create', isAuthenticated, uploadTicket.single('attachment'), TicketController.createTicket);

router.get('/', isAuthenticated, TicketController.listTicketsUnified);
router.get('/:id', isAuthenticated, TicketController.getTicketDetail);
router.post('/:id/update', isAuthenticated, TicketController.updateTicketStatus);

module.exports = router;