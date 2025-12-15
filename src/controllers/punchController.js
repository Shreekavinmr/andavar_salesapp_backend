// src/controllers/punchController.js (NEW FILE)
const PunchService = require('../services/punchService');
const { sendResponse } = require('../utils/responseHandler');
const logger = require('../utils/logger');

class PunchController {
  
 static async punchIn(req, res) {
  try {
    const userId = req.user.id;
    const { latitude, longitude, address, clientDate, timezone } = req.body;

    if (!latitude || !longitude) {
      return sendResponse(res, 400, 'Location is required for punch in');
    }

    const result = await PunchService.punchIn({
      userId,
      latitude,
      longitude,
      address: address || null,
      clientDate: clientDate || null,
      timezone: timezone || null,
      ip: req.ip || req.headers['x-forwarded-for'] || null,
      deviceInfo: req.headers['user-agent'] || null
    });

    logger.info(`Punch In: User ${userId} at ${latitude},${longitude}`);
    sendResponse(res, 200, 'Punched in successfully', result);

  } catch (error) {
    logger.error(`Punch In error: ${error.message}`);
    sendResponse(res, 400, error.message);
  }
}
  
  static async punchOut(req, res) {
    try {
      const userId = req.user.id;
      const { latitude, longitude, address } = req.body;
      
      if (!latitude || !longitude) {
        return sendResponse(res, 400, 'Location is required for punch out');
      }
      
      const result = await PunchService.punchOut({
        userId,
        latitude,
        longitude,
        address: address || null,
        ip: req.ip || req.headers['x-forwarded-for'] || null,
        deviceInfo: req.headers['user-agent'] || null
      });
      
      logger.info(`Punch Out: User ${userId} at ${latitude},${longitude}`);
      sendResponse(res, 200, 'Punched out successfully', result);
      
    } catch (error) {
      logger.error(`Punch Out error: ${error.message}`);
      sendResponse(res, 400, error.message);
    }
  }
  
  static async getTodayStatus(req, res) {
    try {
      const userId = req.user.id;
      const result = await PunchService.getTodayStatus(userId);
      
      sendResponse(res, 200, 'Today\'s punch status', result);
      
    } catch (error) {
      logger.error(`Get Today Status error: ${error.message}`);
      sendResponse(res, 400, error.message);
    }
  }
  
  static async getHistory(req, res) {
    try {
      const userId = req.user.id;
      const { startDate, endDate, limit = 30 } = req.query;
      
      const result = await PunchService.getHistory({
        userId,
        startDate,
        endDate,
        limit: parseInt(limit)
      });
      
      sendResponse(res, 200, 'Punch history retrieved', result);
      
    } catch (error) {
      logger.error(`Get History error: ${error.message}`);
      sendResponse(res, 400, error.message);
    }
  }
  
  static async getMonthlySummary(req, res) {
    try {
      const userId = req.user.id;
      const { year, month } = req.params;
      
      const result = await PunchService.getMonthlySummary({
        userId,
        year: parseInt(year),
        month: parseInt(month)
      });
      
      sendResponse(res, 200, 'Monthly summary', result);
      
    } catch (error) {
      logger.error(`Get Monthly Summary error: ${error.message}`);
      sendResponse(res, 400, error.message);
    }
  }
  
  static async getAdminReport(req, res) {
    try {
      const { startDate, endDate, employeeId } = req.query;
      
      // Check if user is admin/manager
      const userRoles = req.user.roles || [];
    //   if (!userRoles.includes('admin') && !userRoles.includes('manager')) {
    //     return sendResponse(res, 403, 'Unauthorized: Admin/Manager access required');
    //   }
      
      const result = await PunchService.getAdminReport({
        startDate,
        endDate,
        employeeId,
        requestorId: req.user.id
      });
      
      sendResponse(res, 200, 'Admin report retrieved', result);
      
    } catch (error) {
      logger.error(`Get Admin Report error: ${error.message}`);
      sendResponse(res, 400, error.message);
    }
  }
}

module.exports = PunchController;