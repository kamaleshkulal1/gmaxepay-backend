const express = require('express');
const router = express.Router();
const logController = require('../controller/logController');

// Get all logs with filtering
router.get('/logs', logController.getLogs);

// Get unique IP addresses
router.get('/logs/ips', logController.getUniqueIPs);

// Get logs by specific IP
router.get('/logs/ip/:ip', logController.getLogsByIP);

// Get API logs only
router.get('/logs/api', logController.getAPILogs);

// Get error logs only
router.get('/logs/errors', logController.getErrorLogs);

// Get success logs only
router.get('/logs/success', logController.getSuccessLogs);

// Get logs by date range
router.get('/logs/date/:startDate/:endDate', logController.getLogsByDateRange);

// Get logs by API path
router.get('/logs/path/:apiPath', logController.getLogsByAPIPath);

// Get log statistics
router.get('/logs/statistics', logController.getLogStatistics);

// Delete old logs
router.delete('/logs/cleanup', logController.deleteOldLogs);

// Get tail logs (recent logs)
router.get('/logs/tail', logController.getTailLogs);

// Search logs by text
router.get('/logs/search', logController.searchLogs);

// Get log file info
router.get('/logs/info', logController.getLogFileInfo);

module.exports = router;
