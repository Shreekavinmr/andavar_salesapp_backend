// src/routes/punchRoutes.js (NEW FILE)
const express = require('express');
const { authenticateToken } = require('../middleware/auth');
const requireSameDayLogin = require('../middleware/requireSameDayLogin');
const PunchController = require('../controllers/punchController');

const router = express.Router();

// ============================================
// PUNCH IN/OUT ROUTES
// ============================================

// Punch In - Must login today to punch in
router.post('/punch-in', 
  authenticateToken, 
  requireSameDayLogin, 
  PunchController.punchIn
);

// Punch Out - Must login today to punch out
router.post('/punch-out', 
  authenticateToken, 
  requireSameDayLogin, 
  PunchController.punchOut
);

// Get Today's Punch Status
router.get('/today', 
  authenticateToken, 
  requireSameDayLogin,
  PunchController.getTodayStatus
);

// Get Punch History (Past records)
router.get('/history', 
  authenticateToken, 
  PunchController.getHistory
);

// Get Monthly Summary
router.get('/summary/:year/:month', 
  authenticateToken, 
  PunchController.getMonthlySummary
);

// Admin: Get all punches for a date range
router.get('/admin/report', 
  authenticateToken, 
  PunchController.getAdminReport
);

module.exports = router;