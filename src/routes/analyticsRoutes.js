// src/routes/analytics.js - COMPLETE FILE
const express = require("express");
const { authenticateToken } = require("../middleware/auth");
const requireSameDayLogin = require("../middleware/requireSameDayLogin");
const AnalyticsController = require("../controllers/analyticsController");

const router = express.Router();

/* =====================================================
   MAIN DASHBOARD
   POST /api/analytics/dashboard
   Body: { type: "year|month|custom", year, month?, from?, to? }
====================================================== */
router.post(
  "/dashboard",
  authenticateToken,
  requireSameDayLogin,
  AnalyticsController.getDashboard
);

/* =====================================================
   SO DRILL-DOWN: Get dealers under specific SO
   POST /api/analytics/so/:soId/dealers
   Body: { type: "year|month|custom", year, month?, from?, to? }
====================================================== */
router.post(
  "/so/:soId/dealers",
  authenticateToken,
  requireSameDayLogin,
  AnalyticsController.getSoDrilldown
);

/* =====================================================
   PRODUCT-WISE ANALYTICS
   POST /api/analytics/product-wise
   Body: { type: "year|month|custom", year, month?, from?, to? }
====================================================== */
router.post(
  "/product-wise",
  authenticateToken,
  requireSameDayLogin,
  AnalyticsController.getProductWiseAnalytics
);

/* =====================================================
   SO-WISE ANALYTICS (FOR CHARTS)
   POST /api/analytics/so-wise
   Body: { type: "year|month|custom", year, month?, from?, to? }
====================================================== */
router.post(
  "/so-wise",
  authenticateToken,
  requireSameDayLogin,
  AnalyticsController.getSoWiseAnalytics
);

/* =====================================================
   DEALER ORDER DETAILS (DRILL-DOWN)
   POST /api/analytics/dealer/:dealerId/so/:soId/orders
   Body: { type: "year|month|custom", year, month?, from?, to? }
====================================================== */
router.post(
  "/dealer/:dealerId/so/:soId/orders",
  authenticateToken,
  requireSameDayLogin,
  AnalyticsController.getDealerOrderDetails
);

/* =====================================================
   DEALER PAYMENT DETAILS (DRILL-DOWN)
   POST /api/analytics/dealer/:dealerId/payments
   Body: { type: "year|month|custom", year, month?, from?, to? }
====================================================== */
router.post(
  "/dealer/:dealerId/payments",
  authenticateToken,
  requireSameDayLogin,
  AnalyticsController.getDealerPaymentDetails
);

/* =====================================================
   EXCEL EXPORT
   POST /api/analytics/export/excel
   Body: { type: "year|month|custom", year, month?, from?, to? }
====================================================== */
router.post(
  "/export/excel",
  authenticateToken,
  requireSameDayLogin,
  AnalyticsController.exportToExcel
);
router.post(
  "/home-stats",
  authenticateToken,
  requireSameDayLogin,
  AnalyticsController.getHomeStats
);

module.exports = router;