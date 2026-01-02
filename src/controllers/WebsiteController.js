// src/controllers/WebsiteController.js
const nodemailer = require('nodemailer');
const logger = require('../utils/logger');
const { sendResponse } = require('../utils/responseHandler');

// Email configuration
const createTransporter = () => {
  return nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });
};

class WebsiteController {
  // Submit contact form
  static async submitContactForm(req, res) {
    try {
      const { name, email, subject, message, secretKey } = req.body;

      // Validate secret key
      if (secretKey !== 'fghjnwri7653r2rghjebfh') {
        return sendResponse(res, 403, 'Invalid secret key');
      }

      // Validate required fields
      if (!name || !email || !subject || !message) {
        return sendResponse(res, 400, 'All fields are required');
      }

      // Email validation
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        return sendResponse(res, 400, 'Invalid email format');
      }

      // Create email transporter
      const transporter = createTransporter();

      // Email content
      const mailOptions = {
        from: process.env.EMAIL_USER,
        to: process.env.EMAIL_USER, // Send to your email
        replyTo: email, // Allow reply to customer
        subject: `Contact Form: ${subject}`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #333; border-bottom: 2px solid #4CAF50; padding-bottom: 10px;">
              New Contact Form Submission
            </h2>
            
            <div style="background-color: #f9f9f9; padding: 20px; margin: 20px 0; border-radius: 5px;">
              <p><strong>Name:</strong> ${name}</p>
              <p><strong>Email:</strong> ${email}</p>
              <p><strong>Subject:</strong> ${subject}</p>
            </div>
            
            <div style="margin: 20px 0;">
              <h3 style="color: #555;">Message:</h3>
              <p style="line-height: 1.6; color: #666;">${message}</p>
            </div>
            
            <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #ddd; color: #999; font-size: 12px;">
              <p>This email was sent from the contact form on your website.</p>
              <p>Submitted on: ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}</p>
            </div>
          </div>
        `,
      };

      // Send email
      await transporter.sendMail(mailOptions);

      logger.info(`Contact form submitted by ${name} (${email})`);

      return sendResponse(res, 200, 'Message sent successfully', {
        name,
        email,
        subject,
      });
    } catch (error) {
      logger.error(`Contact form error: ${error.message}`);
      console.log(`Contact form error: ${error.message}`);
      return sendResponse(res, 500, 'Failed to send message. Please try again later.');
    }
  }

  // Submit dealer enquiry
  static async submitDealerEnquiry(req, res) {
    try {
      const {
        name,
        phone,
        email,
        businessName,
        location,
        brands,
        message,
        secretKey,
      } = req.body;

      // Validate secret key
      if (secretKey !== 'andavarplus@dealer') {
        return sendResponse(res, 403, 'Invalid secret key');
      }

      // Validate required fields
      if (!name || !phone || !email || !businessName || !location || !brands || !message) {
        return sendResponse(res, 400, 'All fields are required');
      }

      // Email validation
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        return sendResponse(res, 400, 'Invalid email format');
      }

      // Phone validation (basic)
      const phoneRegex = /^[0-9]{10,15}$/;
      if (!phoneRegex.test(phone.replace(/[\s\-\+]/g, ''))) {
        return sendResponse(res, 400, 'Invalid phone number');
      }

      // Create email transporter
      const transporter = createTransporter();

      // Email content
      const mailOptions = {
        from: process.env.EMAIL_USER,
        to: process.env.EMAIL_USER, // Send to your email
        replyTo: email, // Allow reply to customer
        subject: `Dealer Enquiry: ${businessName} - ${location}`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 700px; margin: 0 auto;">
            <h2 style="color: #333; border-bottom: 3px solid #FF6B35; padding-bottom: 10px;">
              🎉 New Dealer/Distributor Enquiry
            </h2>
            
            <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 20px; margin: 20px 0; border-radius: 10px;">
              <h3 style="margin: 0 0 15px 0;">Contact Information</h3>
              <p style="margin: 5px 0;"><strong>Name:</strong> ${name}</p>
              <p style="margin: 5px 0;"><strong>Phone:</strong> ${phone}</p>
              <p style="margin: 5px 0;"><strong>Email:</strong> ${email}</p>
            </div>
            
            <div style="background-color: #f9f9f9; padding: 20px; margin: 20px 0; border-radius: 10px; border-left: 4px solid #4CAF50;">
              <h3 style="color: #555; margin-top: 0;">Business Details</h3>
              <p><strong>Business/Shop Name:</strong> ${businessName}</p>
              <p><strong>Location:</strong> ${location}</p>
              <p><strong>Interested Brands:</strong> <span style="color: #4CAF50; font-weight: bold;">${brands}</span></p>
            </div>
            
            <div style="margin: 20px 0; padding: 20px; background-color: #fff9e6; border-radius: 10px;">
              <h3 style="color: #555; margin-top: 0;">Message from Enquirer:</h3>
              <p style="line-height: 1.6; color: #666; font-style: italic;">${message}</p>
            </div>
            
            <div style="margin-top: 30px; padding: 20px; background-color: #e8f5e9; border-radius: 10px;">
              <h3 style="color: #2e7d32; margin-top: 0;">📋 Next Steps:</h3>
              <ol style="color: #555; line-height: 1.8;">
                <li>Contact the enquirer within 24 hours</li>
                <li>Verify business credentials and GST details</li>
                <li>Share dealership terms and conditions</li>
                <li>Schedule a territory discussion meeting</li>
              </ol>
            </div>
            
            <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #ddd; color: #999; font-size: 12px; text-align: center;">
              <p>This enquiry was submitted through the Dealer Enquiry Form</p>
              <p>Submitted on: ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}</p>
            </div>
          </div>
        `,
      };

      // Send email
      await transporter.sendMail(mailOptions);

      logger.info(`Dealer enquiry submitted by ${name} (${businessName}) - ${location}`);

      return sendResponse(res, 200, 'Your enquiry has been successfully submitted', {
        name,
        businessName,
        location,
        brands,
      });
    } catch (error) {
      logger.error(`Dealer enquiry error: ${error.message}`);
      return sendResponse(res, 500, 'Failed to submit enquiry. Please try again later.');
    }
  }
}

module.exports = WebsiteController;