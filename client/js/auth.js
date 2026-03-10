// auth.js — Client-side authentication state management

/**
 * Store the JWT and decoded user info after login.
 */
export function setSession(token, user) {
  localStorage.setItem('token', token);
  localStorage.setItem('user', JSON.stringify(user));
}

/**
 * Clear session on logout.
 */
export function clearSession() {
  localStorage.removeItem('token');
  localStorage.removeItem('user');
}

/**
 * Retrieve the current user object (or null if not logged in).
 */
export function getCurrentUser() {
  try {
    const raw = localStorage.getItem('user');
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/**
 * Returns true if a valid (non-expired) token is stored.
 * Does a lightweight decode — not cryptographic verification.
 */
export function isLoggedIn() {
  const token = localStorage.getItem('token');
  if (!token) return false;
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    return payload.exp * 1000 > Date.now();
  } catch {
    return false;
  }
}

/**
 * Returns the current user's role, or null.
 */
export function getRole() {
  const user = getCurrentUser();
  return user?.role || null;
}

/**
 * Returns true if the current user has manager-level or higher access.
 */
export function isManager() {
  const role = getRole();
  return role === 'admin' || role === 'manager';
}
