// src/controllers/AdminDealerLedgerController.js
const DealerLedgerModel = require("../models/DealerLedgerModel");
const { sendResponse } = require("../utils/responseHandler");
const logger = require("../utils/logger");
const path = require("path");
const DealerPaymentRequestModel = require("../models/DealerPaymentRequestModel");

class AdminDealerLedgerController {
  /**
   * Add opening balance for a dealer
   * POST /admin/dealers/:dealerId/opening-balance
   */
  static async addOpeningBalance(req, res) {
    try {
      const { dealerId } = req.params;
      const { amount, description } = req.body;
      const userId = req.user.id;

      if (!amount || isNaN(amount)) {
        return sendResponse(res, 400, "Valid amount is required");
      }

      const result = await DealerLedgerModel.addOpeningBalance(
        dealerId,
        parseFloat(amount),
        description,
        userId
      );

      logger.info(`Opening balance added for dealer ${dealerId} by ${userId}`);
      sendResponse(res, 201, "Opening balance added successfully", result);
    } catch (error) {
      logger.error(`addOpeningBalance error: ${error.message}`);
      sendResponse(res, 400, error.message);
    }
  }

  /**
   * Get dealer ledger
   * GET /admin/dealers/:dealerId/ledger
   */
  static async getDealerLedger(req, res) {
    try {
      const { dealerId } = req.params;
      const options = {
        page: req.query.page,
        limit: req.query.limit,
        product_type: req.query.product_type,
      };

      const result = await DealerLedgerModel.getDealerLedger(dealerId, options);
      sendResponse(res, 200, "Ledger fetched successfully", result);
    } catch (error) {
      logger.error(`getDealerLedger error: ${error.message}`);
      sendResponse(res, 400, error.message);
    }
  }

  /**
   * Get pending amount for a dealer
   * GET /admin/dealers/:dealerId/pending-amount
   */
  static async getDealerPendingAmount(req, res) {
    try {
      const { dealerId } = req.params;
      const pending = await DealerLedgerModel.getDealerPendingAmount(dealerId);

      sendResponse(res, 200, "Pending amount fetched", {
        dealer_id: dealerId,
        pending_amount: pending,
      });
    } catch (error) {
      logger.error(`getDealerPendingAmount error: ${error.message}`);
      sendResponse(res, 400, error.message);
    }
  }

  /**
   * Get all dealers with pending amounts
   * GET /admin/dealers/pending-summary
   */
  static async getAllPendingAmounts(req, res) {
    try {
      const result = await DealerLedgerModel.getAllDealersPendingAmounts();
      sendResponse(res, 200, "Pending amounts fetched", result);
    } catch (error) {
      logger.error(`getAllPendingAmounts error: ${error.message}`);
      sendResponse(res, 400, error.message);
    }
  }

  /**
   * Record payment from dealer
   * POST /admin/dealers/:dealerId/payment
   */
  // src/models/DealerLedgerModel.js
  static async recordPayment(req, res) {
  try {
    const { dealerId } = req.params;
    const {
      amount,
      payment_mode,
      description,
      receipt_filename,
      receipt_storage_path,
      receipt_url,
      collected_by,
    } = req.body;

    if (!amount || isNaN(amount) || amount <= 0) {
      return sendResponse(res, 400, "Valid positive amount is required");
    }

    if (!receipt_filename) {
      return sendResponse(res, 400, "Receipt file is required");
    }

    const payload = {
      dealer_id: dealerId,
      amount: parseFloat(amount),
      payment_mode,
      description,
      receipt_filename,
      receipt_storage_path,
      receipt_url,
      requested_by: req.user.id,
      status: "pending",
    };

    const result = await DealerPaymentRequestModel.createRequest(payload);

    sendResponse(
      res,
      201,
      "Payment submitted for approval",
      result
    );
  } catch (error) {
    logger.error(`recordPayment error: ${error.message}`);
    sendResponse(res, 400, error.message);
  }
}


  static async uploadReceiptFile(req, res) {
    try {
      const { dealerId } = req.params;

      if (!req.file) {
        return sendResponse(res, 400, "Receipt file is required");
      }

      const supabase = require("../config/supabase");

      const originalName = req.file.originalname;
      const extension = originalName.split(".").pop();
      const fileName = `receipt_${Date.now()}.${extension}`;
      const filePath = `${dealerId}/${fileName}`;

      // Upload to Supabase
      const { data, error } = await supabase.storage
        .from("payment_receipts_sales_app")
        .upload(filePath, req.file.buffer, {
          contentType: req.file.mimetype,
          upsert: false,
        });

      if (error) {
        return sendResponse(res, 400, error.message);
      }

      // Get public URL (or signed URL)
      const { data: publicUrlData } = supabase.storage
        .from("payment_receipts_sales_app")
        .getPublicUrl(filePath);

      return sendResponse(res, 200, "File uploaded", {
        receipt_filename: fileName,
        receipt_storage_path: filePath,
        receipt_url: publicUrlData.publicUrl,
      });
    } catch (err) {
      sendResponse(res, 400, err.message);
    }
  }
  // Add below getAllPendingAmounts()
  /**
 * Get pending payment requests for a dealer
 * GET /admin/dealers/:dealerId/payment-requests
 */
static async getDealerPendingPaymentRequests(req, res) {
  try {
    const { dealerId } = req.params;

    const DealerPaymentRequestModel =
      require("../models/DealerPaymentRequestModel");

    const { data, error } = await require("../config/supabase")
      .from("dealer_payment_requests")
      .select(`
        *,
        requester:profiles_onboard!dealer_payment_requests_requested_by_fkey(
          id, full_name, role
        )
      `)
      .eq("dealer_id", dealerId)
      .eq("status", "pending")
      .order("created_at", { ascending: false });

    if (error) throw error;

    sendResponse(
      res,
      200,
      "Pending payment requests fetched",
      data || []
    );
  } catch (error) {
    logger.error(
      `getDealerPendingPaymentRequests error: ${error.message}`
    );
    sendResponse(res, 400, error.message);
  }
}


}

module.exports = AdminDealerLedgerController;
