const AuthService = require('../services/authService');
const { sendResponse } = require('../utils/responseHandler');
const logger = require('../utils/logger');
const AuditService = require('../services/auditService');

class AuthController {

static async login(req, res) {
  try {
    const { email, password, emp_code, location } = req.body;
    const result = await AuthService.login(email, password); // existing
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
}


  static async logout(req, res) {
    try {
      const userId = req.user.userId; // From verified token
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
      const { email } = req.body;
      const result = await AuthService.forgotPassword(email);
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

  // NEW: Render reset form (handles GET /reset-password)
  static renderResetForm(req, res) {
    try {
      const token = req.query.token;
      if (!token) {
        return res.status(400).render('reset-password', { token: '', error: 'No token provided' });
      }
      // Optional: Quick validate token (not expired)
      // But for UI, just render
      res.render('reset-password', { token, error: null });
    } catch (error) {
      logger.error(`Render reset form error: ${error.message}`);
      res.status(500).render('reset-password', { token: '', error: 'Server error - try again' });
    }
  }
}

module.exports = AuthController;