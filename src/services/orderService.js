// src/services/orderService.js (Updated: Ledger only on approve; approval on current > threshold)
const OrderModel = require('../models/OrderModel');
const DealerModel = require('../models/dealerModel');
const DealerLedgerModel = require('../models/DealerLedgerModel');
const logger = require('../utils/logger');

class OrderService {
  static async createOrder(payload, actor) {
    try {
      if (!payload || !payload.dealer_id) throw new Error('dealer_id required');
      if (!actor || !actor.id) throw new Error('actor required');

      // Normalize lines & calculate total
      const lines = Array.isArray(payload.order_lines) ? payload.order_lines : [];
      const computedLines = lines.map(l => {
        const qty = Number(l.quantity) || 0;
        const unitPrice = l.unit_price == null ? 0 : parseFloat(l.unit_price);
        const amount = l.amount != null ? parseFloat(l.amount) : (unitPrice * qty);
        return { ...l, quantity: qty, unit_price: unitPrice, amount: parseFloat(amount.toFixed(2)) };
      });

      const total = payload.total_amount != null ? parseFloat(payload.total_amount) : parseFloat(computedLines.reduce((s, ln) => s + parseFloat(ln.amount || 0), 0).toFixed(2));

      // Get current outstanding from pending_amounts
      const currentOutstanding = await DealerLedgerModel.getDealerPendingAmount(payload.dealer_id);
      const creditLimit = await DealerModel.getDealerCreditLimit(payload.dealer_id);

      // Log for debug (zero pending but approval?)
      logger.info(`Order create dealer ${payload.dealer_id}: current_outstanding=${currentOutstanding}, total=${total}, credit_limit=${creditLimit}, needs_approval=${currentOutstanding > creditLimit}`);

      // Approval: current_outstanding > credit_limit (irrespective of order value)
      const needsApproval = currentOutstanding > creditLimit;
      const status = needsApproval ? 'pending_approval' : 'approved';

      const createPayload = {
        dealer_id: payload.dealer_id,
        placed_on: payload.placed_on || null,
        created_by: actor.id,
        notes: payload.notes || null,
        total_amount: total,
        status,
        order_lines: computedLines,
      };

      const created = await OrderModel.createOrder(createPayload);

      // If 'placed' (no approval needed), add to ledger and update pending_amounts
      if (status === 'placed') {
        await DealerLedgerModel.recordOrderCharge(payload.dealer_id, total, created.id, actor.id,created.product_type);
      }

      return {
        success: true,
        order: created,
        pending_approval: needsApproval,
        current_outstanding: currentOutstanding,
        credit_limit: creditLimit
      };
    } catch (error) {
      logger.error(`OrderService.createOrder error: ${error.message}`);
      throw error;
    }
  }

  static async approveOrder(orderId, approver) {
    try {
      if (!approver || !approver.id) throw new Error('approver required');
      const role = await DealerModel.getRoleName(approver.id);
      if (!['gm','owner','admin'].includes(role)) throw new Error('Not authorized to approve orders');

      const order = await OrderModel.getOrderById(orderId);
      if (!order) throw new Error('Order not found');

      if (order.status !== 'pending_approval') {
        throw new Error(`Order status must be 'pending_approval' to approve. Current: ${order.status}`);
      }

      const updated = await OrderModel.updateOrderStatus(orderId, 'approved', approver.id);
      await OrderModel.createApprovalRecord(orderId, approver.id, 'approved', null);

      // NOW record to ledger (outstanding charge on approval)
      await DealerLedgerModel.recordOrderCharge(order.dealer_id, order.total_amount, orderId, approver.id,order.product_type);

      return { success: true, order: updated };
    } catch (err) {
      logger.error(`OrderService.approveOrder error: ${err.message}`);
      throw err;
    }
  }

  static async rejectOrder(orderId, approver, comment = null) {
    try {
      if (!approver || !approver.id) throw new Error('approver required');
      const role = await DealerModel.getRoleName(approver.id);
      if (!['gm','owner','admin'].includes(role)) throw new Error('Not authorized to reject orders');

      const order = await OrderModel.getOrderById(orderId);
      if (!order) throw new Error('Order not found');

      if (order.status !== 'pending_approval') {
        throw new Error(`Order status must be 'pending_approval' to reject. Current: ${order.status}`);
      }

      const updated = await OrderModel.updateOrderStatus(orderId, 'rejected', approver.id);
      await OrderModel.createApprovalRecord(orderId, approver.id, 'rejected', comment);

      // No ledger cleanup needed (none added yet)

      return { success: true, order: updated };
    } catch (err) {
      logger.error(`OrderService.rejectOrder error: ${err.message}`);
      throw err;
    }
  }

  static async markDelivered(orderId, updater) {
  try {
    if (!updater || !updater.id) throw new Error('updater required');

    const order = await OrderModel.getOrderById(orderId);
    if (!order) throw new Error('Order not found');

    if (order.status !== 'approved') {
      throw new Error(`Order must be approved to mark delivered. Current: ${order.status}`);
    }

    // CHECK FOR PENDING RETURNS
    const OrderReturnModel = require('../models/OrderReturnModel');
    const hasPendingReturns = await OrderReturnModel.hasPendingReturns(orderId);
    if (hasPendingReturns) {
      throw new Error('Cannot mark order as delivered. There are pending return requests for this order.');
    }

    const role = await DealerModel.getRoleName(updater.id);
    const isMidHighApprover = ['asm', 'rsm', 'gm', 'owner', 'admin'].includes(role);
    const placedOn = order.placed_on;
    const canUpdate = isMidHighApprover || (placedOn && placedOn === updater.id);
    if (!canUpdate) throw new Error('Not authorized to mark delivered');

    const updated = await OrderModel.updateOrderStatus(orderId, 'delivered', updater.id);

    return { success: true, order: updated };
  } catch (err) {
    logger.error(`OrderService.markDelivered error: ${err.message}`);
    throw err;
  }
}

  static async getOrders(filter = {}, options = {}, actor) {
  const data = await OrderModel.listOrders(filter, options, actor.id);

  // Enrich only pending approval
  for (const order of data.rows) {
    if (order.status === 'pending_approval' && order.dealer_id) {
      order.current_outstanding =
        await DealerLedgerModel.getDealerPendingAmount(order.dealer_id);
    }
  }

  return data;
}


  static async getOrder(orderId) {
    return await OrderModel.getOrderById(orderId);
  }
}

// Future Payments Module Stub (Add to new controller/routes)
class PaymentService { // Stub for later
  static async createPayment(payload, actor) {
    // payload: {dealer_id, amount, method, ref_id}
    const { dealer_id, amount, method = 'cash', ref_id } = payload;
    await DealerLedgerModel.recordPayment(dealer_id, amount, ref_id, actor.id, method);
    return { success: true, message: `Payment of ₹${amount} recorded` };
  }
}

module.exports = OrderService;