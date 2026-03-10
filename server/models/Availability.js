// models/Availability.js — Employee's weekly availability preferences
import mongoose from 'mongoose';

// Each day holds an array of time-range strings like "8-16" or "12-20"
const daySchema = {
  type: [String],
  default: [],
};

const availabilitySchema = new mongoose.Schema({
  employeeId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Employee',
    required: true,
    unique: true,
  },
  days: {
    Monday:    daySchema,
    Tuesday:   daySchema,
    Wednesday: daySchema,
    Thursday:  daySchema,
    Friday:    daySchema,
    Saturday:  daySchema,
    Sunday:    daySchema,
  },
}, { timestamps: true });

/**
 * Helper: parse "8-16" into { start: 8, end: 16 }
 */
availabilitySchema.statics.parseRange = function (rangeStr) {
  const [start, end] = rangeStr.split('-').map(Number);
  return { start, end };
};

/**
 * Check if a shift (start, end) fits within any declared availability range for a day.
 */
availabilitySchema.methods.isAvailable = function (day, shiftStart, shiftEnd) {
  const ranges = this.days[day] || [];
  if (ranges.length === 0) return false; // No availability declared = not available
  return ranges.some((r) => {
    const { start, end } = this.constructor.parseRange(r);
    return shiftStart >= start && shiftEnd <= end;
  });
};

export default mongoose.model('Availability', availabilitySchema);
