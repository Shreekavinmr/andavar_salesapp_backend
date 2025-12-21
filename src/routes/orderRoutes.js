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

router.get('/admin/orders/:orderId/details', 
  authenticateToken,
  async (req, res) => {
    try {
      const { orderId } = req.params;
      const OrderModel = require('../models/OrderModel');
      const order = await OrderModel.getOrderById(orderId);
      
      const { sendResponse } = require('../utils/responseHandler');
      sendResponse(res, 200, 'Order details fetched', order);
    } catch (error) {
      const { sendResponse } = require('../utils/responseHandler');
      sendResponse(res, 400, error.message);
    }
  }
);

module.exports = router;