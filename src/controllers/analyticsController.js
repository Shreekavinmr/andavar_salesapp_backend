// src/controllers/analyticsController.js - COMPLETE FILE
const AnalyticsService = require("../services/analyticsService");
const { sendResponse } = require("../utils/responseHandler");
const logger = require("../utils/logger");

class AnalyticsController {
  /* =====================================================
     MAIN DASHBOARD (OVERALL + ALL SOs)
  ====================================================== */
  static async getDashboard(req, res) {
    try {
      const filter = req.body || {};
      const userId = req.user.id;

      const data = await AnalyticsService.getDashboard(userId, filter);

      sendResponse(res, 200, "Dashboard analytics fetched successfully", data);
    } catch (error) {
      logger.error(`getDashboard error: ${error.message}`);
      sendResponse(res, 400, error.message);
    }
  }

  /* =====================================================
     SO DRILL-DOWN: DEALERS UNDER SPECIFIC SO
  ====================================================== */
  static async getSoDrilldown(req, res) {
    try {
      const { soId } = req.params;
      const filter = req.body || {};

      if (!soId) {
        return sendResponse(res, 400, "SO ID is required");
      }

      const data = await AnalyticsService.getSoDealersDrilldown(soId, filter);

      sendResponse(res, 200, "SO drill-down data fetched successfully", data);
    } catch (error) {
      logger.error(`getSoDrilldown error: ${error.message}`);
      sendResponse(res, 400, error.message);
    }
  }

  /* =====================================================
     PRODUCT-WISE ANALYTICS
  ====================================================== */
  static async getProductWiseAnalytics(req, res) {
    try {
      const filter = req.body || {};
      const userId = req.user.id;

      const data = await AnalyticsService.getProductWiseAnalytics(userId, filter);

      sendResponse(res, 200, "Product-wise analytics fetched successfully", data);
    } catch (error) {
      logger.error(`getProductWiseAnalytics error: ${error.message}`);
      sendResponse(res, 400, error.message);
    }
  }

  /* =====================================================
     SO-WISE ANALYTICS (FOR CHARTS)
  ====================================================== */
  static async getSoWiseAnalytics(req, res) {
    try {
      const filter = req.body || {};
      const userId = req.user.id;

      const data = await AnalyticsService.getSoWiseAnalytics(userId, filter);

      sendResponse(res, 200, "SO-wise analytics fetched successfully", data);
    } catch (error) {
      logger.error(`getSoWiseAnalytics error: ${error.message}`);
      sendResponse(res, 400, error.message);
    }
  }

  /* =====================================================
     DEALER ORDER DETAILS (DRILL-DOWN)
  ====================================================== */
  static async getDealerOrderDetails(req, res) {
    try {
      const { dealerId, soId } = req.params;
      const filter = req.body || {};

      if (!dealerId || !soId) {
        return sendResponse(res, 400, "Dealer ID and SO ID are required");
      }

      const data = await AnalyticsService.getDealerOrderDetails(dealerId, soId, filter);

      sendResponse(res, 200, "Dealer order details fetched successfully", data);
    } catch (error) {
      logger.error(`getDealerOrderDetails error: ${error.message}`);
      sendResponse(res, 400, error.message);
    }
  }

  /* =====================================================
     DEALER PAYMENT DETAILS (DRILL-DOWN)
  ====================================================== */
  static async getDealerPaymentDetails(req, res) {
    try {
      const { dealerId } = req.params;
      const filter = req.body || {};

      if (!dealerId) {
        return sendResponse(res, 400, "Dealer ID is required");
      }

      const data = await AnalyticsService.getDealerPaymentDetails(dealerId, filter);

      sendResponse(res, 200, "Dealer payment details fetched successfully", data);
    } catch (error) {
      logger.error(`getDealerPaymentDetails error: ${error.message}`);
      sendResponse(res, 400, error.message);
    }
  }

  /* =====================================================
     EXCEL EXPORT (GM/OWNER ONLY)
  ====================================================== */
  static async exportToExcel(req, res) {
    try {
      const filter = req.body || {};
      const userId = req.user.id;

      // Check if user is GM or Owner
      const userRole = await AnalyticsService.getUserRole(userId);
      
      if (!['gm', 'owner', 'admin'].includes(userRole)) {
        return sendResponse(res, 403, "Access denied. Only GM/Owner can export data.");
      }

      const data = await AnalyticsService.getExcelData(userId, filter);

      sendResponse(res, 200, "Excel data fetched successfully", data);
    } catch (error) {
      logger.error(`exportToExcel error: ${error.message}`);
      sendResponse(res, 400, error.message);
    }
  }
  static async getHomeStats(req, res) {
  try {
    const filter = req.body || {};
    const userId = req.user.id;

    const data = await AnalyticsService.getHomeStats(userId, filter);

    sendResponse(res, 200, "Home stats fetched successfully", data);
  } catch (error) {
    logger.error(`getHomeStats error: ${error.message}`);
    sendResponse(res, 400, error.message);
  }
}
}

module.exports = AnalyticsController;