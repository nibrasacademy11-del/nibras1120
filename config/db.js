const mongoose = require('mongoose');

// Fallback direct replica set URI:
// Avoids SRV lookup issues on restricted networks and cloud serverless (AWS Lambda / Vercel)
const FALLBACK_DIRECT_URI = 'mongodb://admin:MCFFg12%405@ac-7z7fw4e-shard-00-00.nvpvivt.mongodb.net:27017,ac-7z7fw4e-shard-00-01.nvpvivt.mongodb.net:27017,ac-7z7fw4e-shard-00-02.nvpvivt.mongodb.net:27017/nibras?ssl=true&replicaSet=atlas-pedhjq-shard-0&authSource=admin&retryWrites=true&w=majority';

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

    const primaryUri = process.env.MONGO_URI || FALLBACK_DIRECT_URI;
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
            // If primary was an SRV URI and failed (e.g. DNS resolution), try direct fallback
            if (primaryUri !== FALLBACK_DIRECT_URI) {
                console.log('Retrying with direct replica set fallback URI...');
                try {
                    await mongoose.connect(FALLBACK_DIRECT_URI, connectOptions);
                    console.log('MongoDB Connected via direct replica set URI...');
                    return mongoose.connection;
                } catch (fallbackErr) {
                    console.error('Direct fallback connection error:', fallbackErr.message);
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
