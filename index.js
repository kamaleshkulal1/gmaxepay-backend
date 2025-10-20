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

const app = express();
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' }
  })
);
app.use(cookieParser());

// Trust proxy to get real client IP
app.set('trust proxy', true);
app.use(require('./utils/response/responseHandler'));
const httpServer = require('http').createServer(app);
app.use(express.urlencoded({ extended: true }));

const corsOptions = {
  origin: function (origin, callback) {
    if (!origin || process.env.ALLOWED_ORIGINS.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
};
// app.post(
//   '/retailer/payment/zaakapay/callback',
//   cors(),
//   paymentController.zaakapayCallback
// );
app.use(cors(corsOptions));

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Use custom logging middleware instead of default morgan
app.use(morganMiddleware);
app.use(express.json());
app.use(requestLogger);
app.use(responseInterceptor);
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static('uploads'));

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

// Test endpoint for IP tracking
app.get('/test-ip', (req, res) => {
  const ipSources = {
    'req.ip': req.ip,
    'req.connection.remoteAddress': req.connection?.remoteAddress,
    'req.socket.remoteAddress': req.socket?.remoteAddress,
    'req.connection.socket.remoteAddress': req.connection?.socket?.remoteAddress,
    'x-forwarded-for': req.headers['x-forwarded-for'],
    'x-real-ip': req.headers['x-real-ip'],
    'x-client-ip': req.headers['x-client-ip'],
    'cf-connecting-ip': req.headers['cf-connecting-ip'],
    'x-cluster-client-ip': req.headers['x-cluster-client-ip'],
    'x-forwarded': req.headers['x-forwarded'],
    'forwarded-for': req.headers['forwarded-for'],
    'forwarded': req.headers['forwarded']
  };
  
  // Debug: log all headers
  console.log('All headers received:', req.headers);
  console.log('IP sources:', ipSources);
  console.log('CF-Connecting-IP:', req.headers['cf-connecting-ip']);
  console.log('CF-IPCountry:', req.headers['cf-ipcountry']);
  console.log('CF-Ray:', req.headers['cf-ray']);
  
  res.json({
    message: 'IP tracking test',
    detectedIP: req.ip,
    detectedIPType: detectIPType(req.ip),
    allIPSources: ipSources,
    userAgent: req.headers['user-agent'],
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV,
    trustProxy: app.get('trust proxy'),
    allHeaders: req.headers,
    cloudflareHeaders: {
      'cf-connecting-ip': req.headers['cf-connecting-ip'],
      'cf-ipcountry': req.headers['cf-ipcountry'],
      'cf-ray': req.headers['cf-ray']
    }
  });
});
// Error handling middleware
app.use(errorLogger);

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
  //   });
  // seeder();
  app.use(routes);
  httpServer.listen(process.env.PORT, () => {
    console.log(`gmaxepay is running on port ${process.env.PORT} successfully.`);
  });
} else {
  module.exports = app;
}
