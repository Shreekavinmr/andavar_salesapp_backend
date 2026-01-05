// src/services/authService.js (Updated: Use local backend URL for reset link)
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const supabase = require('../config/supabase');
const UserModel = require('../models/userModel');
const logger = require('../utils/logger');

class AuthService {

  static async _sendResetEmail(email, token, userName) {
    const transporter = nodemailer.createTransport({
      service: 'gmail', // Or 'outlook', 'sendgrid', etc.
      auth: {
        user: process.env.EMAIL_USER, // Add to .env: EMAIL_USER=your@gmail.com
        pass: process.env.EMAIL_PASS, // App password for Gmail
      },
    });

    // Updated: Local backend URL for testing (opens in browser at localhost:3000)
    const resetUrl = `http://localhost:3000/reset-password?token=${token}`;

    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: email,
      subject: 'Password Reset - Andavar',
      html: `
        <h2>Hello ${userName},</h2>
        <p>You requested a password reset. Click the link below to reset your password:</p>
        <a href="${resetUrl}">Reset Password</a>
        <p>This link expires in 1 hour.</p>
        <p>If you didn't request this, ignore this email.</p>
        <p>Best,<br>Andavar Team</p>
      `,
    };

    try {
      await transporter.sendMail(mailOptions);
      logger.info(`Reset email sent to ${email}`);
    } catch (error) {
      logger.error(`Email send error for ${email}: ${error.message}`);
      throw new Error('Failed to send reset email');
    }
  }

static async login(email, password) {
  try {

    const isEmail = email.includes('@');
    // Find user by email
    const user = isEmail 
      ? await UserModel.findByEmail(email)
      : await UserModel.findByMobile(email);
    
    if (!user) {
      throw new Error('Invalid credentials');
    }

    // Compare password
    const isPasswordValid = await bcrypt.compare(password, user.password_hash);
    if (!isPasswordValid) {
      throw new Error('Invalid email or password');
    }

    // Handle role - convert comma-separated string to array
    let roles = [];
    if (user.role) {
      if (typeof user.role === 'string') {
        // Split comma-separated roles: "admin,employee" -> ["admin", "employee"]
        roles = user.role.split(',').map(r => r.trim());
      } else if (Array.isArray(user.role)) {
        roles = user.role;
      }
    }


    // Generate JWT with roles as array
    const token = jwt.sign(
      { 
        id: user.id,
        userId: user.id,       // Keep for backward compatibility
        email: user.email, 
        roles: roles           // Store as array in JWT
      },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN }
    );

    // Update last_login
    await supabase
      .from('profiles_onboard')
      .update({ last_login: new Date().toISOString() })
      .eq('id', user.id);

    logger.info(`User logged in: ${user.email} (${roles.join(',')})`);

    return {
      token,
      user: { 
        id: user.id, 
        email: user.email, 
        full_name: user.full_name,
        roles: roles,  // Return as array
        role: user.role, // Keep original for reference
        employee_code: user.employee_code
      }
    };
  } catch (error) {
    logger.error(`Login error for ${email}: ${error.message}`);
    throw error;
  }
}

  static async forgotPassword(email) {
    try {
      const user = await UserModel.findByEmail(email);
      if (!user) {
        throw new Error('No account found with that email');
      }

      // Generate reset token (UUID + expiry)
      const token = crypto.randomUUID();
      const expiry = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

      await UserModel.setResetToken(user.id, token, expiry);

      // Send email
      await AuthService._sendResetEmail(user.email, token, user.full_name);

      logger.info(`Password reset requested for ${email}`);
      return { message: 'Reset link sent to your email' };
    } catch (error) {
      logger.error(`Forgot password error for ${email}: ${error.message}`);
      throw error;
    }
  }

  // New: Reset Password (called from reset link)
  static async resetPassword(token, newPassword) {
    try {
      const user = await UserModel.findByResetToken(token);
      if (!user) {
        throw new Error('Invalid or expired reset token');
      }

      const hashedPassword = await bcrypt.hash(newPassword, 10);

      await UserModel.updatePassword(user.id, hashedPassword);

      logger.info(`Password reset for ${user.email}`);
      return { message: 'Password reset successful' };
    } catch (error) {
      logger.error(`Reset password error: ${error.message}`);
      throw error;
    }
  }

  static async logout(userId, token) {
    try {
      // Optional: Blacklist token (simple in-memory; use Redis for prod)
      const tokenBlacklist = new Set(); // Or global if needed
      tokenBlacklist.add(token);

      // Optional: Update DB (e.g., last_logout)
      await supabase
        .from('profiles_onboard')
        .update({ last_logout: new Date().toISOString() }) // Add column if not exists
        .eq('id', userId);

      logger.info(`User logged out: ${userId}`);
      return { message: 'Logout successful' };
    } catch (error) {
      logger.error(`Logout error for ${userId}: ${error.message}`);
      throw new Error('Logout failed');
    }
  }
}

module.exports = AuthService;