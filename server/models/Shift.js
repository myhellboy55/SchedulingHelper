// models/Shift.js — A single shift within a weekly schedule
import mongoose from 'mongoose';

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

const shiftSchema = new mongoose.Schema({
  scheduleId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Schedule',
    required: true,
  },
  employeeId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Employee',
    required: true,
  },
  day: {
    type: String,
    enum: DAYS,
    required: true,
  },
  // Start and end as hour numbers (0–23) for easy arithmetic
  start: {
    type: Number,
    required: true,
    min: 0,
    max: 23,
  },
  end: {
    type: Number,
    required: true,
    min: 1,
    max: 24, // 24 means midnight of next day
  },
}, { timestamps: true });

/**
 * Virtual: shift duration in hours.
 */
shiftSchema.virtual('hours').get(function () {
  return this.end - this.start;
});

export default mongoose.model('Shift', shiftSchema);
