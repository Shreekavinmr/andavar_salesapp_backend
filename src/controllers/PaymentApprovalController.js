const DealerPaymentRequestModel = require("../models/DealerPaymentRequestModel");
const DealerLedgerModel = require("../models/DealerLedgerModel");
const { sendResponse } = require("../utils/responseHandler");
const logger = require("../utils/logger");

class PaymentApprovalController {

    
  // GET pending payments (GM / Owner)
  static async getPendingPayments(req, res) {
    try {
      const result = await DealerPaymentRequestModel.getPendingRequests();
      sendResponse(res, 200, "Pending payments fetched", result);
    } catch (e) {
      logger.error(`getPendingPayments error: ${e.message}`);
      sendResponse(res, 400, e.message);
    }
  }

  // APPROVE payment
  static async approvePayment(req, res) {
  try {
    const { id } = req.params;
    const role = req.user.role;

    const payment = await DealerPaymentRequestModel.getById(id);

    if (payment.status !== "pending") {
      return sendResponse(res, 400, "Payment already processed");
    }

    // 1️⃣ Add ledger entry
    await DealerLedgerModel.recordPayment(
      payment.dealer_id,
      payment.amount,
      payment.payment_mode,
      payment.description,
      req.user.id,
      payment
    );

    // 2️⃣ Mark approved ONLY AFTER ledger success
    await DealerPaymentRequestModel.markApproved(id, req.user.id);

    sendResponse(res, 200, "Payment approved and added to ledger");
  } catch (e) {
    logger.error(`approvePayment error: ${e.message}`);
    sendResponse(res, 400, e.message);
  }
}


  // REJECT payment
  static async rejectPayment(req, res) {
    try {
      const { id } = req.params;
      const { reason } = req.body;
      const role = req.user.role;
      if (!["gm", "owner"].includes(role)) {
  return sendResponse(res, 403, "Not authorized to reject payments");
}

      if (!reason) {
        return sendResponse(res, 400, "Rejection reason is required");
      }

      await DealerPaymentRequestModel.markRejected(
        id,
        req.user.id,
        reason
      );

      sendResponse(res, 200, "Payment rejected");
    } catch (e) {
      logger.error(`rejectPayment error: ${e.message}`);
      sendResponse(res, 400, e.message);
    }
  }
}

module.exports = PaymentApprovalController;
