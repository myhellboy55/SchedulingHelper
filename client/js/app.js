// app.js — Main application controller

import * as api from './api.js';
import * as auth from './auth.js';
import { showShiftPopup } from './popup.js';
import {
  renderScheduleGrid,
  renderAvailabilityEditor,
  readAvailabilityEditor,
  renderEmployeeList,
  renderTimeOffList,
  renderMyTimeOffList,
  renderUserList,
  showToast,
  formatWeek,
  getThisMonday,
} from './renderer.js';

const views = {
  login:    document.getElementById('view-login'),
  manager:  document.getElementById('view-manager'),
  employee: document.getElementById('view-employee'),
};

let state = {
  employees:   [],
  currentWeek: getThisMonday(),
  scheduleId:  null,
};

// ── Router ────────────────────────────────────────────────────────────────────
function showView(name) {
  Object.values(views).forEach(v => v?.classList.add('hidden'));
  views[name]?.classList.remove('hidden');
}

function route() {
  if (!auth.isLoggedIn()) return showView('login');
  if (auth.isManager()) { showView('manager'); initManagerView(); }
  else                  { showView('employee'); initEmployeeView(); }
}

// ── Login / Register ──────────────────────────────────────────────────────────
document.getElementById('form-login')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    const data = await api.login(
      document.getElementById('login-name').value,
      document.getElementById('login-password').value
    );
    auth.setSession(data.token, data.user);
    route();
  } catch (err) { showToast(err.message, 'error'); }
});

document.getElementById('form-register')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const regEmail = document.getElementById('reg-email').value.trim();
  const payload = {
    name:     document.getElementById('reg-name').value,
    password: document.getElementById('reg-password').value,
    role:     document.getElementById('reg-role').value,
    maxHours: parseInt(document.getElementById('reg-maxhours').value) || 40,
    position: document.getElementById('reg-position').value,
    ...(regEmail && { email: regEmail }),  // only include if not blank
  };
  try {
    const data = await api.register(payload);
    auth.setSession(data.token, data.user);
    showToast('Account created!');
    route();
  } catch (err) { showToast(err.message, 'error'); }
});

document.getElementById('show-register')?.addEventListener('click', () => {
  document.getElementById('login-section').classList.add('hidden');
  document.getElementById('register-section').classList.remove('hidden');
});
document.getElementById('show-login')?.addEventListener('click', () => {
  document.getElementById('register-section').classList.add('hidden');
  document.getElementById('login-section').classList.remove('hidden');
});

document.querySelectorAll('.btn-logout').forEach(btn => {
  btn.addEventListener('click', () => { auth.clearSession(); showView('login'); });
});

// ── Manager View ──────────────────────────────────────────────────────────────
async function initManagerView() {
  const user = auth.getCurrentUser();
  document.getElementById('manager-name').textContent = user?.name || '';

  // Show Admin tab only for admin role
  if (user?.role === 'admin') {
    document.querySelectorAll('.tab-btn--admin').forEach(b => b.classList.remove('hidden'));
  }

  setupWeekNav();
  await loadEmployees();
  await loadManagerSchedule();
  setupAddEmployee();
  setupManagerTabs();
  await loadManagerTimeOff();
}

function setupWeekNav() {
  document.getElementById('week-display').textContent = formatWeek(state.currentWeek);
  document.getElementById('btn-prev-week')?.addEventListener('click', async () => {
    const d = new Date(state.currentWeek + 'T00:00:00');
    d.setDate(d.getDate() - 7);
    state.currentWeek = d.toISOString().split('T')[0];
    document.getElementById('week-display').textContent = formatWeek(state.currentWeek);
    await loadManagerSchedule();
  });
  document.getElementById('btn-next-week')?.addEventListener('click', async () => {
    const d = new Date(state.currentWeek + 'T00:00:00');
    d.setDate(d.getDate() + 7);
    state.currentWeek = d.toISOString().split('T')[0];
    document.getElementById('week-display').textContent = formatWeek(state.currentWeek);
    await loadManagerSchedule();
  });
}

async function loadEmployees() {
  try {
    state.employees = await api.getEmployees();

    // Populate manager time-off employee dropdown
    const sel = document.getElementById('mgr-timeoff-employee');
    if (sel) {
      sel.innerHTML = '<option value="">— Select employee —</option>' +
        state.employees.map(e => `<option value="${e._id}">${e.name}</option>`).join('');
    }

    renderEmployeeList(document.getElementById('employee-list'), state.employees, async (id) => {
      if (!confirm('Remove this employee?')) return;
      try {
        await api.deleteEmployee(id);
        showToast('Employee removed');
        await loadEmployees();
        await loadManagerSchedule();
      } catch (err) { showToast(err.message, 'error'); }
    });
  } catch (err) { showToast(err.message, 'error'); }
}

async function loadManagerSchedule() {
  const gridContainer = document.getElementById('schedule-grid');
  gridContainer.innerHTML = '<p class="loading">Loading schedule…</p>';
  try {
    let scheduleData;
    try {
      scheduleData = await api.getSchedule(state.currentWeek);
      state.scheduleId = scheduleData.schedule._id;
    } catch (err) {
      if (err.message.includes('not found') || err.message.includes('404')) {
        gridContainer.innerHTML = `
          <div class="empty-state">
            <p>No schedule for week of ${formatWeek(state.currentWeek)}.</p>
            <button class="btn btn--primary" id="btn-create-schedule">Create Schedule</button>
          </div>`;
        document.getElementById('btn-create-schedule')?.addEventListener('click', async () => {
          try { await api.createSchedule(state.currentWeek); await loadManagerSchedule(); }
          catch (e) { showToast(e.message, 'error'); }
        });
        return;
      }
      throw err;
    }

    const [availResults, blockedResults] = await Promise.all([
      Promise.all(state.employees.map(emp =>
        api.getAvailability(emp._id).then(a => ({ id: emp._id, data: a })).catch(() => ({ id: emp._id, data: null }))
      )),
      Promise.all(state.employees.map(emp =>
        api.getBlockedDays(emp._id, state.currentWeek).then(r => ({ id: emp._id, days: r.blockedDays })).catch(() => ({ id: emp._id, days: [] }))
      )),
    ]);

    const availMap   = {};
    const blockedMap = {};
    availResults.forEach(r => { if (r.data) availMap[r.id] = r.data; });
    blockedResults.forEach(r => { blockedMap[r.id] = new Set(r.days); });

    renderScheduleGrid(
      gridContainer,
      state.employees,
      scheduleData.shifts,
      true,
      async (employeeId, day, existingShift, e) => {
        showShiftPopup(
          e.currentTarget,
          async (timeStr) => {
            try {
              const result = await api.createShift({ scheduleId: state.scheduleId, employeeId, day, time: timeStr });
              if (result.warnings?.length) result.warnings.forEach(w => showToast(w, 'warning'));
              else showToast('Shift saved');
              await loadManagerSchedule();
            } catch (err) { showToast(err.message, 'error'); }
          },
          existingShift ? async () => {
            try {
              await api.deleteShift(existingShift._id);
              showToast('Shift removed');
              await loadManagerSchedule();
            } catch (err) { showToast(err.message, 'error'); }
          } : null
        );
      },
      state.currentWeek,
      availMap,
      blockedMap
    );
  } catch (err) {
    gridContainer.innerHTML = `<p class="error-state">${err.message}</p>`;
  }
}

async function loadManagerTimeOff() {
  const container = document.getElementById('timeoff-list');
  if (!container) return;
  try {
    const requests = await api.getTimeOffRequests();
    renderTimeOffList(
      container,
      requests,
      async (id, status) => {
        const note = status === 'denied' ? (prompt('Optional note for employee:') || '') : '';
        try {
          await api.reviewTimeOff(id, status, note);
          showToast(`Request ${status}`);
          await loadManagerTimeOff();
          await loadManagerSchedule();
        } catch (err) { showToast(err.message, 'error'); }
      },
      async (id) => {
        try {
          await api.deleteTimeOff(id);
          showToast('Request removed');
          await loadManagerTimeOff();
        } catch (err) { showToast(err.message, 'error'); }
      }
    );

    // Pending count badge on sidebar
    const pending = requests.filter(r => r.status === 'pending').length;
    const badge = document.getElementById('timeoff-badge');
    if (badge) { badge.textContent = pending || ''; badge.style.display = pending ? '' : 'none'; }
  } catch (err) { showToast(err.message, 'error'); }
}

// Manager submits time-off on behalf of an employee
document.getElementById('form-manager-timeoff')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const payload = {
    employeeId: document.getElementById('mgr-timeoff-employee').value,
    startDate:  document.getElementById('mgr-timeoff-start').value,
    endDate:    document.getElementById('mgr-timeoff-end').value,
    reason:     document.getElementById('mgr-timeoff-reason').value,
  };
  try {
    await api.submitTimeOff(payload);
    showToast('Time-off request submitted');
    e.target.reset();
    await loadManagerTimeOff();
  } catch (err) { showToast(err.message, 'error'); }
});

async function loadAdminUsers() {
  const container = document.getElementById('admin-user-list');
  if (!container) return;
  try {
    const users = await api.getUsers();
    const me = auth.getCurrentUser();
    renderUserList(
      container,
      users,
      me.id,
      async (id, role) => {
        if (!confirm(`Change this user's role to "${role}"?`)) {
          await loadAdminUsers(); // reset dropdown
          return;
        }
        try {
          await api.changeUserRole(id, role);
          showToast('Role updated');
          await loadAdminUsers();
          await loadEmployees(); // employee list may have changed
        } catch (err) { showToast(err.message, 'error'); }
      },
      async (id, name) => {
        const pw = prompt(`New password for ${name}:`);
        if (!pw) return;
        try {
          await api.resetUserPassword(id, pw);
          showToast('Password reset');
        } catch (err) { showToast(err.message, 'error'); }
      },
      async (id, name) => {
        if (!confirm(`Permanently delete ${name}? This cannot be undone.`)) return;
        try {
          await api.deleteUser(id);
          showToast(`${name} deleted`);
          await loadAdminUsers();
          await loadEmployees();
          await loadManagerSchedule();
        } catch (err) { showToast(err.message, 'error'); }
      }
    );
  } catch (err) { showToast(err.message, 'error'); }
}

function setupAddEmployee() {
  document.getElementById('form-add-employee')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const emailVal = document.getElementById('emp-email').value.trim();
    const payload = {
      name:     document.getElementById('emp-name').value,
      password: document.getElementById('emp-password').value,
      role:     'employee',
      maxHours: parseInt(document.getElementById('emp-maxhours').value) || 40,
      position: document.getElementById('emp-position').value,
      ...(emailVal && { email: emailVal }),  // only include if not blank
    };
    try {
      await api.register(payload);
      showToast(`${payload.name} added`);
      e.target.reset();
      await loadEmployees();
    } catch (err) { showToast(err.message, 'error'); }
  });
}

function setupManagerTabs() {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const target = btn.dataset.tab;
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-panel').forEach(p => p.classList.add('hidden'));
      btn.classList.add('active');
      document.getElementById(`tab-${target}`)?.classList.remove('hidden');
      if (target === 'timeoff') loadManagerTimeOff();
      if (target === 'admin')   loadAdminUsers();
    });
  });
}

// ── Employee View ─────────────────────────────────────────────────────────────
async function initEmployeeView() {
  document.getElementById('employee-username').textContent = auth.getCurrentUser()?.name || '';
  setupEmployeeWeekNav();
  await loadEmployeeSchedule();
  await loadAvailabilityEditor();
  await loadMyTimeOff();

  document.querySelectorAll('.emp-tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.emp-tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.emp-tab-panel').forEach(p => p.classList.add('hidden'));
      btn.classList.add('active');
      document.getElementById(`emp-tab-${btn.dataset.tab}`)?.classList.remove('hidden');
    });
  });
}

let empWeek = getThisMonday();

function setupEmployeeWeekNav() {
  document.getElementById('emp-week-display').textContent = formatWeek(empWeek);
  document.getElementById('emp-btn-prev')?.addEventListener('click', async () => {
    const d = new Date(empWeek + 'T00:00:00'); d.setDate(d.getDate() - 7);
    empWeek = d.toISOString().split('T')[0];
    document.getElementById('emp-week-display').textContent = formatWeek(empWeek);
    await loadEmployeeSchedule();
  });
  document.getElementById('emp-btn-next')?.addEventListener('click', async () => {
    const d = new Date(empWeek + 'T00:00:00'); d.setDate(d.getDate() + 7);
    empWeek = d.toISOString().split('T')[0];
    document.getElementById('emp-week-display').textContent = formatWeek(empWeek);
    await loadEmployeeSchedule();
  });
}

async function loadEmployeeSchedule() {
  const container = document.getElementById('emp-schedule-grid');
  container.innerHTML = '<p class="loading">Loading…</p>';
  try {
    const [data, empList] = await Promise.all([api.getSchedule(empWeek), api.getEmployees()]);
    renderScheduleGrid(container, empList, data.shifts, false, null, empWeek);
  } catch {
    container.innerHTML = `<p class="empty-state">No schedule published for this week yet.</p>`;
  }
}

async function loadAvailabilityEditor() {
  try {
    const employees = await api.getEmployees();
    if (!employees.length) return;
    const emp   = employees[0];
    const avail = await api.getAvailability(emp._id);
    const container = document.getElementById('avail-editor-container');
    renderAvailabilityEditor(container, avail);

    document.getElementById('btn-save-avail')?.addEventListener('click', async () => {
      const days = readAvailabilityEditor(container);
      try {
        await api.saveAvailability(emp._id, days);
        showToast('Availability saved!');
      } catch (err) { showToast(err.message, 'error'); }
    });
  } catch (err) { showToast('Could not load availability', 'error'); }
}

async function loadMyTimeOff() {
  const container = document.getElementById('my-timeoff-list');
  if (!container) return;
  try {
    const requests = await api.getTimeOffRequests();
    renderMyTimeOffList(container, requests, async (id) => {
      try {
        await api.deleteTimeOff(id);
        showToast('Request cancelled');
        await loadMyTimeOff();
      } catch (err) { showToast(err.message, 'error'); }
    });
  } catch (err) { showToast(err.message, 'error'); }
}

document.getElementById('form-request-timeoff')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const payload = {
    startDate: document.getElementById('timeoff-start').value,
    endDate:   document.getElementById('timeoff-end').value,
    reason:    document.getElementById('timeoff-reason').value,
  };
  try {
    await api.submitTimeOff(payload);
    showToast('Request submitted!');
    e.target.reset();
    await loadMyTimeOff();
  } catch (err) { showToast(err.message, 'error'); }
});

// ── Print Schedule ────────────────────────────────────────────────────────────
document.getElementById('btn-print')?.addEventListener('click', printSchedule);

function printSchedule() {
  const gridHTML  = document.getElementById('schedule-grid')?.innerHTML || '';
  const weekLabel = document.getElementById('week-display')?.textContent || '';

  const win = window.open('', '_blank', 'width=1000,height=700');
  win.document.write(`<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"/>
<title>Schedule — ${weekLabel}</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:'Segoe UI',Arial,sans-serif;font-size:12px;color:#111;background:#fff;padding:24px 28px;-webkit-print-color-adjust:exact;print-color-adjust:exact;}
  .print-header{display:flex;justify-content:space-between;align-items:flex-end;border-bottom:2px solid #111;padding-bottom:10px;margin-bottom:16px}
  .print-header__title{font-size:22px;font-weight:700;letter-spacing:-.02em}
  .print-header__week{font-size:13px;color:#555;margin-top:2px}
  .print-header__meta{font-size:11px;color:#888;text-align:right}
  table{width:100%;border-collapse:collapse;table-layout:fixed}
  th{background:#f0f0f0;border:1px solid #ccc;padding:7px 4px;text-align:center;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.05em}
  th.name-col{text-align:left;padding-left:10px;width:140px}
  td{border:1px solid #ddd;padding:6px 4px;text-align:center;height:38px;vertical-align:middle}
  td.name-cell{text-align:left;padding-left:10px;font-weight:600;background:#fafafa}
  td.name-cell .position{display:block;font-size:10px;font-weight:400;color:#888}
  td.total-cell{font-weight:600;background:#fafafa;font-size:11px}
  .overtime{color:#c0392b}
  .shift-badge{display:inline-block;background:#e8f0fe;border:1px solid #aac4f5;border-radius:4px;padding:2px 6px;font-size:11px;font-weight:600;color:#1a56cc;white-space:nowrap}
  .shift-badge--warn{background:#fff8e1;border-color:#f5c842;color:#8a6800}
  .timeoff-badge{display:inline-block;background:#fdecea;border:1px solid #f5c6c5;border-radius:4px;padding:2px 6px;font-size:10px;font-weight:700;color:#c0392b;text-transform:uppercase}
  td.avail{background:#f0fdf8} td.unavail{background:#f9f9f9} td.blocked{background:#fff5f5}
  tbody tr:nth-child(odd){background:#ffffff}
  tbody tr:nth-child(even){background:#aaaaaa}
  tbody tr:nth-child(even) td.name-cell{background:#909090}
  tbody tr:nth-child(even) td.total-cell{background:#909090}
  tbody tr:nth-child(even) td.avail{background:#a8dfc4}
  tbody tr:nth-child(even) td.unavail{background:#c0c0c0}
  tbody tr:nth-child(even) td.blocked{background:#f0b8b8}
  .print-legend{margin-top:14px;display:flex;gap:20px;font-size:10px;color:#555;flex-wrap:wrap}
  .print-legend span::before{content:'■ '}
  .l-avail{color:#27ae60}.l-blocked{color:#c0392b}.l-warn{color:#8a6800}
  .sig-area{margin-top:28px;display:flex;gap:48px}
  .sig-line{flex:1;border-top:1px solid #555;padding-top:4px;font-size:10px;color:#666}
  .print-footer{margin-top:20px;border-top:1px solid #ddd;padding-top:8px;font-size:10px;color:#aaa;display:flex;justify-content:space-between}
  @media print{body{padding:12px;-webkit-print-color-adjust:exact;print-color-adjust:exact;}@page{size:landscape;margin:1cm}}
</style></head><body>
  <div class="print-header">
    <div>
      <div class="print-header__title">ShiftDesk — Weekly Schedule</div>
      <div class="print-header__week">Week of ${weekLabel}</div>
    </div>
    <div class="print-header__meta">
      Printed: ${new Date().toLocaleDateString('en-US',{weekday:'short',year:'numeric',month:'short',day:'numeric'})}<br>
      <em>For internal use only</em>
    </div>
  </div>
  ${transformGridForPrint(gridHTML)}
  <div class="print-legend">
    <span class="l-avail">Available</span>
    <span class="l-blocked">Approved Time Off</span>
    <span class="l-warn">Outside Availability</span>
  </div>
  <div class="sig-area">
    <div class="sig-line">Manager Signature</div>
    <div class="sig-line">Date Posted</div>
    <div class="sig-line">Next Review Date</div>
  </div>
  <div class="print-footer">
    <span>ShiftDesk Scheduling System</span><span>Week of ${weekLabel}</span>
  </div>
  <script>window.onload=function(){window.print()}<\/script>
</body></html>`);
  win.document.close();
}

function transformGridForPrint(html) {
  return html
    .replace(/schedule-grid__cell--avail\b/g,   'avail')
    .replace(/schedule-grid__cell--unavail\b/g, 'unavail')
    .replace(/schedule-grid__cell--blocked\b/g, 'blocked')
    .replace(/schedule-grid__cell--editable\b/g, '')
    .replace(/schedule-grid__cell--filled\b/g,  '')
    .replace(/schedule-grid__cell\b/g,          '')
    .replace(/schedule-grid__name\b/g,          'name-cell')
    .replace(/schedule-grid__position\b/g,      'position')
    .replace(/schedule-grid__total\b/g,         'total-cell')
    .replace(/schedule-grid__date\b/g,          '')
    .replace(/schedule-grid\b/g,                '')
    .replace(/schedule-grid__name-col\b/g,      'name-col')
    .replace(/class="grid-legend[\s\S]*?<\/div>/g, '')
    .trim();
}

// ── Init ──────────────────────────────────────────────────────────────────────
route();
