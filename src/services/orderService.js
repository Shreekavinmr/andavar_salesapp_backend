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

    const total = payload.total_amount != null 
      ? parseFloat(payload.total_amount) 
      : parseFloat(computedLines.reduce((s, ln) => s + parseFloat(ln.amount || 0), 0).toFixed(2));

    // ✅ Get actor role
    const role = await DealerModel.getRoleName(actor.id);

    let status, needsApproval = false;

    // ✅ If SO, create as draft (no credit check)
    if (role === 'sales_officer' || role === 'so') {
      status = 'draft';
      logger.info(`SO ${actor.id} created draft order for dealer ${payload.dealer_id}`);
    } else {
      // ✅ ASM/RSM/GM/Owner - create real order with credit check
      const currentOutstanding = await DealerLedgerModel.getDealerPendingAmount(payload.dealer_id);
      const creditLimit = await DealerModel.getDealerCreditLimit(payload.dealer_id);

      logger.info(`Order create by ${role} dealer ${payload.dealer_id}: outstanding=${currentOutstanding}, total=${total}, limit=${creditLimit}`);

      needsApproval = currentOutstanding > creditLimit;
      status = needsApproval ? 'pending_approval' : 'approved';
    }

    const createPayload = {
      dealer_id: payload.dealer_id,
      placed_on: payload.placed_on || null,
      created_by: actor.id,
      notes: payload.notes || null,
      total_amount: total,
      status,
      order_lines: computedLines,
      approved_by: status === 'approved' ? actor.id : null, // ✅ Set approved_by if auto-approved
    };

    const created = await OrderModel.createOrder(createPayload);

    // ✅ If approved immediately, record to ledger
    if (status === 'approved') {
      await DealerLedgerModel.recordOrderCharge(
        payload.dealer_id, 
        total, 
        created.id, 
        actor.id,
        created.product_type
      );
    }

    return {
      success: true,
      order: created,
      pending_approval: needsApproval,
      is_draft: status === 'draft',
    };
  } catch (error) {
    logger.error(`OrderService.createOrder error: ${error.message}`);
    throw error;
  }
}

  static async approveOrder(orderId, approver) {
  try {
    if (!approver || !approver.id) throw new Error('approver required');

    const order = await OrderModel.getOrderById(orderId);
    if (!order) throw new Error('Order not found');

    const approverRole = await DealerModel.getRoleName(approver.id);

    // ✅ SCENARIO 1: Converting DRAFT to real order
    if (order.status === 'draft') {
      // Check if approver can approve this draft
      const canApprove = await OrderModel.canApproveDraft(order.created_by, approver.id);
      if (!canApprove) {
        throw new Error('Not authorized to approve this draft');
      }

      // Check credit limit
      const currentOutstanding = await DealerLedgerModel.getDealerPendingAmount(order.dealer_id);
      const creditLimit = await DealerModel.getDealerCreditLimit(order.dealer_id);

      logger.info(`Converting draft ${orderId}: outstanding=${currentOutstanding}, total=${order.total_amount}, limit=${creditLimit}`);

      const needsApproval = currentOutstanding > creditLimit;
      const newStatus = needsApproval ? 'pending_approval' : 'approved';

      const updated = await OrderModel.updateOrderStatus(orderId, newStatus, approver.id, approver.id);
      await OrderModel.createApprovalRecord(orderId, approver.id, 'draft_approved', 'Converted draft to order');

      // If approved, record to ledger
      if (newStatus === 'approved') {
        await DealerLedgerModel.recordOrderCharge(
          order.dealer_id, 
          order.total_amount, 
          orderId, 
          approver.id,
          order.product_type
        );
      }

      return { 
        success: true, 
        order: updated, 
        pending_approval: needsApproval 
      };
    }

    // ✅ SCENARIO 2: GM/Owner approving PENDING_APPROVAL order
    if (order.status === 'pending_approval') {
      if (!['gm', 'owner', 'admin'].includes(approverRole)) {
        throw new Error('Only GM/Owner can approve pending orders');
      }

      const updated = await OrderModel.updateOrderStatus(orderId, 'approved', approver.id, approver.id);
      await OrderModel.createApprovalRecord(orderId, approver.id, 'approved', 'Final approval');

      // Record to ledger
      await DealerLedgerModel.recordOrderCharge(
        order.dealer_id, 
        order.total_amount, 
        orderId, 
        approver.id,
        order.product_type
      );

      return { success: true, order: updated };
    }

    throw new Error(`Cannot approve order with status: ${order.status}`);
  } catch (err) {
    logger.error(`OrderService.approveOrder error: ${err.message}`);
    throw err;
  }
}

  static async rejectOrder(orderId, approver, comment = null) {
  try {
    if (!approver || !approver.id) throw new Error('approver required');

    const order = await OrderModel.getOrderById(orderId);
    if (!order) throw new Error('Order not found');

    const approverRole = await DealerModel.getRoleName(approver.id);

    // ✅ Allow rejecting drafts by superiors
    if (order.status === 'draft') {
      const canReject = await OrderModel.canApproveDraft(order.created_by, approver.id);
      if (!canReject) {
        throw new Error('Not authorized to reject this draft');
      }
    } 
    // ✅ Allow rejecting pending_approval by GM/Owner
    else if (order.status === 'pending_approval') {
      if (!['gm', 'owner', 'admin'].includes(approverRole)) {
        throw new Error('Only GM/Owner can reject pending orders');
      }
    } else {
      throw new Error(`Cannot reject order with status: ${order.status}`);
    }

    const updated = await OrderModel.updateOrderStatus(orderId, 'rejected', approver.id);
    await OrderModel.createApprovalRecord(orderId, approver.id, 'rejected', comment);

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