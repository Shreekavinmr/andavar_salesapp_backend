// src/routes/orderRoutes.js
const express = require('express');
const OrderController = require('../controllers/OrderController');
const { authenticateToken, requireAdmin } = require('../middleware/auth'); // use authenticateToken for auth
const router = express.Router();

// Create order (authenticated)
router.post('/orders', authenticateToken, OrderController.createOrder);

// Get order list (authenticated)
router.get('/orders', authenticateToken, OrderController.listOrders);

// Get single order
router.get('/orders/:id', authenticateToken, OrderController.getOrder);

// Approve / Reject / Deliver (authenticated — service checks role)
router.post('/orders/:id/approve', authenticateToken, OrderController.approveOrder);
router.post('/orders/:id/reject', authenticateToken, OrderController.rejectOrder);
router.post('/orders/:id/deliver', authenticateToken, OrderController.markDelivered);

module.exports = router;