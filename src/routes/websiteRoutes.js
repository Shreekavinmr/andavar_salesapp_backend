// src/routes/websiteRoutes.js
const express = require('express');
const WebsiteController = require('../controllers/WebsiteController');
const router = express.Router();

// Contact form submission
router.post('/contact', WebsiteController.submitContactForm);

// Dealer enquiry form submission
router.post('/dealers-enquiry', WebsiteController.submitDealerEnquiry);

module.exports = router;