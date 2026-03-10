// routes/users.js — Admin-only user management (list users, change roles, delete users)
import { Router } from 'express';
import User from '../models/User.js';
import Employee from '../models/Employee.js';
import { requireAuth, requireRole } from '../middleware/auth.js';

const router = Router();

/**
 * GET /api/users
 * List all user accounts with their roles. Admin only.
 */
router.get('/', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const users = await User.find().select('-passwordHash').sort({ createdAt: -1 });
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * PATCH /api/users/:id/role
 * Change a user's role. Admin only.
 * Body: { role: 'admin'|'manager'|'employee' }
 *
 * When promoting to manager/admin: removes their Employee record (they no longer
 * appear on the schedule grid as an employee row).
 * When demoting to employee: creates an Employee record if one doesn't exist.
 */
router.patch('/:id/role', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const { role } = req.body;
    if (!['admin', 'manager', 'employee'].includes(role)) {
      return res.status(400).json({ error: 'role must be admin, manager, or employee' });
    }

    // Prevent admins from demoting themselves
    if (req.params.id === req.user.id && role !== 'admin') {
      return res.status(400).json({ error: 'You cannot change your own role' });
    }

    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const oldRole = user.role;
    user.role = role;
    await user.save();

    // Ensure every user has an Employee record regardless of role
    // (managers and admins can also appear on the schedule grid)
    const existing = await Employee.findOne({ userId: user._id });
    if (!existing) {
      await Employee.create({ userId: user._id, name: user.name, maxHours: 40 });
    }

    res.json({ id: user._id, name: user.name, email: user.email, role: user.role });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * PATCH /api/users/:id/password
 * Admin resets any user's password.
 * Body: { password: string }
 */
router.patch('/:id/password', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const { password } = req.body;
    if (!password || password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    user.passwordHash = await User.hashPassword(password);
    await user.save();
    res.json({ message: 'Password updated' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * DELETE /api/users/:id
 * Permanently delete a user account and their employee profile. Admin only.
 */
router.delete('/:id', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    if (req.params.id === req.user.id) {
      return res.status(400).json({ error: 'You cannot delete your own account' });
    }
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    await Employee.findOneAndDelete({ userId: user._id });
    await user.deleteOne();
    res.json({ message: 'User deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/users/backfill-employees
 * One-time utility: creates missing Employee records for any user that doesn't have one.
 * Safe to call multiple times — skips users that already have a record.
 */
router.post('/backfill-employees', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const users = await User.find();
    let created = 0;
    for (const user of users) {
      const existing = await Employee.findOne({ userId: user._id });
      if (!existing) {
        await Employee.create({ userId: user._id, name: user.name, maxHours: 40 });
        created++;
      }
    }
    res.json({ message: `Backfill complete. Created ${created} missing Employee record(s).` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
