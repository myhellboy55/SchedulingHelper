// models/Schedule.js — A weekly schedule document
import mongoose from 'mongoose';

const scheduleSchema = new mongoose.Schema({
  // ISO date string for the Monday that starts the week, e.g. "2024-06-03"
  weekStart: {
    type: String,
    required: true,
    unique: true,
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  // Version field for optimistic concurrency — prevents lost manager edits
  version: {
    type: Number,
    default: 0,
  },
}, { timestamps: true });

export default mongoose.model('Schedule', scheduleSchema);
