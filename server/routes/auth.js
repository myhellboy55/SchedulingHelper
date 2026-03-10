// routes/auth.js — register and login by name
import { Router } from 'express';
import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import Employee from '../models/Employee.js';

const router = Router();
const SECRET  = process.env.JWT_SECRET || 'dev_secret';
const EXPIRES = process.env.JWT_EXPIRES_IN || '7d';

/**
 * POST /api/auth/register
 * Creates a new user. Name is the login identifier; email is optional.
 */
router.post('/register', async (req, res) => {
  try {
    const { name, email, password, role = 'employee', maxHours = 40, position = '' } = req.body;
    if (!name || !password) {
      return res.status(400).json({ error: 'name and password are required' });
    }

    const existing = await User.findOne({ name: name.trim() });
    if (existing) return res.status(409).json({ error: 'That name is already taken' });

    // If email provided, check it isn't already used
    if (email && email.trim().length > 0) {
      const emailTaken = await User.findOne({ email: email.trim().toLowerCase() });
      if (emailTaken) return res.status(409).json({ error: 'Email already registered' });
    }

    const passwordHash = await User.hashPassword(password);
    const user = await User.create({
      name:  name.trim(),
      email: (email && email.trim().length > 0) ? email.trim().toLowerCase() : null,
      passwordHash,
      role,
    });

    // Create Employee profile for all roles so everyone can appear on the schedule
    const existingEmp = await Employee.findOne({ userId: user._id });
    if (!existingEmp) {
      await Employee.create({ userId: user._id, name: user.name, maxHours, position });
    }

    const token = jwt.sign({ id: user._id, role: user.role, name: user.name }, SECRET, { expiresIn: EXPIRES });
    res.status(201).json({ token, user: { id: user._id, name: user.name, email: user.email, role: user.role } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/auth/login
 * Authenticates by name + password.
 */
router.post('/login', async (req, res) => {
  try {
    const { name, password } = req.body;
    if (!name || !password) return res.status(400).json({ error: 'name and password are required' });

    const user = await User.findOne({ name: name.trim() });
    if (!user) return res.status(401).json({ error: 'Invalid name or password' });

    const valid = await user.verifyPassword(password);
    if (!valid) return res.status(401).json({ error: 'Invalid name or password' });

    const token = jwt.sign({ id: user._id, role: user.role, name: user.name }, SECRET, { expiresIn: EXPIRES });
    res.json({ token, user: { id: user._id, name: user.name, email: user.email, role: user.role } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
