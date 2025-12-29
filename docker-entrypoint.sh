#!/bin/sh
set -e

# Start Node.js app in background
echo "🚀 Starting Node.js application..."
cd /app
su-exec nodejs node index.js &
NODE_PID=$!

# Wait for Node.js to be ready (simple wait)
echo "⏳ Waiting for Node.js to start on port 8005..."
sleep 10

# Start Nginx in foreground
echo "🌐 Starting Nginx reverse proxy on port 80..."
exec nginx -g "daemon off;"

