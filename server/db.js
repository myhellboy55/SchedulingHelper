// db.js — MongoDB connection via Mongoose
import mongoose from 'mongoose';

/**
 * Connect to MongoDB using the URI from environment variables.
 * Exits the process if connection fails on startup.
 */
export async function connectDB() {
  const uri = process.env.MONGODB_URI || 'mongodb://mongo:27017/scheduler';
  try {
    await mongoose.connect(uri);
    console.log(`✅ MongoDB connected: ${uri}`);
  } catch (err) {
    console.error('❌ MongoDB connection error:', err.message);
    process.exit(1);
  }
}

// Propagate connection errors after initial connect
mongoose.connection.on('error', (err) => {
  console.error('MongoDB error:', err.message);
});