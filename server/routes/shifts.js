// routes/shifts.js — shift CRUD with conflict detection, availability check, overtime warning
import { Router } from 'express';
import Shift from '../models/Shift.js';
import Schedule from '../models/Schedule.js';
import Employee from '../models/Employee.js';
import Availability from '../models/Availability.js';
import TimeOffRequest from '../models/TimeOffRequest.js';
import { requireAuth, requireRole } from '../middleware/auth.js';

const router = Router();

/**
 * Parse a "HH-HH" string into { start: Number, end: Number }.
 * Accepts formats like "8-16", "8-4" (where end < start wraps to next day).
 */
function parseShiftTime(str) {
  if (typeof str !== 'string') return null;
  const parts = str.split('-').map(Number);
  if (parts.length !== 2 || parts.some(isNaN)) return null;
  let [start, end] = parts;
  // Handle "8-4" style (PM end) — treat as next-day wrap if end <= start
  if (end <= start) end += 12;
  return { start, end };
}

/**
 * Check for overlapping shifts for a given employee on a given day.
 * Returns the conflicting shift document or null.
 */
async function findConflict(scheduleId, employeeId, day, start, end, excludeId = null) {
  const query = { scheduleId, employeeId, day };
  if (excludeId) query._id = { $ne: excludeId };
  const shifts = await Shift.find(query);
  return shifts.find((s) => start < s.end && end > s.start) || null;
}

/**
 * Calculate total hours for an employee in a schedule week.
 */
async function weeklyHours(scheduleId, employeeId, excludeId = null) {
  const query = { scheduleId, employeeId };
  if (excludeId) query._id = { $ne: excludeId };
  const shifts = await Shift.find(query);
  return shifts.reduce((sum, s) => sum + (s.end - s.start), 0);
}

/**
 * POST /api/shifts
 * Create a new shift. Performs conflict detection and availability validation.
 * Body: { scheduleId, employeeId, day, start, end } OR { ..., time: "8-16" }
 */
router.post('/', requireAuth, requireRole('admin', 'manager'), async (req, res) => {
  try {
    let { scheduleId, employeeId, day, start, end, time } = req.body;

    // Accept "time" shorthand
    if (time) {
      const parsed = parseShiftTime(time);
      if (!parsed) return res.status(400).json({ error: 'Invalid time format. Use "HH-HH" e.g. "8-16"' });
      start = parsed.start;
      end = parsed.end;
    }

    if (!scheduleId || !employeeId || !day || start === undefined || end === undefined) {
      return res.status(400).json({ error: 'scheduleId, employeeId, day, start, end are required' });
    }
    if (start >= end) return res.status(400).json({ error: 'start must be before end' });

    // Verify schedule exists
    const schedule = await Schedule.findById(scheduleId);
    if (!schedule) return res.status(404).json({ error: 'Schedule not found' });

    // Verify employee exists
    const employee = await Employee.findById(employeeId);
    if (!employee) return res.status(404).json({ error: 'Employee not found' });

    const warnings = [];

    // ── Approved time-off block ──────────────────────────────────────────────
    // Compute the actual calendar date for this shift's day
    const dayNames = ['Saturday','Sunday','Monday','Tuesday','Wednesday','Thursday','Friday'];
    const dayIndex = dayNames.indexOf(day);
    const shiftDate = new Date(schedule.weekStart + 'T00:00:00');
    shiftDate.setDate(shiftDate.getDate() + dayIndex);
    const shiftDateStr = shiftDate.toISOString().split('T')[0];

    const blockedRequest = await TimeOffRequest.findOne({
      employeeId,
      status:    'approved',
      startDate: { $lte: shiftDateStr },
      endDate:   { $gte: shiftDateStr },
    });
    if (blockedRequest) {
      return res.status(409).json({
        error: `${employee.name} has approved time off on ${day} (${shiftDateStr}). Revoke the request before assigning a shift.`,
      });
    }

    // ── Conflict detection ───────────────────────────────────────────────────
    const conflict = await findConflict(scheduleId, employeeId, day, start, end);
    if (conflict) {
      return res.status(409).json({
        error: `Shift conflict: ${employee.name} already has a shift ${conflict.start}:00–${conflict.end}:00 on ${day}`,
      });
    }

    // ── Availability check ───────────────────────────────────────────────────
    const avail = await Availability.findOne({ employeeId });
    if (avail) {
      const available = avail.isAvailable(day, start, end);
      if (!available) {
        warnings.push(`${employee.name} has not declared availability for ${day} ${start}:00–${end}:00`);
      }
    }

    // ── Overtime detection ───────────────────────────────────────────────────
    const currentHours = await weeklyHours(scheduleId, employeeId);
    const newTotal = currentHours + (end - start);
    if (newTotal > employee.maxHours) {
      warnings.push(`Overtime: ${employee.name} will have ${newTotal}h this week (max ${employee.maxHours}h)`);
    }

    // ── Optimistic concurrency: bump schedule version ────────────────────────
    await Schedule.findByIdAndUpdate(scheduleId, { $inc: { version: 1 }, updatedAt: new Date() });

    const shift = await Shift.create({ scheduleId, employeeId, day, start, end });
    res.status(201).json({ shift, warnings });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/shifts?scheduleId=...
 * Fetch all shifts for a schedule (manager) or own shifts (employee).
 */
router.get('/', requireAuth, async (req, res) => {
  try {
    const { scheduleId } = req.query;
    if (!scheduleId) return res.status(400).json({ error: 'scheduleId query param required' });

    const filter = { scheduleId };
    if (req.user.role === 'employee') {
      const emp = await Employee.findOne({ userId: req.user.id });
      if (!emp) return res.json([]);
      filter.employeeId = emp._id;
    }

    const shifts = await Shift.find(filter).populate('employeeId', 'name position');
    res.json(shifts);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * DELETE /api/shifts/:id
 */
router.delete('/:id', requireAuth, requireRole('admin', 'manager'), async (req, res) => {
  try {
    const shift = await Shift.findByIdAndDelete(req.params.id);
    if (!shift) return res.status(404).json({ error: 'Shift not found' });
    // Bump schedule version on deletion too
    await Schedule.findByIdAndUpdate(shift.scheduleId, { $inc: { version: 1 } });
    res.json({ message: 'Shift deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
