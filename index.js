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
const { generalLimit } = require('./middleware/ratelimiter');
const redisClient = require('./config/redisClient');

const app = express();
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
    crossOriginEmbedderPolicy: false,
    hsts: {
      maxAge: 31536000,
      includeSubDomains: true,
      preload: true
    },
    xFrameOptions: { action: 'deny' },
    xContentTypeOptions: true,
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    permittedCrossDomainPolicies: false
  })
);
app.use(cookieParser());

app.set('trust proxy', true);

const corsOptions = {
  origin: function (origin, callback) {
    callback(null, true);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-company-domain', 'x-request-id', 'token', 'x-company-id'],
  exposedHeaders: ['x-request-id'],
  maxAge: 86400,
  optionsSuccessStatus: 200
};

app.use(cors(corsOptions));
app.use(requestId);
app.use(require('./utils/response/responseHandler'));
app.use(validateContentType);
const httpServer = require('http').createServer(app);
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(morganMiddleware);
app.use(express.json({ limit: '10mb' }));
app.use(sanitizeInput);
app.use(preventNoSqlInjection);

app.use(requestLogger);
app.use(responseInterceptor);
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static('uploads'));

app.use(generalLimit);
app.get('/favicon.ico', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'favicon.ico'));
});
// app.use(require('./middleware/hostCheck'));

app.get('/', (req, res) => {
  res.send(`gmaxepay is running successfully`);
});

app.get('/health', (req, res) => {
  try {
    const healthStatus = {
      status: 'ok',
      message: 'gmaxepay is running beautifully!',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: process.env.NODE_ENV || 'development'
    };
    res.status(200).json(healthStatus);
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: 'Health check failed',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

function detectIPType(ip) {
  if (!ip || ip === 'unknown') return 'unknown';

  const ipv4Regex = /^(\d{1,3}\.){3}\d{1,3}$/;
  const ipv6Regex = /^([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$/;
  const ipv6CompressedRegex = /^([0-9a-fA-F]{1,4}:)*::([0-9a-fA-F]{1,4}:)*[0-9a-fA-F]{1,4}$/;

  if (ipv4Regex.test(ip)) return 'IPv4';
  if (ipv6Regex.test(ip) || ipv6CompressedRegex.test(ip)) return 'IPv6';
  return 'unknown';
}
if (process.env.NODE_ENV === 'development' && process.env.ENABLE_DEBUG_ENDPOINTS === 'true') {
  app.get('/test-ip', (req, res) => {
    res.json({
      message: 'IP tracking test (development only)',
      detectedIP: req.ip,
      detectedIPType: detectIPType(req.ip),
      timestamp: new Date().toISOString()
    });
  });
}
app.use(errorLogger);

app.use(secureErrorHandler);
app.use((req, res, next) => {
  next();
});

function name() {
  console.log('Router is Working!');
}

async function connectRedis() {
  try {
    await redisClient.ping();
    console.log('Redis Cluster ping successful');
  } catch (err) {
    console.error('Redis Cluster ping failed:', err.message);
  }
}

if (process.env.NODE_ENV !== 'test') {
  models.sequelize
    .sync({ alter: true })
    .then(() => { })
    .finally(async () => {
      app.use(routes);
      seeder();
      name();
      aepsLogout();
      connectRedis();
    });

  // app.use(routes);
  httpServer.listen(process.env.PORT, () => {
    console.log(`gmaxepay is running on port ${process.env.PORT} successfully.`);
  });
} else {
  module.exports = app;
}
