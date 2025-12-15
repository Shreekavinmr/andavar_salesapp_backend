// src/app.js (FIXED: Proper views path setup with validation)
const express = require('express');
const path = require('path');
const fs = require('fs'); // To check if views folder exists
const cors = require('cors');
const helmet = require('helmet');
const logger = require('./utils/logger');
const punchRoutes = require('./routes/punchRoutes');
const orderRoutes = require('./routes/orderRoutes');

const authRoutes = require('./routes/authRoutes');

const app = express();

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"], // Allow scripts from same origin
      styleSrc: ["'self'", "'unsafe-inline'"], // Allow inline styles
    }
  }
}));
app.use(cors());
app.use((req, res, next) => {
  console.log(`Incoming request: ${req.method} ${req.originalUrl}`);
  next();
});
// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

app.use(express.static(path.join(__dirname, '../public')));

// Logging middleware
app.use((req, res, next) => {
  logger.info(`${req.method} ${req.path} - ${req.ip}`);
  next();
});

// ==========================================
// FIXED: EJS templating setup with validation
// ==========================================
app.set('view engine', 'ejs');

// __dirname points to 'src' folder
// Go up one level to project root, then into 'views'
const viewsPath = path.join(__dirname, '..', 'views');

// Check if views folder exists
if (!fs.existsSync(viewsPath)) {
  console.error('❌ ERROR: Views folder not found at:', viewsPath);
  console.log('Creating views folder...');
  fs.mkdirSync(viewsPath, { recursive: true });
  console.log('✅ Views folder created');
}

app.set('views', viewsPath);
console.log('✅ EJS Views Path set to:', viewsPath);

// Verify reset-password.ejs exists
const resetPasswordView = path.join(viewsPath, 'reset-password.ejs');
if (fs.existsSync(resetPasswordView)) {
  console.log('✅ reset-password.ejs found');
} else {
  console.error('❌ WARNING: reset-password.ejs NOT found at:', resetPasswordView);
  console.log('Please create the file manually');
}

// ==========================================
// Routes
// ==========================================

// API Routes (POST-only for auth)
app.use('/api/auth', authRoutes);
app.use('/api/attendance', punchRoutes); 



// Public route for reset form (GET /reset-password)
app.get('/reset-password', (req, res) => {
  try {
    const token = req.query.token || '';
    console.log('📧 Reset route hit, token:', token.substring(0, 10) + '...');
    
    if (!token) {
      return res.render('reset-password', { 
        token: '', 
        error: 'No reset token provided' 
      });
    }
    
    res.render('reset-password', { 
      token, 
      error: null 
    });
  } catch (error) {
    console.error('❌ Render error:', error.message);
    logger.error(`Reset password render error: ${error.stack}`);
    res.status(500).send(`
      <h2>Server Error</h2>
      <p>Could not load reset password form.</p>
      <p>Error: ${error.message}</p>
      <a href="/">Go to Home</a>
    `);
  }
});

// Health check
app.get('/health', (req, res) => {
  res.status(200).json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    viewsPath: viewsPath 
  });
});

// 404 handler
app.use('*', (req, res) => {
  logger.warn(`404: ${req.method} ${req.originalUrl}`);
  res.status(404).json({ message: 'Route not found' });
});

// Global error handler
app.use((err, req, res, next) => {
  logger.error(err.stack);
  res.status(500).json({ message: 'Internal server error' });
});

module.exports = app;