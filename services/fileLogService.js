const fs = require('fs');
const path = require('path');
const logger = require('../config/fileLogger');

// Function to redact sensitive data from any object
function redactSensitiveData(data) {
  if (typeof data === 'string') {
    // Redact JWT tokens (base64 encoded strings with dots) - improved regex
    return data.replace(/"token"\s*:\s*"[A-Za-z0-9+/=]+\.[A-Za-z0-9+/=]+\.[A-Za-z0-9+/=]+"/g, '"token":"[REDACTED]"')
               .replace(/"authorization"\s*:\s*"[A-Za-z0-9+/=]+\.[A-Za-z0-9+/=]+\.[A-Za-z0-9+/=]+"/g, '"authorization":"[REDACTED]"')
               .replace(/"accessToken"\s*:\s*"[A-Za-z0-9+/=]+\.[A-Za-z0-9+/=]+\.[A-Za-z0-9+/=]+"/g, '"accessToken":"[REDACTED]"')
               .replace(/"refreshToken"\s*:\s*"[A-Za-z0-9+/=]+\.[A-Za-z0-9+/=]+\.[A-Za-z0-9+/=]+"/g, '"refreshToken":"[REDACTED]"');
  }
  
  if (typeof data === 'object' && data !== null) {
    const redacted = { ...data };
    
    // Redact common sensitive fields
    if (redacted.password) redacted.password = '[REDACTED]';
    if (redacted.token) redacted.token = '[REDACTED]';
    if (redacted.authorization) redacted.authorization = '[REDACTED]';
    if (redacted.accessToken) redacted.accessToken = '[REDACTED]';
    if (redacted.refreshToken) redacted.refreshToken = '[REDACTED]';
    if (redacted.mobileOtp) redacted.mobileOtp = '[REDACTED]';
    if (redacted.otp) redacted.otp = '[REDACTED]';
    if (redacted.secret) redacted.secret = '[REDACTED]';
    if (redacted.key) redacted.key = '[REDACTED]';
    
    // Recursively redact nested objects
    Object.keys(redacted).forEach(key => {
      if (typeof redacted[key] === 'object' && redacted[key] !== null) {
        redacted[key] = redactSensitiveData(redacted[key]);
      }
    });
    
    return redacted;
  }
  
  return data;
}

class FileLogService {
  constructor() {
    this.logFilePath = path.join(__dirname, '../logs/server.log');
    this.errorLogFilePath = path.join(__dirname, '../logs/error.log');
  }

  // Read and parse log file (handles terminal format)
  async readLogFile(filePath) {
    try {
      if (!fs.existsSync(filePath)) {
        return [];
      }

      const data = fs.readFileSync(filePath, 'utf8');
      
      if (!data.trim()) {
        return [];
      }

      // Parse terminal format logs
      const lines = data.trim().split('\n').filter(line => line.trim());
      const logs = [];
      
      for (const line of lines) {
        try {
          // Parse terminal format: "level: message {json_data}"
          const match = line.match(/^(\w+):\s+(.+?)\s+(\{.*\})$/);
          if (match) {
            const [, level, message, jsonData] = match;
            const logData = JSON.parse(jsonData);
            
            // Convert to the expected format
            const logEntry = {
              date: logData.timestamp ? logData.timestamp.split(' ')[0] : new Date().toISOString().split('T')[0],
              time: logData.timestamp ? logData.timestamp.split(' ')[1] : new Date().toTimeString().split(' ')[0],
              ip: logData.ip || 'unknown',
              method: logData.method || 'N/A',
              url: logData.url || 'N/A',
              apiPath: logData.apiPath || 'N/A',
              statusCode: logData.statusCode || 'N/A',
              responseTime: logData.responseTime || 'N/A',
              requestBody: logData.requestBody || '',
              responseBody: logData.responseBody || '',
              queryParams: logData.queryParams || '',
              headers: logData.headers || '',
              responseHeaders: logData.responseHeaders || '',
              userAgent: logData.userAgent || '',
              referrer: logData.referrer || '',
              level: level,
              message: message,
              timestamp: logData.timestamp || new Date().toISOString(),
              logType: logData.type || 'general'
            };
            
            logs.push(redactSensitiveData(logEntry));
          } else {
            // Handle simple log lines without JSON data
            const simpleMatch = line.match(/^(\w+):\s+(.+)$/);
            if (simpleMatch) {
              const [, level, message] = simpleMatch;
              const logEntry = {
                date: new Date().toISOString().split('T')[0],
                time: new Date().toTimeString().split(' ')[0],
                ip: 'unknown',
                method: 'N/A',
                url: 'N/A',
                apiPath: 'N/A',
                statusCode: 'N/A',
                responseTime: 'N/A',
                requestBody: '',
                responseBody: '',
                queryParams: '',
                headers: '',
                responseHeaders: '',
                userAgent: '',
                referrer: '',
                level: level,
                message: message,
                timestamp: new Date().toISOString(),
                logType: 'general'
              };
              logs.push(redactSensitiveData(logEntry));
            }
          }
        } catch (lineParseError) {
          console.warn('Skipping malformed log line:', line.substring(0, 100));
        }
      }
      
      return logs;
    } catch (error) {
      logger.error('Error reading log file', { error: error.message });
      throw error;
    }
  }

  // Get all logs with filtering options
  async getLogs(filters = {}) {
    try {
      const logs = await this.readLogFile(this.logFilePath);
      
      // Apply filters
      const filteredLogs = logs.filter(log => this.matchesFilters(log, filters));
      
      // Sort by timestamp (newest first)
      return filteredLogs.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    } catch (error) {
      logger.error('Error retrieving logs', { error: error.message });
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

      const logs = await this.readLogFile(this.logFilePath);
      const filteredLogs = logs.filter(log => {
        const logDate = new Date(log.timestamp);
        return logDate >= cutoffDate;
      });

      // Convert back to terminal format and write to file
      const terminalFormatLogs = filteredLogs.map(log => {
        const logData = {
          apiPath: log.apiPath,
          headers: log.headers,
          ip: log.ip,
          method: log.method,
          queryParams: log.queryParams,
          referrer: log.referrer,
          requestBody: log.requestBody,
          responseBody: log.responseBody,
          responseTime: log.responseTime,
          statusCode: log.statusCode,
          timestamp: log.timestamp,
          type: log.logType,
          url: log.url,
          userAgent: log.userAgent
        };
        return `${log.level}: ${log.message} ${JSON.stringify(logData)}`;
      });

      fs.writeFileSync(this.logFilePath, terminalFormatLogs.join('\n') + '\n');

      const deletedCount = logs.length - filteredLogs.length;
      logger.info(`Deleted ${deletedCount} old log entries`);
      
      return deletedCount;
    } catch (error) {
      logger.error('Error deleting old logs', { error: error.message });
      throw error;
    }
  }

  // Get real-time logs (tail functionality)
  async getTailLogs(lines = 100) {
    try {
      const logs = await this.readLogFile(this.logFilePath);
      return logs.slice(-lines);
    } catch (error) {
      logger.error('Error getting tail logs', { error: error.message });
      throw error;
    }
  }

  // Search logs by text
  async searchLogs(searchTerm, filters = {}) {
    try {
      const logs = await this.getLogs(filters);
      const searchLower = searchTerm.toLowerCase();
      
      return logs.filter(log => {
        const message = log.message ? log.message.toLowerCase() : '';
        const url = log.url ? log.url.toLowerCase() : '';
        const ip = log.ip ? log.ip.toLowerCase() : '';
        
        return message.includes(searchLower) || 
               url.includes(searchLower) || 
               ip.includes(searchLower);
      });
    } catch (error) {
      logger.error('Error searching logs', { error: error.message });
      throw error;
    }
  }
}

module.exports = new FileLogService();
