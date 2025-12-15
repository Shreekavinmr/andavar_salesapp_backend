// src/middleware/auth.js (Using existing responseHandler)
const jwt = require('jsonwebtoken');
const { sendResponse } = require('../utils/responseHandler'); // Make sure this path is correct
const logger = require('../utils/logger');

const authenticateToken = (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
      return sendResponse(res, 401, 'Access token required');
    }

    jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
      if (err) {
        logger.warn(`Token verification failed: ${err.message}`);
        return sendResponse(res, 403, 'Invalid or expired token');
      }
      req.user = user;
      next();
    });
  } catch (error) {
    logger.error(`Auth middleware error: ${error.message}`);
    return sendResponse(res, 500, 'Authentication error');
  }
};

const requireAdmin = (req, res, next) => {
  try {
    if (!req.user) {
      return sendResponse(res, 401, 'Authentication required');
    }

    console.log('🔍 FULL req.user object:', JSON.stringify(req.user, null, 2));

    // Handle both 'roles' (plural) and 'role' (singular) from token
    let userRoles = req.user.roles || req.user.role; // Try both
    
    console.log('🔍 Raw userRoles:', userRoles);
    console.log('🔍 Type:', typeof userRoles);

    // If roles is a string, split it into an array
    if (typeof userRoles === 'string') {
      userRoles = userRoles.split(',').map(role => role.trim());
    }
    
    // Ensure it's an array
    if (!Array.isArray(userRoles)) {
      userRoles = [];
    }

    console.log('🔍 Processed userRoles array:', userRoles);
    console.log('🔍 Has admin?', userRoles.includes('admin'));
    console.log('🔍 Has owner?', userRoles.includes('owner'));

    // Check if user has admin role (or owner, which should also have admin access)
    if (
  !userRoles.includes('admin') &&
  !userRoles.includes('owner') &&
  !userRoles.includes('gm')
) {
  logger.warn(`Access denied for user ${req.user.id || req.user.userId}: Not an admin`);
  return sendResponse(res, 403, 'Access denied. Admin role required.');
}

    next();
  } catch (error) {
    logger.error(`Admin check error: ${error.message}`);
    return sendResponse(res, 500, 'Authorization error');
  }
};

module.exports = {
  authenticateToken,
  requireAdmin
};