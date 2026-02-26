const Redis = require('ioredis');

let redisClient;

if (process.env.REDIS_CLUSTER === 'true') {
    redisClient = new Redis.Cluster(
        [
            {
                host: process.env.REDIS_HOST,
                port: parseInt(process.env.REDIS_PORT) || 6379
            }
        ],
        {
            dnsLookup: (address, callback) => callback(null, address),
            redisOptions: {
                tls: process.env.REDIS_TLS === 'true' ? {} : undefined,
                username: process.env.REDIS_USERNAME,
                password: process.env.REDIS_PASSWORD || undefined
            },
            clusterRetryStrategy(times) {
                if (times > 5) {
                    console.error('Redis Cluster: max retries reached, giving up');
                    return null;
                }
                return Math.min(times * 200, 2000);
            }
        }
    );
} else {
    redisClient = new Redis({
        host: process.env.REDIS_HOST || '127.0.0.1',
        port: parseInt(process.env.REDIS_PORT) || 6379,
        password: process.env.REDIS_PASSWORD || undefined,
        tls: process.env.REDIS_TLS === 'true' ? {} : undefined,
        retryStrategy(times) {
            if (times > 5) {
                console.error('Redis: max retries reached, giving up');
                return null;
            }
            return Math.min(times * 200, 2000);
        }
    });
}

redisClient.on('connect', () => {
    console.log(`Redis ${process.env.REDIS_CLUSTER === 'true' ? 'Cluster' : 'standalone'} connected successfully`);
});

redisClient.on('error', (err) => {
    console.error(`Redis connection error:`, err.message);
});

redisClient.on('close', () => {
    console.warn('Redis connection closed');
});

module.exports = redisClient;
