const AWS = require('aws-sdk');
const logger = require('../config/s3Logger');

// Configure AWS SDK
AWS.config.update({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  region: process.env.AWS_REGION || 'us-east-1'
});

const s3 = new AWS.S3();

class LogService {
  constructor() {
    this.bucket = 'gmaxepay';
    this.folder = 'development';
  }

  // Get all logs with filtering options
  async getLogs(filters = {}) {
    try {
      const params = {
        Bucket: this.bucket,
        Prefix: `${this.folder}/logs/`,
        MaxKeys: 1000
      };

      const data = await s3.listObjectsV2(params).promise();
      const logs = [];

      // Process each log file
      for (const object of data.Contents) {
        try {
          const logData = await s3.getObject({
            Bucket: this.bucket,
            Key: object.Key
          }).promise();

          const logEntry = JSON.parse(logData.Body.toString());
          
          // Apply filters
          if (this.matchesFilters(logEntry, filters)) {
            logs.push({
              ...logEntry,
              s3Key: object.Key,
              lastModified: object.LastModified
            });
          }
        } catch (error) {
          console.error(`Error reading log file ${object.Key}:`, error);
        }
      }

      // Sort by timestamp (newest first)
      return logs.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    } catch (error) {
      logger.error('Error retrieving logs from S3', { error: error.message });
      throw error;
    }
  }

  // Filter logs based on criteria
  matchesFilters(logEntry, filters) {
    // Filter by status (success/error)
    if (filters.status) {
      if (filters.status === 'success' && logEntry.level === 'error') return false;
      if (filters.status === 'error' && logEntry.level !== 'error') return false;
    }

    // Filter by live status (for API requests)
    if (filters.live !== undefined) {
      const isLive = logEntry.type === 'api_request' || logEntry.type === 'api_response';
      if (filters.live && !isLive) return false;
      if (!filters.live && isLive) return false;
    }

    // Filter by IP address
    if (filters.ip) {
      if (logEntry.ip !== filters.ip) return false;
    }

    // Filter by API path
    if (filters.apiPath) {
      if (!logEntry.url || !logEntry.url.includes(filters.apiPath)) return false;
    }

    // Filter by date range
    if (filters.startDate || filters.endDate) {
      const logDate = new Date(logEntry.timestamp);
      
      if (filters.startDate) {
        const startDate = new Date(filters.startDate);
        if (logDate < startDate) return false;
      }
      
      if (filters.endDate) {
        const endDate = new Date(filters.endDate);
        if (logDate > endDate) return false;
      }
    }

    // Filter by log type
    if (filters.type) {
      if (logEntry.type !== filters.type) return false;
    }

    return true;
  }

  // Get unique IP addresses from logs
  async getUniqueIPs(filters = {}) {
    try {
      const logs = await this.getLogs(filters);
      const ipSet = new Set();
      
      logs.forEach(log => {
        if (log.ip && log.ip !== 'unknown') {
          ipSet.add(log.ip);
        }
      });

      return Array.from(ipSet).sort();
    } catch (error) {
      logger.error('Error getting unique IPs', { error: error.message });
      throw error;
    }
  }

  // Get logs by specific IP
  async getLogsByIP(ip, filters = {}) {
    return this.getLogs({ ...filters, ip });
  }

  // Get API logs only
  async getAPILogs(filters = {}) {
    return this.getLogs({ ...filters, live: true });
  }

  // Get error logs only
  async getErrorLogs(filters = {}) {
    return this.getLogs({ ...filters, status: 'error' });
  }

  // Get success logs only
  async getSuccessLogs(filters = {}) {
    return this.getLogs({ ...filters, status: 'success' });
  }

  // Get logs by date range
  async getLogsByDateRange(startDate, endDate, filters = {}) {
    return this.getLogs({ ...filters, startDate, endDate });
  }

  // Get logs by API path
  async getLogsByAPIPath(apiPath, filters = {}) {
    return this.getLogs({ ...filters, apiPath });
  }

  // Get log statistics
  async getLogStatistics(filters = {}) {
    try {
      const logs = await this.getLogs(filters);
      
      const stats = {
        total: logs.length,
        byType: {},
        byLevel: {},
        byIP: {},
        byStatusCode: {},
        dateRange: {
          earliest: null,
          latest: null
        }
      };

      logs.forEach(log => {
        // Count by type
        stats.byType[log.type] = (stats.byType[log.type] || 0) + 1;
        
        // Count by level
        stats.byLevel[log.level] = (stats.byLevel[log.level] || 0) + 1;
        
        // Count by IP
        if (log.ip) {
          stats.byIP[log.ip] = (stats.byIP[log.ip] || 0) + 1;
        }
        
        // Count by status code (for API requests)
        if (log.statusCode) {
          stats.byStatusCode[log.statusCode] = (stats.byStatusCode[log.statusCode] || 0) + 1;
        }
        
        // Track date range
        const logDate = new Date(log.timestamp);
        if (!stats.dateRange.earliest || logDate < stats.dateRange.earliest) {
          stats.dateRange.earliest = logDate;
        }
        if (!stats.dateRange.latest || logDate > stats.dateRange.latest) {
          stats.dateRange.latest = logDate;
        }
      });

      return stats;
    } catch (error) {
      logger.error('Error getting log statistics', { error: error.message });
      throw error;
    }
  }

  // Delete old logs (older than specified days)
  async deleteOldLogs(daysOld = 30) {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysOld);

      const params = {
        Bucket: this.bucket,
        Prefix: `${this.folder}/logs/`
      };

      const data = await s3.listObjectsV2(params).promise();
      const objectsToDelete = [];

      for (const object of data.Contents) {
        if (object.LastModified < cutoffDate) {
          objectsToDelete.push({ Key: object.Key });
        }
      }

      if (objectsToDelete.length > 0) {
        await s3.deleteObjects({
          Bucket: this.bucket,
          Delete: { Objects: objectsToDelete }
        }).promise();

        logger.info(`Deleted ${objectsToDelete.length} old log files`);
        return objectsToDelete.length;
      }

      return 0;
    } catch (error) {
      logger.error('Error deleting old logs', { error: error.message });
      throw error;
    }
  }
}

module.exports = new LogService();
