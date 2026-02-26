const Redis = require('ioredis');

const redisClient = new Redis({
    host: process.env.REDIS_HOST || '127.0.0.1',
    port: parseInt(process.env.REDIS_PORT) || 6379,
    password: process.env.REDIS_PASSWORD || undefined,
    tls: process.env.REDIS_TLS === 'true' ? {} : undefined,
    lazyConnect: true, // don't crash app if Redis is unavailable at startup
    retryStrategy(times) {
        if (times > 5) {
            console.error('❌ Redis: max retries reached, giving up');
            return null; // stop retrying
        }
        const delay = Math.min(times * 200, 2000);
        return delay;
    }
});

redisClient.on('connect', () => {
    console.log('✅ Redis connected successfully');
});

redisClient.on('error', (err) => {
    console.error('❌ Redis connection error:', err.message);
});

redisClient.on('close', () => {
    console.warn('⚠️  Redis connection closed');
});

module.exports = redisClient;
