const mongoose = require('mongoose');
const config = require('./config');

/**
 * Connect to MongoDB with retry logic and event handlers.
 * Implements connection pooling and graceful error handling.
 */
const connectDB = async () => {
  try {
    const conn = await mongoose.connect(config.mongodbUri, {
      // Mongoose 8+ uses these defaults, but explicit for clarity
      autoIndex: config.nodeEnv === 'development',
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    });

    console.log(`✅ MongoDB Connected: ${conn.connection.host}`);

    // Event handlers for connection issues
    mongoose.connection.on('error', (err) => {
      console.error('❌ MongoDB connection error:', err.message);
    });

    mongoose.connection.on('disconnected', () => {
      console.warn('⚠️ MongoDB disconnected. Attempting to reconnect...');
    });

    mongoose.connection.on('reconnected', () => {
      console.log('✅ MongoDB reconnected');
    });

    return conn;
  } catch (error) {
    console.error('❌ Failed to connect to MongoDB:', error.message);
    // Exit process with failure if we cannot connect in production
    if (config.nodeEnv === 'production') {
      process.exit(1);
    }
    throw error;
  }
};

module.exports = connectDB;
