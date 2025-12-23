// src/services/OrderReturnService.js
const OrderReturnModel = require("../models/OrderReturnModel");
const OrderModel = require("../models/OrderModel");
const DealerLedgerModel = require("../models/DealerLedgerModel");
const DealerModel = require("../models/dealerModel");
const logger = require("../utils/logger");

class OrderReturnService {
  /**
   * Create return request
   */
  static async createReturnRequest(payload, actor) {
    try {
      if (!payload || !payload.order_id) throw new Error("order_id required");
      if (!actor || !actor.id) throw new Error("actor required");

      // Validate order exists and is in 'delivered' status
      const order = await OrderModel.getOrderById(payload.order_id);
      if (!order) throw new Error("Order not found");

      if (order.status !== "delivered") {
        throw new Error(
          `Return requests can only be created for approved orders. Current status: ${order.status}`
        );
      }

      const existingRequests = await OrderReturnModel.getOrderReturnRequests(
        payload.order_id
      );
      const hasPending = existingRequests.some((r) => r.status === "pending");
      if (hasPending) {
        throw new Error(
          "This order already has a pending return request. Please wait for it to be processed."
        );
      }

      // Validate return_items quantities don't exceed order quantities
      const orderLines = order.order_lines || [];
      for (const returnItem of payload.return_items || []) {
        const orderLine = orderLines.find(
          (ol) => ol.id === returnItem.order_line_id
        );
        if (!orderLine) {
          throw new Error(`Invalid order_line_id: ${returnItem.order_line_id}`);
        }
        if (returnItem.quantity_returned > orderLine.quantity) {
          throw new Error(
            `Returned quantity (${returnItem.quantity_returned}) exceeds order quantity (${orderLine.quantity}) for ${orderLine.product_name}`
          );
        }
      }

      // Create request
      const requestPayload = {
        order_id: payload.order_id,
        dealer_id: order.dealer_id,
        return_type: payload.return_type,
        reason: payload.reason,
        requested_by: actor.id,
        return_items: payload.return_items,
      };

      const created = await OrderReturnModel.createReturnRequest(
        requestPayload
      );

      logger.info(
        `Return request ${created.id} created for order ${payload.order_id} by ${actor.id}`
      );

      return {
        success: true,
        return_request: created,
      };
    } catch (error) {
      logger.error(
        `OrderReturnService.createReturnRequest error: ${error.message}`
      );
      throw error;
    }
  }

  /**
   * Approve return request (GM/Owner only)
   */
  static async approveReturnRequest(requestId, approver) {
    try {
      if (!approver || !approver.id) throw new Error("approver required");

      // Check role
      const role = await DealerModel.getRoleName(approver.id);
      if (!["gm", "owner", "admin"].includes(role)) {
        throw new Error("Only GM, Owner, or Admin can approve return requests");
      }

      // Get request details
      const request = await OrderReturnModel.getReturnRequestById(requestId);
      if (!request) throw new Error("Return request not found");

      if (request.status !== "pending") {
        throw new Error(
          `Return request must be pending. Current status: ${request.status}`
        );
      }

      // Approve request
      const approved = await OrderReturnModel.approveReturnRequest(
        requestId,
        approver.id
      );

      // Process based on return_type
      if (request.return_type === "cashback") {
        await this._processCashback(request, approver.id);
      } else if (request.return_type === "replacement") {
        await this._processReplacement(request, approver.id);
      }

      logger.info(`Return request ${requestId} approved by ${approver.id}`);

      return {
        success: true,
        return_request: await OrderReturnModel.getReturnRequestById(requestId),
      };
    } catch (error) {
      logger.error(
        `OrderReturnService.approveReturnRequest error: ${error.message}`
      );
      throw error;
    }
  }

  /**
   * Process cashback - Credit amount to dealer ledger
   */
  static async _processCashback(request, approverId) {
    try {
      const amount = request.total_return_amount;

      // Add negative entry to ledger (credit to dealer)
      await DealerLedgerModel.recordReturnCashback(
        request.dealer_id,
        amount,
        request.order_id,
        request.id,
        approverId
      );

      logger.info(
        `Cashback of ${amount} processed for return request ${request.id}`
      );
    } catch (error) {
      logger.error(`_processCashback error: ${error.message}`);
      throw error;
    }
  }

  /**
   * Process replacement - Create new order + credit for returned items
   */
  static async _processReplacement(request, approverId) {
    try {
      const originalOrder = request.order;
      const returnItems = request.return_items || [];

      // 1. Credit returned items to ledger (negative entry)
      await DealerLedgerModel.recordReturnCashback(
        request.dealer_id,
        request.total_return_amount,
        request.order_id,
        request.id,
        approverId
      );

      // 2. Create replacement order with same items
      const replacementLines = returnItems.map((item) => ({
        product_id: item.product_id,
        product_name: item.product_name,
        quantity: item.quantity_returned,
        unit_price: item.unit_price,
        amount: item.return_amount,
        case_type: null, // Adjust as needed
      }));

      const replacementPayload = {
        dealer_id: request.dealer_id,
        placed_on: originalOrder.placed_on,
        created_by: approverId,
        notes: `Replacement order for return request ${request.id} (Original order: ${request.order_id})`,
        total_amount: request.total_return_amount,
        status: "approved", // Auto-approve replacement orders
        order_lines: replacementLines,
      };

      const { data: replacementOrder, error: orderError } =
        await require("../config/supabase")
          .from("orders")
          .insert(replacementPayload)
          .select()
          .single();

      if (orderError) throw new Error(orderError.message);

      // Insert replacement order lines
      const lineRows = replacementLines.map((l) => ({
        order_id: replacementOrder.id,
        product_id: l.product_id,
        product_name: l.product_name,
        quantity: l.quantity,
        case_type: l.case_type,
        unit_price: l.unit_price,
        amount: l.amount,
        created_at: new Date().toISOString(),
      }));

      await require("../config/supabase").from("order_lines").insert(lineRows);

      // 3. Add replacement order charge to ledger (positive entry)
      await DealerLedgerModel.recordOrderCharge(
        request.dealer_id,
        replacementOrder.total_amount,
        replacementOrder.id,
        approverId
      );

      // 4. Link replacement order to return request
      await OrderReturnModel.linkReplacementOrder(
        request.id,
        replacementOrder.id
      );

      logger.info(
        `Replacement order ${replacementOrder.id} created for return request ${request.id}`
      );
    } catch (error) {
      logger.error(`_processReplacement error: ${error.message}`);
      throw error;
    }
  }

  /**
   * Reject return request
   */
  static async rejectReturnRequest(
    requestId,
    approver,
    rejectionReason = null
  ) {
    try {
      if (!approver || !approver.id) throw new Error("approver required");

      const role = await DealerModel.getRoleName(approver.id);
      if (!["gm", "owner", "admin"].includes(role)) {
        throw new Error("Only GM, Owner, or Admin can reject return requests");
      }

      const request = await OrderReturnModel.getReturnRequestById(requestId);
      if (!request) throw new Error("Return request not found");

      if (request.status !== "pending") {
        throw new Error(
          `Return request must be pending. Current status: ${request.status}`
        );
      }

      const rejected = await OrderReturnModel.rejectReturnRequest(
        requestId,
        approver.id,
        rejectionReason
      );

      logger.info(`Return request ${requestId} rejected by ${approver.id}`);

      return {
        success: true,
        return_request: rejected,
      };
    } catch (error) {
      logger.error(
        `OrderReturnService.rejectReturnRequest error: ${error.message}`
      );
      throw error;
    }
  }

  /**
   * Get return requests
   */
  static async getReturnRequests(filter = {}, options = {}, actor) {
  return await OrderReturnModel.listReturnRequests(filter, options, actor.id);
}


  /**
   * Get single return request
   */
  static async getReturnRequest(requestId) {
    return await OrderReturnModel.getReturnRequestById(requestId);
  }
}

module.exports = OrderReturnService;
