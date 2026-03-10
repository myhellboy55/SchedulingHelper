// api.js — Centralized API communication layer
// All fetch calls go through here; token is attached automatically.

const BASE = '/api';

/**
 * Core fetch wrapper: attaches JWT from localStorage, parses JSON.
 * Throws on non-2xx responses with the server's error message.
 */
async function apiFetch(path, options = {}) {
  const token = localStorage.getItem('token');
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${BASE}${path}`, { ...options, headers });
  const data = await res.json().catch(() => ({}));

  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

// ── Auth ──────────────────────────────────────────────────────────────────────
export const login = (name, password) =>
  apiFetch('/auth/login', { method: 'POST', body: JSON.stringify({ name, password }) });

export const register = (payload) =>
  apiFetch('/auth/register', { method: 'POST', body: JSON.stringify(payload) });

// ── Employees ─────────────────────────────────────────────────────────────────
export const getEmployees = () => apiFetch('/employees');
export const createEmployee = (data) =>
  apiFetch('/employees', { method: 'POST', body: JSON.stringify(data) });
export const updateEmployee = (id, data) =>
  apiFetch(`/employees/${id}`, { method: 'PUT', body: JSON.stringify(data) });
export const deleteEmployee = (id) =>
  apiFetch(`/employees/${id}`, { method: 'DELETE' });

// ── Schedules ─────────────────────────────────────────────────────────────────
export const getSchedules = () => apiFetch('/schedules');
export const getSchedule = (weekStart) => apiFetch(`/schedules/${weekStart}`);
export const createSchedule = (weekStart) =>
  apiFetch('/schedules', { method: 'POST', body: JSON.stringify({ weekStart }) });

// ── Shifts ────────────────────────────────────────────────────────────────────
export const createShift = (data) =>
  apiFetch('/shifts', { method: 'POST', body: JSON.stringify(data) });
export const deleteShift = (id) =>
  apiFetch(`/shifts/${id}`, { method: 'DELETE' });

// ── Availability ──────────────────────────────────────────────────────────────
export const getAvailability = (employeeId) => apiFetch(`/availability/${employeeId}`);
export const saveAvailability = (employeeId, days) =>
  apiFetch(`/availability/${employeeId}`, { method: 'POST', body: JSON.stringify({ days }) });

// ── Time Off ──────────────────────────────────────────────────────────────────
export const getTimeOffRequests = (status = '') =>
  apiFetch(`/timeoff${status ? `?status=${status}` : ''}`);
export const submitTimeOff = (data) =>
  apiFetch('/timeoff', { method: 'POST', body: JSON.stringify(data) });
export const reviewTimeOff = (id, status, reviewNote = '') =>
  apiFetch(`/timeoff/${id}/review`, { method: 'PATCH', body: JSON.stringify({ status, reviewNote }) });
export const deleteTimeOff = (id) =>
  apiFetch(`/timeoff/${id}`, { method: 'DELETE' });
export const getBlockedDays = (employeeId, weekStart) =>
  apiFetch(`/timeoff/blocked/${employeeId}/${weekStart}`);

// ── Admin: User Management ─────────────────────────────────────────────────────
export const getUsers = () => apiFetch('/users');
export const changeUserRole = (id, role) =>
  apiFetch(`/users/${id}/role`, { method: 'PATCH', body: JSON.stringify({ role }) });
export const resetUserPassword = (id, password) =>
  apiFetch(`/users/${id}/password`, { method: 'PATCH', body: JSON.stringify({ password }) });
export const deleteUser = (id) =>
  apiFetch(`/users/${id}`, { method: 'DELETE' });
