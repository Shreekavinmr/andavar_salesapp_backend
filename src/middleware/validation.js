// src/middleware/validation.js (Support email OR phone login)
const { body, validationResult } = require('express-validator');
const { sendResponse } = require('../utils/responseHandler');
const logger = require('../utils/logger');

// Custom validator function for email OR phone
const isEmailOrPhone = (value) => {
  if (!value || typeof value !== 'string') {
    return false;
  }

  const trimmedValue = value.trim();
  
  // Check if it's a valid email
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (emailRegex.test(trimmedValue)) {
    return true;
  }

  // Check if it's a valid phone (10-15 digits, optional +)
  const phoneRegex = /^\+?\d{10,15}$/;
  if (phoneRegex.test(trimmedValue)) {
    return true;
  }

  return false;
};

// Validation middleware for login (supports both email and phone)
const validateLogin = [
  // Support both 'identifier' (new) and 'email' (backward compatibility)
  body('identifier')
    .optional()
    .custom((value) => {
      if (!isEmailOrPhone(value)) {
        throw new Error('Must be a valid email or phone number (10-15 digits)');
      }
      return true;
    }),
  
  // Backward compatibility: also accept 'email' field
  body('email')
    .optional()
    .custom((value) => {
      if (!isEmailOrPhone(value)) {
        throw new Error('Must be a valid email or phone number (10-15 digits)');
      }
      return true;
    }),

  // Password validation
  body('password')
    .notEmpty()
    .withMessage('Password is required')
    .isLength({ min: 6 })
    .withMessage('Password must be at least 6 characters'),

  // Custom validation to ensure at least one identifier exists
  (req, res, next) => {
    const errors = validationResult(req);
    
    // Check if either 'identifier' or 'email' is provided
    if (!req.body.identifier && !req.body.email) {
      logger.warn('Validation failed: No identifier provided');
      return sendResponse(res, 400, 'Email or phone number is required');
    }

    if (!errors.isEmpty()) {
      logger.warn('Validation failed for login');
      return sendResponse(res, 400, 'Validation failed', null, errors.array());
    }
    
    next();
  }
];

// Validation middleware for forgot password
const validateForgotPassword = [
  // Support both 'identifier' (new) and 'email' (backward compatibility)
  body('identifier')
    .optional()
    .custom((value) => {
      if (!isEmailOrPhone(value)) {
        throw new Error('Must be a valid email or phone number (10-15 digits)');
      }
      return true;
    }),
  
  // Backward compatibility: also accept 'email' field
  body('email')
    .optional()
    .custom((value) => {
      if (!isEmailOrPhone(value)) {
        throw new Error('Must be a valid email or phone number (10-15 digits)');
      }
      return true;
    }),

  // Custom validation to ensure at least one identifier exists
  (req, res, next) => {
    const errors = validationResult(req);
    
    // Check if either 'identifier' or 'email' is provided
    if (!req.body.identifier && !req.body.email) {
      logger.warn('Validation failed: No identifier provided for forgot password');
      return sendResponse(res, 400, 'Email or phone number is required');
    }

    if (!errors.isEmpty()) {
      logger.warn('Validation failed for forgot password');
      return sendResponse(res, 400, 'Validation failed', null, errors.array());
    }
    
    next();
  }
];

// Validation for reset password
const validateResetPassword = [
  body('token')
    .notEmpty()
    .withMessage('Reset token is required')
    .isUUID()
    .withMessage('Invalid token format'),
  
  body('password')
    .notEmpty()
    .withMessage('New password is required')
    .isLength({ min: 6 })
    .withMessage('Password must be at least 6 characters')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .withMessage('Password must contain at least one uppercase letter, one lowercase letter, and one number'),

  (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      logger.warn('Validation failed for reset password');
      return sendResponse(res, 400, 'Validation failed', null, errors.array());
    }
    next();
  }
];

// Helper function to sanitize phone numbers (remove spaces, dashes, etc.)
const sanitizePhone = (phone) => {
  if (!phone) return null;
  // Remove all non-digit characters except leading +
  return phone.replace(/[^\d+]/g, '');
};

// Helper function to normalize identifier (for database queries)
const normalizeIdentifier = (identifier) => {
  if (!identifier) return null;
  
  const trimmed = identifier.trim();
  
  // If it's a phone number, sanitize it
  if (/^\+?\d{10,15}$/.test(trimmed)) {
    return sanitizePhone(trimmed);
  }
  
  // If it's an email, normalize it
  return trimmed.toLowerCase();
};

module.exports = { 
  validateLogin, 
  validateForgotPassword,
  isEmailOrPhone,
  sanitizePhone,
  normalizeIdentifier
};