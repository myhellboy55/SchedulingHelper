// models/User.js — User authentication record
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    unique: true,   // name is now the login identifier
    trim: true,
  },
  email: {
    type: String,
    required: false,  // optional contact info
    unique: true,
    sparse: true,     // sparse allows multiple docs with no email (null != null in MongoDB)
    lowercase: true,
    trim: true,
    default: null,
  },
  passwordHash: {
    type: String,
    required: true,
  },
  role: {
    type: String,
    enum: ['admin', 'manager', 'employee'],
    default: 'employee',
  },
}, { timestamps: true });

userSchema.methods.verifyPassword = function (plain) {
  return bcrypt.compare(plain, this.passwordHash);
};

userSchema.statics.hashPassword = function (plain) {
  return bcrypt.hash(plain, 12);
};

export default mongoose.model('User', userSchema);
