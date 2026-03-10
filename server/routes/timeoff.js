// routes/timeoff.js — Time-off request submission, listing, and review
import { Router } from 'express';
import TimeOffRequest from '../models/TimeOffRequest.js';
import Employee from '../models/Employee.js';
import Shift from '../models/Shift.js';
import Schedule from '../models/Schedule.js';
import { requireAuth, requireRole } from '../middleware/auth.js';

const router = Router();

async function getMyEmployee(userId) {
  return Employee.findOne({ userId });
}

/**
 * GET /api/timeoff
 * Admins/managers see all requests; employees see only their own.
 * Optional ?status=pending|approved|denied filter.
 */
router.get('/', requireAuth, async (req, res) => {
  try {
    const filter = {};
    if (req.query.status) filter.status = req.query.status;

    if (req.user.role === 'employee') {
      const emp = await getMyEmployee(req.user.id);
      if (!emp) return res.json([]);
      filter.employeeId = emp._id;
    }

    const requests = await TimeOffRequest.find(filter)
      .populate('employeeId', 'name position')
      .populate('reviewedBy', 'name')
      .sort({ createdAt: -1 });

    res.json(requests);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/timeoff
 * - Employees submit for themselves (no employeeId in body needed)
 * - Managers and admins can submit on behalf of any employee via body.employeeId
 * Body: { startDate, endDate, reason, employeeId? }
 */
router.post('/', requireAuth, async (req, res) => {
  try {
    const { startDate, endDate, reason = '' } = req.body;
    if (!startDate || !endDate) {
      return res.status(400).json({ error: 'startDate and endDate are required' });
    }
    if (new Date(startDate) > new Date(endDate)) {
      return res.status(400).json({ error: 'startDate must be before or equal to endDate' });
    }

    let employeeId;
    if (req.user.role === 'employee') {
      // Employees can only submit for themselves
      const emp = await getMyEmployee(req.user.id);
      if (!emp) return res.status(404).json({ error: 'No employee profile found' });
      employeeId = emp._id;
    } else {
      // Managers and admins submit on behalf of a chosen employee
      if (!req.body.employeeId) {
        return res.status(400).json({ error: 'employeeId is required when submitting on behalf of an employee' });
      }
      employeeId = req.body.employeeId;
    }

    const request = await TimeOffRequest.create({ employeeId, startDate, endDate, reason });
    await request.populate('employeeId', 'name position');
    res.status(201).json(request);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * PATCH /api/timeoff/:id/review
 * Managers and admins can approve or deny requests.
 * On approval: conflicting shifts for that employee are auto-deleted.
 */
router.patch('/:id/review', requireAuth, requireRole('admin', 'manager'), async (req, res) => {
  try {
    const { status, reviewNote = '' } = req.body;
    if (!['approved', 'denied'].includes(status)) {
      return res.status(400).json({ error: 'status must be approved or denied' });
    }

    const request = await TimeOffRequest.findById(req.params.id);
    if (!request) return res.status(404).json({ error: 'Request not found' });

    request.status     = status;
    request.reviewedBy = req.user.id;
    request.reviewNote = reviewNote;
    await request.save();

    // Auto-delete any shifts that fall within the approved time-off window
    if (status === 'approved') {
      const coveredDates = request.coveredDates();
      // dayNames indexed by getDay() (0=Sun..6=Sat) — unchanged
      const dayNames = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
      for (const dateStr of coveredDates) {
        const dow      = dayNames[new Date(dateStr + 'T00:00:00').getDay()];
        const weekStart = getMondayOf(dateStr);
        const schedule = await Schedule.findOne({ weekStart });
        if (!schedule) continue;
        const deleted = await Shift.deleteMany({ scheduleId: schedule._id, employeeId: request.employeeId, day: dow });
        if (deleted.deletedCount > 0) {
          await Schedule.findByIdAndUpdate(schedule._id, { $inc: { version: 1 } });
        }
      }
    }

    await request.populate('employeeId', 'name position');
    await request.populate('reviewedBy', 'name');
    res.json(request);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * DELETE /api/timeoff/:id
 * - Employees can cancel their own pending requests
 * - Managers and admins can delete any request
 */
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const request = await TimeOffRequest.findById(req.params.id);
    if (!request) return res.status(404).json({ error: 'Request not found' });

    if (req.user.role === 'employee') {
      const emp = await getMyEmployee(req.user.id);
      if (!emp || request.employeeId.toString() !== emp._id.toString()) {
        return res.status(403).json({ error: 'Access denied' });
      }
      if (request.status !== 'pending') {
        return res.status(409).json({ error: 'Cannot cancel a reviewed request' });
      }
    }

    await request.deleteOne();
    res.json({ message: 'Request deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/timeoff/blocked/:employeeId/:weekStart
 * Returns which day names of a given week are blocked by approved time-off.
 */
router.get('/blocked/:employeeId/:weekStart', requireAuth, async (req, res) => {
  try {
    const { employeeId, weekStart } = req.params;
    const weekDates = [];
    const dayNames  = ['Saturday','Sunday','Monday','Tuesday','Wednesday','Thursday','Friday'];
    for (let i = 0; i < 7; i++) {
      const d = new Date(weekStart + 'T00:00:00');
      d.setDate(d.getDate() + i);
      weekDates.push(d.toISOString().split('T')[0]);
    }

    const requests = await TimeOffRequest.find({
      employeeId,
      status:    'approved',
      startDate: { $lte: weekDates[6] },
      endDate:   { $gte: weekDates[0] },
    });

    const blockedDays = new Set();
    for (const req of requests) {
      weekDates.forEach((date, i) => {
        if (date >= req.startDate && date <= req.endDate) blockedDays.add(dayNames[i]);
      });
    }

    res.json({ blockedDays: [...blockedDays] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

function getMondayOf(dateStr) {
  // Week now starts on Saturday
  const d = new Date(dateStr + 'T00:00:00');
  const day = d.getDay(); // 0=Sun, 6=Sat
  const diff = day === 6 ? 0 : -(day + 1);
  d.setDate(d.getDate() + diff);
  return d.toISOString().split('T')[0];
}

export default router;
