const logService = require('../services/fileLogService');
const logger = require('../config/fileLogger');

class LogController {
  // Get all logs with filtering
  async getLogs(req, res) {
    try {
      const {
        status,
        live,
        ip,
        apiPath,
        startDate,
        endDate,
        type,
        limit = 100,
        offset = 0
      } = req.query;

      const filters = {
        status,
        live: live === 'true',
        ip,
        apiPath,
        startDate,
        endDate,
        type
      };

      // Remove undefined values
      Object.keys(filters).forEach(key => {
        if (filters[key] === undefined) {
          delete filters[key];
        }
      });

      const logs = await logService.getLogs(filters);
      
      // Apply pagination
      const paginatedLogs = logs.slice(offset, offset + parseInt(limit));

      res.json({
        success: true,
        data: {
          logs: paginatedLogs,
          total: logs.length,
          limit: parseInt(limit),
          offset: parseInt(offset),
          hasMore: logs.length > offset + parseInt(limit)
        }
      });
    } catch (error) {
      logger.error('Error getting logs', { error: error.message });
      res.status(500).json({
        success: false,
        message: 'Error retrieving logs',
        error: error.message
      });
    }
  }

  // Get unique IP addresses
  async getUniqueIPs(req, res) {
    try {
      const { status, live, apiPath, startDate, endDate } = req.query;
      
      const filters = {
        status,
        live: live === 'true',
        apiPath,
        startDate,
        endDate
      };

      // Remove undefined values
      Object.keys(filters).forEach(key => {
        if (filters[key] === undefined) {
          delete filters[key];
        }
      });

      const ips = await logService.getUniqueIPs(filters);

      res.json({
        success: true,
        data: {
          ips,
          count: ips.length
        }
      });
    } catch (error) {
      logger.error('Error getting unique IPs', { error: error.message });
      res.status(500).json({
        success: false,
        message: 'Error retrieving IP addresses',
        error: error.message
      });
    }
  }

  // Get logs by specific IP
  async getLogsByIP(req, res) {
    try {
      const { ip } = req.params;
      const {
        status,
        live,
        apiPath,
        startDate,
        endDate,
        limit = 100,
        offset = 0
      } = req.query;

      const filters = {
        status,
        live: live === 'true',
        apiPath,
        startDate,
        endDate
      };

      // Remove undefined values
      Object.keys(filters).forEach(key => {
        if (filters[key] === undefined) {
          delete filters[key];
        }
      });

      const logs = await logService.getLogsByIP(ip, filters);
      
      // Apply pagination
      const paginatedLogs = logs.slice(offset, offset + parseInt(limit));

      res.json({
        success: true,
        data: {
          ip,
          logs: paginatedLogs,
          total: logs.length,
          limit: parseInt(limit),
          offset: parseInt(offset),
          hasMore: logs.length > offset + parseInt(limit)
        }
      });
    } catch (error) {
      logger.error('Error getting logs by IP', { error: error.message });
      res.status(500).json({
        success: false,
        message: 'Error retrieving logs for IP',
        error: error.message
      });
    }
  }

  // Get API logs only
  async getAPILogs(req, res) {
    try {
      const {
        status,
        ip,
        apiPath,
        startDate,
        endDate,
        limit = 100,
        offset = 0
      } = req.query;

      const filters = {
        status,
        ip,
        apiPath,
        startDate,
        endDate
      };

      // Remove undefined values
      Object.keys(filters).forEach(key => {
        if (filters[key] === undefined) {
          delete filters[key];
        }
      });

      const logs = await logService.getAPILogs(filters);
      
      // Apply pagination
      const paginatedLogs = logs.slice(offset, offset + parseInt(limit));

      res.json({
        success: true,
        data: {
          logs: paginatedLogs,
          total: logs.length,
          limit: parseInt(limit),
          offset: parseInt(offset),
          hasMore: logs.length > offset + parseInt(limit)
        }
      });
    } catch (error) {
      logger.error('Error getting API logs', { error: error.message });
      res.status(500).json({
        success: false,
        message: 'Error retrieving API logs',
        error: error.message
      });
    }
  }

  // Get error logs only
  async getErrorLogs(req, res) {
    try {
      const {
        ip,
        apiPath,
        startDate,
        endDate,
        limit = 100,
        offset = 0
      } = req.query;

      const filters = {
        ip,
        apiPath,
        startDate,
        endDate
      };

      // Remove undefined values
      Object.keys(filters).forEach(key => {
        if (filters[key] === undefined) {
          delete filters[key];
        }
      });

      const logs = await logService.getErrorLogs(filters);
      
      // Apply pagination
      const paginatedLogs = logs.slice(offset, offset + parseInt(limit));

      res.json({
        success: true,
        data: {
          logs: paginatedLogs,
          total: logs.length,
          limit: parseInt(limit),
          offset: parseInt(offset),
          hasMore: logs.length > offset + parseInt(limit)
        }
      });
    } catch (error) {
      logger.error('Error getting error logs', { error: error.message });
      res.status(500).json({
        success: false,
        message: 'Error retrieving error logs',
        error: error.message
      });
    }
  }

  // Get success logs only
  async getSuccessLogs(req, res) {
    try {
      const {
        ip,
        apiPath,
        startDate,
        endDate,
        limit = 100,
        offset = 0
      } = req.query;

      const filters = {
        ip,
        apiPath,
        startDate,
        endDate
      };

      // Remove undefined values
      Object.keys(filters).forEach(key => {
        if (filters[key] === undefined) {
          delete filters[key];
        }
      });

      const logs = await logService.getSuccessLogs(filters);
      
      // Apply pagination
      const paginatedLogs = logs.slice(offset, offset + parseInt(limit));

      res.json({
        success: true,
        data: {
          logs: paginatedLogs,
          total: logs.length,
          limit: parseInt(limit),
          offset: parseInt(offset),
          hasMore: logs.length > offset + parseInt(limit)
        }
      });
    } catch (error) {
      logger.error('Error getting success logs', { error: error.message });
      res.status(500).json({
        success: false,
        message: 'Error retrieving success logs',
        error: error.message
      });
    }
  }

  // Get logs by date range
  async getLogsByDateRange(req, res) {
    try {
      const { startDate, endDate } = req.params;
      const {
        status,
        live,
        ip,
        apiPath,
        limit = 100,
        offset = 0
      } = req.query;

      const filters = {
        status,
        live: live === 'true',
        ip,
        apiPath
      };

      // Remove undefined values
      Object.keys(filters).forEach(key => {
        if (filters[key] === undefined) {
          delete filters[key];
        }
      });

      const logs = await logService.getLogsByDateRange(startDate, endDate, filters);
      
      // Apply pagination
      const paginatedLogs = logs.slice(offset, offset + parseInt(limit));

      res.json({
        success: true,
        data: {
          startDate,
          endDate,
          logs: paginatedLogs,
          total: logs.length,
          limit: parseInt(limit),
          offset: parseInt(offset),
          hasMore: logs.length > offset + parseInt(limit)
        }
      });
    } catch (error) {
      logger.error('Error getting logs by date range', { error: error.message });
      res.status(500).json({
        success: false,
        message: 'Error retrieving logs by date range',
        error: error.message
      });
    }
  }

  // Get logs by API path
  async getLogsByAPIPath(req, res) {
    try {
      const { apiPath } = req.params;
      const {
        status,
        live,
        ip,
        startDate,
        endDate,
        limit = 100,
        offset = 0
      } = req.query;

      const filters = {
        status,
        live: live === 'true',
        ip,
        startDate,
        endDate
      };

      // Remove undefined values
      Object.keys(filters).forEach(key => {
        if (filters[key] === undefined) {
          delete filters[key];
        }
      });

      const logs = await logService.getLogsByAPIPath(apiPath, filters);
      
      // Apply pagination
      const paginatedLogs = logs.slice(offset, offset + parseInt(limit));

      res.json({
        success: true,
        data: {
          apiPath,
          logs: paginatedLogs,
          total: logs.length,
          limit: parseInt(limit),
          offset: parseInt(offset),
          hasMore: logs.length > offset + parseInt(limit)
        }
      });
    } catch (error) {
      logger.error('Error getting logs by API path', { error: error.message });
      res.status(500).json({
        success: false,
        message: 'Error retrieving logs by API path',
        error: error.message
      });
    }
  }

  // Get log statistics
  async getLogStatistics(req, res) {
    try {
      const {
        status,
        live,
        ip,
        apiPath,
        startDate,
        endDate
      } = req.query;

      const filters = {
        status,
        live: live === 'true',
        ip,
        apiPath,
        startDate,
        endDate
      };

      // Remove undefined values
      Object.keys(filters).forEach(key => {
        if (filters[key] === undefined) {
          delete filters[key];
        }
      });

      const stats = await logService.getLogStatistics(filters);

      res.json({
        success: true,
        data: stats
      });
    } catch (error) {
      logger.error('Error getting log statistics', { error: error.message });
      res.status(500).json({
        success: false,
        message: 'Error retrieving log statistics',
        error: error.message
      });
    }
  }

  // Delete old logs
  async deleteOldLogs(req, res) {
    try {
      const { daysOld = 30 } = req.body;
      
      const deletedCount = await logService.deleteOldLogs(daysOld);

      res.json({
        success: true,
        message: `Successfully deleted ${deletedCount} old log entries`,
        data: {
          deletedCount,
          daysOld
        }
      });
    } catch (error) {
      logger.error('Error deleting old logs', { error: error.message });
      res.status(500).json({
        success: false,
        message: 'Error deleting old logs',
        error: error.message
      });
    }
  }

  // Get tail logs (recent logs)
  async getTailLogs(req, res) {
    try {
      const { lines = 100 } = req.query;
      
      const logs = await logService.getTailLogs(parseInt(lines));

      res.json({
        success: true,
        data: {
          logs,
          count: logs.length,
          lines: parseInt(lines)
        }
      });
    } catch (error) {
      logger.error('Error getting tail logs', { error: error.message });
      res.status(500).json({
        success: false,
        message: 'Error retrieving tail logs',
        error: error.message
      });
    }
  }

  // Search logs by text
  async searchLogs(req, res) {
    try {
      const { q: searchTerm, limit = 100, offset = 0 } = req.query;
      
      if (!searchTerm) {
        return res.status(400).json({
          success: false,
          message: 'Search term is required'
        });
      }

      const logs = await logService.searchLogs(searchTerm);
      
      // Apply pagination
      const paginatedLogs = logs.slice(offset, offset + parseInt(limit));

      res.json({
        success: true,
        data: {
          logs: paginatedLogs,
          total: logs.length,
          limit: parseInt(limit),
          offset: parseInt(offset),
          hasMore: logs.length > offset + parseInt(limit),
          searchTerm
        }
      });
    } catch (error) {
      logger.error('Error searching logs', { error: error.message });
      res.status(500).json({
        success: false,
        message: 'Error searching logs',
        error: error.message
      });
    }
  }

  // Get log file info
  async getLogFileInfo(req, res) {
    try {
      const fs = require('fs');
      const path = require('path');
      
      const logFilePath = path.join(__dirname, '../logs/server.log');
      const errorLogFilePath = path.join(__dirname, '../logs/error.log');
      
      const info = {
        serverLog: {
          exists: fs.existsSync(logFilePath),
          size: fs.existsSync(logFilePath) ? fs.statSync(logFilePath).size : 0,
          lastModified: fs.existsSync(logFilePath) ? fs.statSync(logFilePath).mtime : null
        },
        errorLog: {
          exists: fs.existsSync(errorLogFilePath),
          size: fs.existsSync(errorLogFilePath) ? fs.statSync(errorLogFilePath).size : 0,
          lastModified: fs.existsSync(errorLogFilePath) ? fs.statSync(errorLogFilePath).mtime : null
        }
      };

      res.json({
        success: true,
        data: info
      });
    } catch (error) {
      logger.error('Error getting log file info', { error: error.message });
      res.status(500).json({
        success: false,
        message: 'Error retrieving log file info',
        error: error.message
      });
    }
  }
}

module.exports = new LogController();
