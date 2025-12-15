const express = require('express');
const { authenticateToken } = require('../middleware/auth');
const requireSameDayLogin = require('../middleware/requireSameDayLogin');
const LocationController = require('../controllers/locationController');

const router = express.Router();

router.post(
  '/tracking/start',
  authenticateToken,
  requireSameDayLogin,
  LocationController.startTracking
);

router.post(
  '/tracking/stop',
  authenticateToken,
  requireSameDayLogin,
  LocationController.stopTracking
);

router.post(
  '/tracking/location',
  authenticateToken,
  requireSameDayLogin,
  LocationController.logLocation
);

router.get(
  '/tracking/route',
  authenticateToken,
  requireSameDayLogin,
  LocationController.getRoute
);

router.get(
  '/tracking/distance',
  authenticateToken,
  requireSameDayLogin,
  LocationController.getDailyDistance
);

module.exports = router; 
