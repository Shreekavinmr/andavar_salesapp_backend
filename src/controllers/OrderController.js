// src/controllers/OrderController.js
const OrderService = require('../services/orderService');
const { sendResponse } = require('../utils/responseHandler');
const logger = require('../utils/logger');

class OrderController {
  // POST /orders
  static async createOrder(req, res) {
    try {
      const actor = req.user;
      const payload = req.body;
      const result = await OrderService.createOrder(payload, actor);
      sendResponse(res, result.pending_approval ? 202 : 201, result.pending_approval ? 'Order pending approval' : 'Order created', result.order);
    } catch (error) {
      logger.error(`OrderController.createOrder error: ${error.message}`);
      sendResponse(res, 400, error.message);
    }
  }

  // GET /orders/:id
  static async getOrder(req, res) {
    try {
      const id = req.params.id;
      const order = await OrderService.getOrder(id);
      sendResponse(res, 200, 'Order fetched', order);
    } catch (e) {
      logger.error(`OrderController.getOrder error: ${e.message}`);
      sendResponse(res, 400, e.message);
    }
  }

  // GET /orders (list)
  static async listOrders(req, res) {
    try {
      const filter = {
        dealer_id: req.query.dealer_id,
        status: req.query.status,
        created_by: req.query.created_by,
        placed_on: req.query.placed_on,
        q: req.query.q
      };
      const options = { page: req.query.page || 1, limit: req.query.limit || 50 };
      const data = await OrderService.getOrders(filter, options);
      sendResponse(res, 200, 'Orders fetched', { orders: data.rows, total: data.total });
    } catch (e) {
      logger.error(`OrderController.listOrders error: ${e.message}`);
      sendResponse(res, 400, e.message);
    }
  }

  // POST /orders/:id/approve
  static async approveOrder(req, res) {
    try {
      const id = req.params.id;
      const approver = req.user;
      const result = await OrderService.approveOrder(id, approver);
      sendResponse(res, 200, 'Order approved', result.order);
    } catch (e) {
      logger.error(`OrderController.approveOrder error: ${e.message}`);
      sendResponse(res, 403, e.message);
    }
  }

  // POST /orders/:id/reject
  static async rejectOrder(req, res) {
    try {
      const id = req.params.id;
      const approver = req.user;
      const comment = req.body.comment || null;
      const result = await OrderService.rejectOrder(id, approver, comment);
      sendResponse(res, 200, 'Order rejected', result.order);
    } catch (e) {
      logger.error(`OrderController.rejectOrder error: ${e.message}`);
      sendResponse(res, 403, e.message);
    }
  }

  // POST /orders/:id/deliver
  static async markDelivered(req, res) {
    try {
      const id = req.params.id;
      const updater = req.user;
      const result = await OrderService.markDelivered(id, updater);
      sendResponse(res, 200, 'Order marked delivered', result.order);
    } catch (e) {
      logger.error(`OrderController.markDelivered error: ${e.message}`);
      sendResponse(res, 403, e.message);
    }
  }
}

module.exports = OrderController;