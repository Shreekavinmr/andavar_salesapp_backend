const LocationService = require('../services/locationService');
const { sendResponse } = require('../utils/responseHandler');
const logger = require('../utils/logger');

class LocationController {

  static async startTracking(req, res) {
    try {
      const result = await LocationService.startSession(req.user.id);
      sendResponse(res, 200, 'Tracking started', result);
    } catch (e) {
      logger.error(`Start tracking error: ${e.message}`);
      sendResponse(res, 400, e.message);
    }
  }

  static async stopTracking(req, res) {
    try {
      const result = await LocationService.stopSession(req.user.id);
      sendResponse(res, 200, 'Tracking stopped', result);
    } catch (e) {
      logger.error(`Stop tracking error: ${e.message}`);
      sendResponse(res, 400, e.message);
    }
  }

  static async logLocation(req, res) {
    try {
      const payload = req.body;
      const result = await LocationService.insertLocation(req.user.id, payload);
      sendResponse(res, 201, 'Location saved', result);
    } catch (e) {
      logger.error(`Log location error: ${e.message}`);
      sendResponse(res, 400, e.message);
    }
  }

  static async getRoute(req, res) {
    try {
      const { user_id, date } = req.query;
      const result = await LocationService.getRoute(user_id, date, req.user);
      sendResponse(res, 200, 'Route fetched', result);
    } catch (e) {
      logger.error(`Get route error: ${e.message}`);
      sendResponse(res, 400, e.message);
    }
  }

  static async getDailyDistance(req, res) {
    try {
      const { user_id, date } = req.query;
      const result = await LocationService.getDailyDistance(user_id, date, req.user);
      sendResponse(res, 200, 'Distance fetched', result);
    } catch (e) {
      logger.error(`Get distance error: ${e.message}`);
      sendResponse(res, 400, e.message);
    }
  }
}

module.exports = LocationController;
