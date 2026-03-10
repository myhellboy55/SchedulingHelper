// routes/schedules.js — weekly schedule creation and retrieval
import { Router } from 'express';
import Schedule from '../models/Schedule.js';
import Shift from '../models/Shift.js';
import { requireAuth, requireRole } from '../middleware/auth.js';

const router = Router();

/**
 * GET /api/schedules
 * List all schedule weeks (summary only).
 */
router.get('/', requireAuth, async (req, res) => {
  try {
    const schedules = await Schedule.find().sort({ weekStart: -1 }).populate('createdBy', 'name');
    res.json(schedules);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/schedules/:weekStart
 * Fetch a schedule + all its shifts for a given week (ISO date string for Monday).
 */
router.get('/:weekStart', requireAuth, async (req, res) => {
  try {
    const schedule = await Schedule.findOne({ weekStart: req.params.weekStart }).populate('createdBy', 'name');
    if (!schedule) return res.status(404).json({ error: 'Schedule not found' });

    // For employees, only return their own shifts
    const filter = { scheduleId: schedule._id };
    if (req.user.role === 'employee') {
      const Employee = (await import('../models/Employee.js')).default;
      const emp = await Employee.findOne({ userId: req.user.id });
      if (!emp) return res.status(403).json({ error: 'No employee profile' });
      filter.employeeId = emp._id;
    }

    const shifts = await Shift.find(filter).populate('employeeId', 'name position');
    res.json({ schedule, shifts });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/schedules
 * Create a new weekly schedule shell (no shifts yet).
 */
router.post('/', requireAuth, requireRole('admin', 'manager'), async (req, res) => {
  try {
    const { weekStart } = req.body;
    if (!weekStart) return res.status(400).json({ error: 'weekStart is required' });

    const existing = await Schedule.findOne({ weekStart });
    if (existing) return res.status(409).json({ error: 'Schedule for this week already exists', schedule: existing });

    const schedule = await Schedule.create({ weekStart, createdBy: req.user.id });
    res.status(201).json(schedule);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * DELETE /api/schedules/:weekStart
 * Remove a schedule and all associated shifts.
 */
router.delete('/:weekStart', requireAuth, requireRole('admin', 'manager'), async (req, res) => {
  try {
    const schedule = await Schedule.findOne({ weekStart: req.params.weekStart });
    if (!schedule) return res.status(404).json({ error: 'Schedule not found' });

    await Shift.deleteMany({ scheduleId: schedule._id });
    await schedule.deleteOne();
    res.json({ message: 'Schedule and shifts deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
