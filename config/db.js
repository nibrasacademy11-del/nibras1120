const mongoose = require('mongoose');

// ONLY set custom DNS servers when running locally on Windows/Node where ISP blocks SRV records.
// DO NOT set on Vercel or production: AWS Lambda blocks outbound UDP port 53 to external DNS, causing all queries to hang and time out.
if (!process.env.VERCEL && process.env.NODE_ENV !== 'production') {
    try {
        const dns = require('dns');
        dns.setServers(['8.8.8.8', '1.1.1.1']);
    } catch (e) {
        // Keep default if restricted
    }
}

// Serverless Connection Cache
let cachedPromise = null;

const connectDB = async () => {
    // 1. Return immediately if already connected
    if (mongoose.connection.readyState === 1) {
        return mongoose.connection;
    }

    // 2. Reuse active connection promise
    if (cachedPromise) {
        return cachedPromise;
    }

    const primaryUri = process.env.MONGO_URI;
    // Optional direct replica set URI: avoids SRV lookup issues on restricted networks and serverless
    const fallbackUri = process.env.MONGO_URI_FALLBACK;
    if (!primaryUri) {
        throw new Error('MONGO_URI environment variable is not set.');
    }

    const connectOptions = {
        serverSelectionTimeoutMS: 5000,
        connectTimeoutMS: 10000,
    };

    cachedPromise = (async () => {
        try {
            await mongoose.connect(primaryUri, connectOptions);
            console.log('MongoDB Connected...');
            return mongoose.connection;
        } catch (err) {
            console.warn('Primary MongoDB connection failed:', err.message);
            if (fallbackUri && fallbackUri !== primaryUri) {
                console.log('Retrying with fallback URI...');
                try {
                    await mongoose.connect(fallbackUri, connectOptions);
                    console.log('MongoDB Connected via fallback URI...');
                    return mongoose.connection;
                } catch (fallbackErr) {
                    console.error('Fallback connection error:', fallbackErr.message);
                    cachedPromise = null;
                    throw fallbackErr;
                }
            }
            cachedPromise = null;
            throw err;
        }
    })();

    return cachedPromise;
};

module.exports = connectDB;
