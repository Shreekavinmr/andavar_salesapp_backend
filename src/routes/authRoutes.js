// src/routes/authRoutes.js
const express = require('express');
const { validateLogin, validateForgotPassword } = require('../middleware/validation');
const { authenticateToken, requireAdmin } = require('../middleware/auth');
const AuthController = require('../controllers/authController');
const AdminController = require('../controllers/adminController');
const requireSameDayLogin = require('../middleware/requireSameDayLogin');
const DealerViewController = require('../controllers/dealerViewController');
const productRoutes = require("./productRoutes");
const AdminDealerLedgerController = require('../controllers/AdminDealerLedgerController');
const orderRoutes = require('./orderRoutes');
const router = express.Router();
const upload = require('../middleware/upload');
const locationRoutes = require('./locationRoutes');
const PaymentApprovalController = require('../controllers/PaymentApprovalController');


// location routes
router.use('/location', locationRoutes);


// Auth routes
router.post('/login', validateLogin, AuthController.login);
router.post('/update-location', authenticateToken, AuthController.updateLocation);
router.post('/logout', authenticateToken, AuthController.logout);
router.post('/forgot-password', validateForgotPassword, AuthController.forgotPassword);
router.post('/reset-password', AuthController.resetPassword);
router.get('/reset-password', AuthController.renderResetForm);


router.use('/admin', productRoutes);
router.use('/', orderRoutes);
// Admin / protected routes
// Use authenticateToken for routes that need a logged-in user
// Use requireAdmin for routes that must be admin-level
router.post('/admin/onboard', authenticateToken, requireAdmin, requireSameDayLogin, AdminController.onboard);
router.get('/admin/employees', authenticateToken, requireSameDayLogin, AdminController.getEmployees);
router.put('/admin/employees/:id', authenticateToken, requireAdmin, requireSameDayLogin, AdminController.updateEmployee);
router.delete('/admin/employees/:id', authenticateToken, requireAdmin, requireSameDayLogin, AdminController.deleteEmployee);
router.get(
  '/admin/my-reportees',
  authenticateToken,
  requireSameDayLogin,
  AdminController.getMyReportees
);



// Managers & Roles: these endpoints need a logged-in user, service enforces authorization
router.get('/admin/managers', authenticateToken, AdminController.getPossibleManagers);
router.get('/admin/roles', authenticateToken, requireAdmin, requireSameDayLogin, AdminController.getRoles);

// Dealers endpoints (authenticated users only; service will enforce role/approval rules)
router.post('/admin/dealers', authenticateToken, requireSameDayLogin, AdminController.createDealer);
router.get('/admin/dealers', authenticateToken,requireSameDayLogin, AdminController.getDealers);
router.put('/admin/dealers/:id', authenticateToken, requireSameDayLogin, AdminController.updateDealer);
router.post('/admin/dealers/:id/approve', authenticateToken, requireSameDayLogin, AdminController.approveDealer);
router.delete('/admin/dealers/:id', authenticateToken, requireAdmin, requireSameDayLogin, AdminController.deleteDealer);
router.get('/admin/possible-sos', authenticateToken, AdminController.getPossibleSOs);
router.post('/admin/dealers/:id/assign-sos', authenticateToken, requireSameDayLogin, AdminController.assignSalesOfficers);
router.delete('/admin/dealers/:id/assign-sos', authenticateToken, requireSameDayLogin, AdminController.unassignSalesOfficers);
router.get('/admin/dealers/:id/sos', authenticateToken, requireSameDayLogin, AdminController.getAssignedSOs);
// fetch assigned for dealer (any authenticated user who can view dealer)
router.get('/admin/dealers/:dealerId/sos', authenticateToken, requireSameDayLogin, AdminController.getDealerSOs);

// assign/replace SOs (requires at least GM/ASM role? keep requireSameDayLogin + requireAdmin or requireApprover as you want)
// I'll keep requireSameDayLogin + requireAdmin for now — adjust per your business rule
router.post('/admin/dealers/:dealerId/assign-sos', authenticateToken, requireSameDayLogin, AdminController.assignDealerSOs);

// unassign (we accept body with sales_officers list)
router.post('/admin/dealers/:dealerId/unassign-sos', authenticateToken, requireSameDayLogin, AdminController.unassignDealerSOs);


router.get('/dealers/list', authenticateToken, DealerViewController.getDealersList);


// Dealer Ledger routes (Admin only)
router.post('/admin/dealers/:dealerId/opening-balance', 
  authenticateToken, 
  requireAdmin, 
  requireSameDayLogin, 
  AdminDealerLedgerController.addOpeningBalance
);

router.get('/admin/dealers/:dealerId/ledger', 
  authenticateToken, 
  requireSameDayLogin, 
  AdminDealerLedgerController.getDealerLedger
);

router.get('/admin/dealers/:dealerId/pending-amount', 
  authenticateToken, 
  AdminDealerLedgerController.getDealerPendingAmount
);

router.get('/admin/dealers/pending-summary', 
  authenticateToken, 
  requireAdmin, 
  AdminDealerLedgerController.getAllPendingAmounts
);

router.post('/admin/dealers/:dealerId/payment', 
  authenticateToken,
  requireSameDayLogin, 
  AdminDealerLedgerController.recordPayment
);


router.post(
  '/admin/dealers/:dealerId/payment/upload-receipt',
  authenticateToken,
  upload.single('receipt'),
  AdminDealerLedgerController.uploadReceiptFile
);

router.get(
  '/admin/dealers/:dealerId/payment-requests',
  authenticateToken,
  requireSameDayLogin,
  AdminDealerLedgerController.getDealerPendingPaymentRequests
);



// Payment approval (GM / Owner)
router.get(
  '/admin/payments/pending',
  authenticateToken,
  requireAdmin,
  requireSameDayLogin,
  PaymentApprovalController.getPendingPayments
);

router.post(
  '/admin/payments/:id/approve',
  authenticateToken,
  requireAdmin,
  requireSameDayLogin,
  PaymentApprovalController.approvePayment
);

router.post(
  '/admin/payments/:id/reject',
  authenticateToken,
  requireAdmin,
  requireSameDayLogin,
  PaymentApprovalController.rejectPayment
);



module.exports = router;