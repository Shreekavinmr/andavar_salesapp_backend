// src/middleware/validation.js (Updated field name to 'email')
const { body, validationResult } = require('express-validator');
const { sendResponse } = require('../utils/responseHandler');
const logger = require('../utils/logger');

// Validation middleware for login
const validateLogin = [
  body('email').isEmail().normalizeEmail().withMessage('Valid email is required'), // Changed from 'email_id' to 'email'
  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),

  (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      logger.warn('Validation failed for login');
      return sendResponse(res, 400, 'Validation failed', null, errors.array());
    }
    next();
  }
];

const validateForgotPassword = [
  body('email').isEmail().normalizeEmail().withMessage('Valid email is required'),

  (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      logger.warn('Validation failed for forgot password');
      return sendResponse(res, 400, 'Validation failed', null, errors.array());
    }
    next();
  }
];

module.exports = { validateLogin,validateForgotPassword };