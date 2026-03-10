// models/Employee.js — Employee profile linked to a User account
import mongoose from 'mongoose';

const employeeSchema = new mongoose.Schema({
  // Reference to the User document for auth
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true,
  },
  name: {
    type: String,
    required: true,
    trim: true,
  },
  // Maximum hours per week — used for overtime detection
  maxHours: {
    type: Number,
    default: 40,
    min: 1,
  },
  position: {
    type: String,
    trim: true,
    default: '',
  },
}, { timestamps: true });

export default mongoose.model('Employee', employeeSchema);
