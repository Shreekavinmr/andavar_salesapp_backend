const AuthService = require('../services/authService');
const { sendResponse } = require('../utils/responseHandler');
const logger = require('../utils/logger');
const AuditService = require('../services/auditService');

class AuthController {

  static async login(req, res) {
    try {
      const { identifier, email, password, emp_code, location } = req.body;
      
      // Support both 'identifier' (new) and 'email' (backward compatibility)
      const loginIdentifier = identifier || email;
      
      if (!loginIdentifier) {
        return sendResponse(res, 400, 'Email or phone number required');
      }

      const result = await AuthService.login(loginIdentifier, password);
      const user = result.user;

      // Non-blocking audit log
      AuditService.recordLogin({
        userId: user.id,
        empCode: user.employee_code || emp_code || null,
        email: user.email,
        latitude: location?.lat ?? null,
        longitude: location?.lng ?? null,
        ip: req.ip || req.headers['x-forwarded-for'] || null,
        userAgent: req.headers['user-agent'] || null,
        event: 'login'
      }).catch(err => console.error('Audit log failed:', err));

      sendResponse(res, 200, 'Login successful', result);
    } catch (error) {
      logger.error(`Auth controller login error: ${error.message}`);
      sendResponse(res, 401, error.message);
    }
  } // ← This closing brace was MISSING!

  static async logout(req, res) {
    try {
      const userId = req.user.userId;
      const token = req.headers.authorization?.split(' ')[1];
      if (!token) {
        return sendResponse(res, 400, 'Token required');
      }
      const result = await AuthService.logout(userId, token);
      sendResponse(res, 200, result.message);
    } catch (error) {
      logger.error(`Auth controller logout error: ${error.message}`);
      sendResponse(res, 400, error.message);
    }
  }

  static async forgotPassword(req, res) {
    try {
      const { identifier, email } = req.body;
      const resetIdentifier = identifier || email;
      
      if (!resetIdentifier) {
        return sendResponse(res, 400, 'Email or phone number required');
      }
      
      const result = await AuthService.forgotPassword(resetIdentifier);
      sendResponse(res, 200, result.message);
    } catch (error) {
      logger.error(`Auth controller forgot password error: ${error.message}`);
      sendResponse(res, 400, error.message);
    }
  }

  static async resetPassword(req, res) {
    try {
      const { token, password } = req.body;
      if (!token || !password) {
        return sendResponse(res, 400, 'Token and new password required');
      }
      const result = await AuthService.resetPassword(token, password);
      sendResponse(res, 200, result.message);
    } catch (error) {
      logger.error(`Auth controller reset password error: ${error.message}`);
      sendResponse(res, 400, error.message);
    }
  }

  static renderResetForm(req, res) {
    try {
      const token = req.query.token;
      if (!token) {
        return res.status(400).render('reset-password', { 
          token: '', 
          error: 'No token provided' 
        });
      }
      res.render('reset-password', { token, error: null });
    } catch (error) {
      logger.error(`Render reset form error: ${error.message}`);
      res.status(500).render('reset-password', { 
        token: '', 
        error: 'Server error - try again' 
      });
    }
  }

  static async updateLocation(req, res) {
    try {
      const userId = req.user.userId;
      const { latitude, longitude } = req.body;

      if (!latitude || !longitude) {
        return sendResponse(res, 400, 'Latitude and longitude required');
      }

      // Non-blocking audit log for location
      AuditService.recordLocationUpdate({
        userId,
        latitude,
        longitude,
        ip: req.ip || req.headers['x-forwarded-for'] || null,
        userAgent: req.headers['user-agent'] || null,
        event: 'location_update'
      }).catch(err => logger.error('Location audit failed:', err));

      logger.info(`Location updated for user ${userId}: ${latitude}, ${longitude}`);
      sendResponse(res, 200, 'Location updated successfully');
    } catch (error) {
      logger.error(`Update location error: ${error.message}`);
      sendResponse(res, 500, 'Failed to update location');
    }
  }
}

module.exports = AuthController;