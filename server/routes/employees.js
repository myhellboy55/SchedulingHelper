// routes/employees.js — CRUD for employee profiles
import { Router } from 'express';
import Employee from '../models/Employee.js';
import User from '../models/User.js';
import { requireAuth, requireRole } from '../middleware/auth.js';

const router = Router();

/**
 * GET /api/employees
 * Managers/admins get all employees; employees get only themselves.
 */
router.get('/', requireAuth, async (req, res) => {
  try {
    if (req.user.role === 'employee') {
      const emp = await Employee.findOne({ userId: req.user.id }).populate('userId', 'email role');
      return res.json(emp ? [emp] : []);
    }
    const employees = await Employee.find().populate('userId', 'email role name');
    res.json(employees);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/employees/:id
 */
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const emp = await Employee.findById(req.params.id).populate('userId', 'email role name');
    if (!emp) return res.status(404).json({ error: 'Employee not found' });

    // Employees can only view themselves
    if (req.user.role === 'employee' && emp.userId._id.toString() !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }
    res.json(emp);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/employees
 * Managers/admins create an employee record for an existing user.
 */
router.post('/', requireAuth, requireRole('admin', 'manager'), async (req, res) => {
  try {
    const { userId, name, maxHours = 40, position = '' } = req.body;
    if (!userId || !name) return res.status(400).json({ error: 'userId and name required' });

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const emp = await Employee.create({ userId, name, maxHours, position });
    res.status(201).json(emp);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * PUT /api/employees/:id — update maxHours or position
 */
router.put('/:id', requireAuth, requireRole('admin', 'manager'), async (req, res) => {
  try {
    const { maxHours, position, name } = req.body;
    const emp = await Employee.findByIdAndUpdate(
      req.params.id,
      { ...(maxHours !== undefined && { maxHours }), ...(position !== undefined && { position }), ...(name && { name }) },
      { new: true }
    );
    if (!emp) return res.status(404).json({ error: 'Employee not found' });
    res.json(emp);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * DELETE /api/employees/:id
 */
router.delete('/:id', requireAuth, requireRole('admin', 'manager'), async (req, res) => {
  try {
    const emp = await Employee.findByIdAndDelete(req.params.id);
    if (!emp) return res.status(404).json({ error: 'Employee not found' });
    res.json({ message: 'Employee deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
