// src/controllers/OrderReturnController.js
const OrderReturnService = require('../services/OrderReturnService');
const { sendResponse } = require('../utils/responseHandler');
const logger = require('../utils/logger');

class OrderReturnController {
  /**
   * Create return request
   * POST /orders/:orderId/return-request
   */
  static async createReturnRequest(req, res) {
    try {
      const actor = req.user;
      const { orderId } = req.params;

      const payload = {
        order_id: orderId,
        return_type: req.body.return_type, // 'cashback' or 'replacement'
        reason: req.body.reason,
        return_items: req.body.return_items // [{order_line_id, product_id, product_name, quantity_returned, unit_price, return_amount}]
      };

      const result = await OrderReturnService.createReturnRequest(payload, actor);

      sendResponse(res, 201, 'Return request created successfully', result.return_request);
    } catch (error) {
      logger.error(`OrderReturnController.createReturnRequest error: ${error.message}`);
      sendResponse(res, 400, error.message);
    }
  }

  /**
   * Get return requests (list)
   * GET /return-requests
   */
  static async listReturnRequests(req, res) {
  try {
    const filter = {
      order_id: req.query.order_id,
      dealer_id: req.query.dealer_id,
      status: req.query.status,
      return_type: req.query.return_type,
      requested_by: req.query.requested_by,
    };

    const options = {
      page: req.query.page || 1,
      limit: req.query.limit || 50,
    };

    const result = await OrderReturnService.getReturnRequests(
      filter,
      options,
      req.user
    );

    sendResponse(res, 200, 'Return requests fetched successfully', result);
  } catch (error) {
    logger.error(`OrderReturnController.listReturnRequests error: ${error.message}`);
    sendResponse(res, 400, error.message);
  }
}


  /**
   * Get single return request
   * GET /return-requests/:id
   */
  static async getReturnRequest(req, res) {
    try {
      const { id } = req.params;
      const request = await OrderReturnService.getReturnRequest(id);

      sendResponse(res, 200, 'Return request fetched successfully', request);
    } catch (error) {
      logger.error(`OrderReturnController.getReturnRequest error: ${error.message}`);
      sendResponse(res, 400, error.message);
    }
  }

  /**
   * Approve return request (GM/Owner only)
   * POST /return-requests/:id/approve
   */
  static async approveReturnRequest(req, res) {
    try {
      const { id } = req.params;
      const approver = req.user;

      const result = await OrderReturnService.approveReturnRequest(id, approver);

      sendResponse(res, 200, 'Return request approved successfully', result.return_request);
    } catch (error) {
      logger.error(`OrderReturnController.approveReturnRequest error: ${error.message}`);
      sendResponse(res, 403, error.message);
    }
  }

  /**
   * Reject return request (GM/Owner only)
   * POST /return-requests/:id/reject
   */
  static async rejectReturnRequest(req, res) {
    try {
      const { id } = req.params;
      const approver = req.user;
      const rejectionReason = req.body.rejection_reason || null;

      const result = await OrderReturnService.rejectReturnRequest(
        id,
        approver,
        rejectionReason
      );

      sendResponse(res, 200, 'Return request rejected successfully', result.return_request);
    } catch (error) {
      logger.error(`OrderReturnController.rejectReturnRequest error: ${error.message}`);
      sendResponse(res, 403, error.message);
    }
  }

  /**
   * Get return requests for a specific order
   * GET /orders/:orderId/return-requests
   */
  static async getOrderReturnRequests(req, res) {
    try {
      const { orderId } = req.params;

      const result = await OrderReturnService.getReturnRequests(
        { order_id: orderId },
        { page: 1, limit: 100 }
      );

      sendResponse(res, 200, 'Order return requests fetched successfully', result.requests);
    } catch (error) {
      logger.error(`OrderReturnController.getOrderReturnRequests error: ${error.message}`);
      sendResponse(res, 400, error.message);
    }
  }
}

module.exports = OrderReturnController;