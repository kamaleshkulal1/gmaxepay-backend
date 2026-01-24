/**
 * app.js
 * Use `app.js` to run your app.
 * To start the server, run: `node app.js`.
 */

// Load environment variables FIRST before any other imports
const dotenv = require('dotenv');
dotenv.config({ path: '.env' });

const express = require('express');
const cors = require('cors');
const path = require('path');
global.__basedir = __dirname;
const passport = require('passport');
const routes = require('./routes');
const models = require('./models')
let logger = require('morgan');
const seeder = require('./seeder/seeder');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const { morganMiddleware, requestLogger, responseInterceptor, errorLogger } = require('./middleware/loggingMiddleware');
const { 
  sanitizeInput, 
  preventNoSqlInjection, 
  requestId, 
  secureErrorHandler,
  validateContentType 
} = require('./middleware/security');
const aepsLogout = require('./utils/aepsLogout');
  

const app = express();
// SECURITY: Enhanced helmet configuration
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'"],
        imgSrc: ["'self'", "data:", "https:"],
        connectSrc: ["'self'"],
        fontSrc: ["'self'"],
        objectSrc: ["'none'"],
        mediaSrc: ["'self'"],
        frameSrc: ["'none'"],
      },
    },
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    crossOriginEmbedderPolicy: false, // Set to true if you don't use iframes/embeds
    hsts: {
      maxAge: 31536000, // 1 year
      includeSubDomains: true,
      preload: true
    },
    xFrameOptions: { action: 'deny' }, // Prevent clickjacking
    xContentTypeOptions: true, // Prevent MIME type sniffing
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    permittedCrossDomainPolicies: false
  })
);
app.use(cookieParser());

// Trust proxy to get real client IP
app.set('trust proxy', true);

// CORS configuration - Allow all origins
// MUST be early in middleware chain to handle preflight OPTIONS requests
const corsOptions = {
  origin: function (origin, callback) {
    // Allow all origins - no validation
    callback(null, true);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-company-domain', 'x-request-id', 'token','x-company-id'],
  exposedHeaders: ['x-request-id'],
  maxAge: 86400, // Cache preflight for 24 hours
  optionsSuccessStatus: 200
};

// Apply CORS middleware - MUST be early to handle all requests including OPTIONS
app.use(cors(corsOptions));

// SECURITY: Request ID for tracking
app.use(requestId);

// IMPORTANT: responseHandler must run before any middleware that uses res.failure, res.internalServerError, etc.
app.use(require('./utils/response/responseHandler'));

// SECURITY: Validate Content-Type (now safe to use res.failure)
app.use(validateContentType);
const httpServer = require('http').createServer(app);
// SECURITY: Limit URL-encoded payload size (increased for file uploads)
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Use custom logging middleware instead of default morgan
app.use(morganMiddleware);
// SECURITY: Limit request body size (increased for file uploads, multer handles individual file limits)
app.use(express.json({ limit: '10mb' }));

// SECURITY: Input sanitization and NoSQL injection prevention
app.use(sanitizeInput);
app.use(preventNoSqlInjection);

app.use(requestLogger);
app.use(responseInterceptor);
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static('uploads'));

// SECURITY: Apply general rate limiting before routes
const { generalLimit } = require('./middleware/ratelimiter');
app.use(generalLimit);

// Favicon route
app.get('/favicon.ico', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'favicon.ico'));
});
// app.use(require('./middleware/hostCheck'));

app.get('/', (req, res) => {
  res.send(`gmaxepay is running successfully`);
});

app.get('/health', (req, res) => {
  try {
    // Basic health checks
    const healthStatus = {
      status: 'ok',
      message: 'gmaxepay is running beautifully',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: process.env.NODE_ENV || 'development'
    };
    
    // Return 200 OK status
    res.status(200).json(healthStatus);
  } catch (error) {
    // Return 500 Internal Server Error if something goes wrong
    res.status(500).json({
      status: 'error',
      message: 'Health check failed',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Helper function to detect IP type
function detectIPType(ip) {
  if (!ip || ip === 'unknown') return 'unknown';
  
  const ipv4Regex = /^(\d{1,3}\.){3}\d{1,3}$/;
  const ipv6Regex = /^([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$/;
  const ipv6CompressedRegex = /^([0-9a-fA-F]{1,4}:)*::([0-9a-fA-F]{1,4}:)*[0-9a-fA-F]{1,4}$/;
  
  if (ipv4Regex.test(ip)) return 'IPv4';
  if (ipv6Regex.test(ip) || ipv6CompressedRegex.test(ip)) return 'IPv6';
  return 'unknown';
}

// If needed for debugging, add authentication and only enable in development
if (process.env.NODE_ENV === 'development' && process.env.ENABLE_DEBUG_ENDPOINTS === 'true') {
  // Add authentication middleware here if you need this endpoint
  app.get('/test-ip', require('./middleware/authentication'), (req, res) => {
    res.json({
      message: 'IP tracking test (development only)',
      detectedIP: req.ip,
      detectedIPType: detectIPType(req.ip),
      timestamp: new Date().toISOString()
    });
  });
}
// Error handling middleware
app.use(errorLogger);

// SECURITY: Secure error handler (must be last error handler)
app.use(secureErrorHandler);

app.use((req, res, next) => {
  next();
});

function name() {
  console.log('Router is Working!');
}

if (process.env.NODE_ENV !== 'test') {
  // models.sequelize
  //   .sync({ alter: true })
  //   .then(() => {})
  //   .finally(() => {
  //     app.use(routes);
      
  //     // seeder();
  //     name();
  //     aepsLogout();
  //   });
  app.use(routes);
  httpServer.listen(process.env.PORT, () => {
    console.log(`gmaxepay is running on port ${process.env.PORT} successfully.`);
  });
} else {
  module.exports = app;
}
