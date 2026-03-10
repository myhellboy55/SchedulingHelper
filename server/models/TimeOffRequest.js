// models/TimeOffRequest.js — Employee time-off request
import mongoose from 'mongoose';

const timeOffSchema = new mongoose.Schema({
  employeeId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Employee',
    required: true,
  },
  // ISO date strings e.g. "2024-06-10"
  startDate: { type: String, required: true },
  endDate:   { type: String, required: true },
  reason:    { type: String, trim: true, default: '' },
  // pending → approved or denied by a manager
  status: {
    type: String,
    enum: ['pending', 'approved', 'denied'],
    default: 'pending',
  },
  reviewedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null,
  },
  reviewNote: { type: String, default: '' },
}, { timestamps: true });

/**
 * Returns all ISO date strings covered by this request.
 * Used to check whether a given schedule day is blocked.
 */
timeOffSchema.methods.coveredDates = function () {
  const dates = [];
  const cur = new Date(this.startDate + 'T00:00:00');
  const end = new Date(this.endDate   + 'T00:00:00');
  while (cur <= end) {
    dates.push(cur.toISOString().split('T')[0]);
    cur.setDate(cur.getDate() + 1);
  }
  return dates;
};

export default mongoose.model('TimeOffRequest', timeOffSchema);
