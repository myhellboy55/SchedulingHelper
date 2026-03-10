// routes/availability.js — employee availability CRUD
import { Router } from 'express';
import Availability from '../models/Availability.js';
import Employee from '../models/Employee.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

/**
 * GET /api/availability/:employeeId
 * Employees can only fetch their own; managers can fetch anyone's.
 */
router.get('/:employeeId', requireAuth, async (req, res) => {
  try {
    const { employeeId } = req.params;

    // Employees must be fetching their own record
    if (req.user.role === 'employee') {
      const emp = await Employee.findOne({ userId: req.user.id });
      if (!emp || emp._id.toString() !== employeeId) {
        return res.status(403).json({ error: 'Access denied' });
      }
    }

    const avail = await Availability.findOne({ employeeId });
    if (!avail) {
      // Return an empty availability object
      return res.json({
        employeeId,
        days: { Monday: [], Tuesday: [], Wednesday: [], Thursday: [], Friday: [], Saturday: [], Sunday: [] },
      });
    }
    res.json(avail);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/availability/:employeeId
 * Upsert availability for an employee.
 * Body: { days: { Monday: ["8-16"], Tuesday: ["9-17"], ... } }
 * Employees can only update their own; managers can update anyone's.
 */
router.post('/:employeeId', requireAuth, async (req, res) => {
  try {
    const { employeeId } = req.params;
    const { days } = req.body;

    if (!days) return res.status(400).json({ error: 'days object is required' });

    // Employees can only modify their own availability
    if (req.user.role === 'employee') {
      const emp = await Employee.findOne({ userId: req.user.id });
      if (!emp || emp._id.toString() !== employeeId) {
        return res.status(403).json({ error: 'Access denied' });
      }
    }

    const avail = await Availability.findOneAndUpdate(
      { employeeId },
      { employeeId, days },
      { upsert: true, new: true }
    );
    res.json(avail);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
