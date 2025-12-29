# Multi-stage build for optimized image size
FROM node:18-alpine AS builder

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production && npm cache clean --force

# Production stage with Nginx
FROM node:18-alpine

# Install dumb-init, nginx, and wget for proper signal handling, reverse proxy, and health checks
RUN apk add --no-cache dumb-init nginx wget

# Create app user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Set working directory
WORKDIR /app

# Copy dependencies from builder
COPY --from=builder --chown=nodejs:nodejs /app/node_modules ./node_modules

# Copy application code
COPY --chown=nodejs:nodejs . .

# Copy nginx configuration
COPY --chown=root:root nginx.conf /etc/nginx/http.d/default.conf

# Create logs directory
RUN mkdir -p logs && chown -R nodejs:nodejs logs

# Create nginx directories
RUN mkdir -p /var/log/nginx /var/lib/nginx /run/nginx && \
    chown -R nginx:nginx /var/log/nginx /var/lib/nginx /run/nginx

# Switch to non-root user for Node.js
USER nodejs

# Expose port 80 for Nginx
EXPOSE 80

# Health check on port 80 (Nginx)
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost/health || exit 1

# Use dumb-init to handle signals properly
ENTRYPOINT ["dumb-init", "--"]

# Start script that runs both Node.js and Nginx
COPY --chown=root:root docker-entrypoint.sh /usr/local/bin/
USER root
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

# Start both services
CMD ["sh", "/usr/local/bin/docker-entrypoint.sh"]

