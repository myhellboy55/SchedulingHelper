// renderer.js — Pure UI rendering functions (no API calls here)

const DAYS = ['Saturday', 'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
const HOURS = Array.from({ length: 17 }, (_, i) => i + 6); // 6am–10pm

/**
 * Render the weekly schedule grid.
 * @param {HTMLElement} container
 * @param {Array}    employees    - Employee objects
 * @param {Array}    shifts       - Shift objects with populated employeeId
 * @param {boolean}  editable     - Whether managers can click cells
 * @param {Function} onCellClick  - (employeeId, day, existingShift|null, event)
 * @param {string}   weekStart    - ISO Monday date string e.g. "2024-06-03"
 * @param {Object}   availMap     - { employeeId: Availability doc }
 * @param {Object}   blockedMap   - { employeeId: Set<dayName> }
 */
export function renderScheduleGrid(
  container, employees, shifts, editable, onCellClick,
  weekStart = '', availMap = {}, blockedMap = {}
) {
  const shiftMap = {};
  for (const shift of shifts) {
    const empId = shift.employeeId?._id || shift.employeeId;
    if (!shiftMap[empId]) shiftMap[empId] = {};
    shiftMap[empId][shift.day] = shift;
  }

  const table = document.createElement('table');
  table.className = 'schedule-grid';

  // Header with dates
  const thead = document.createElement('thead');
  thead.innerHTML = `
    <tr>
      <th class="schedule-grid__name-col">Employee</th>
      ${DAYS.map((d, i) => {
        let dateLabel = '';
        if (weekStart) {
          const date = new Date(weekStart + 'T00:00:00');
          date.setDate(date.getDate() + i);
          dateLabel = date.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric' });
        }
        return `<th>${d.slice(0, 3)}${dateLabel ? `<br><span class="schedule-grid__date">${dateLabel}</span>` : ''}</th>`;
      }).join('')}
      <th>Total</th>
    </tr>
  `;
  table.appendChild(thead);

  const tbody = document.createElement('tbody');
  for (const emp of employees) {
    const row = document.createElement('tr');
    let totalHours = 0;
    const avail   = availMap[emp._id];
    const blocked = blockedMap[emp._id] || new Set();

    const cells = DAYS.map(day => {
      const shift     = shiftMap[emp._id]?.[day];
      const isBlocked = blocked.has(day);
      const isAvail   = avail ? checkAvailability(avail, day, shift) : null;
      if (shift) totalHours += shift.end - shift.start;

      const cell = document.createElement('td');
      cell.className = 'schedule-grid__cell';

      if (isBlocked) {
        cell.classList.add('schedule-grid__cell--blocked');
        cell.innerHTML = `<span class="timeoff-badge">Time Off</span>`;
        cell.title = 'Approved time off';
      } else if (shift) {
        cell.classList.add('schedule-grid__cell--filled');
        if (editable) cell.classList.add('schedule-grid__cell--editable');
        const badgeClass = isAvail === false ? 'shift-badge shift-badge--warn' : 'shift-badge';
        cell.innerHTML = `<span class="${badgeClass}">${shift.start}:00–${shift.end}:00</span>`;
        cell.title = isAvail === false ? '⚠ Outside declared availability' : '';
      } else {
        if (editable) cell.classList.add('schedule-grid__cell--editable');
        if (isAvail === true)  cell.classList.add('schedule-grid__cell--avail');
        if (isAvail === false) cell.classList.add('schedule-grid__cell--unavail');
      }

      if (editable && !isBlocked) {
        cell.addEventListener('click', (e) => onCellClick(emp._id, day, shift || null, e));
      }
      return cell;
    });

    const nameTd = document.createElement('td');
    nameTd.className = 'schedule-grid__name';
    nameTd.innerHTML = emp.name + (emp.position ? `<span class="schedule-grid__position">${emp.position}</span>` : '');

    row.appendChild(nameTd);
    cells.forEach(c => row.appendChild(c));

    const totalTd = document.createElement('td');
    totalTd.className = 'schedule-grid__total';
    const isOT = totalHours > (emp.maxHours || 40);
    totalTd.innerHTML = `<span class="${isOT ? 'overtime' : ''}">${totalHours}h${isOT ? ' ⚠' : ''}</span>`;
    row.appendChild(totalTd);
    tbody.appendChild(row);
  }

  // ── Static reminder rows ─────────────────────────────────────────────────
  // AFI Order: Saturday, Monday, Wednesday
  // WH Order:  Sunday, Wednesday
  // Damages:   Sunday, Wednesday
  const REMINDERS = [
    {
      label:    'AFI Order',
      theme:    'reminder--green',
      activeDays: new Set(['Saturday', 'Monday', 'Wednesday']),
    },
    {
      label:    'WH Order',
      theme:    'reminder--purple',
      activeDays: new Set(['Sunday', 'Wednesday']),
    },
    {
      label:    'Damages',
      theme:    'reminder--red',
      activeDays: new Set(['Sunday', 'Wednesday']),
    },
  ];

  for (const reminder of REMINDERS) {
    const row = document.createElement('tr');
    row.className = `reminder-row ${reminder.theme}`;

    // Label cell
    const labelTd = document.createElement('td');
    labelTd.className = 'reminder-row__label';
    labelTd.innerHTML = `<span class="reminder-badge reminder-badge--${reminder.theme.replace('reminder--','')}">${reminder.label}</span>`;
    row.appendChild(labelTd);

    // Day cells
    for (const day of DAYS) {
      const td = document.createElement('td');
      if (reminder.activeDays.has(day)) {
        td.className = `reminder-row__cell reminder-row__cell--active reminder-row__cell--${reminder.theme.replace('reminder--','')}`;
        td.innerHTML = `<span class="reminder-day-label">${reminder.label}</span>`;
      } else {
        td.className = 'reminder-row__cell';
      }
      row.appendChild(td);
    }

    // Blank total cell
    const blankTd = document.createElement('td');
    blankTd.className = 'reminder-row__cell';
    row.appendChild(blankTd);

    tbody.appendChild(row);
  }

  table.appendChild(tbody);
  container.innerHTML = '';
  container.appendChild(table);

  if (Object.keys(availMap).length > 0) {
    const legend = document.createElement('div');
    legend.className = 'grid-legend';
    legend.innerHTML = `
      <span class="grid-legend__item grid-legend__item--avail">Available</span>
      <span class="grid-legend__item grid-legend__item--unavail">Unavailable</span>
      <span class="grid-legend__item grid-legend__item--blocked">Time Off</span>
      <span class="grid-legend__item grid-legend__item--warn">Outside Availability</span>
    `;
    container.appendChild(legend);
  }
}

function checkAvailability(avail, day, shift) {
  const ranges = avail?.days?.[day];
  if (!ranges || ranges.length === 0) return false;
  if (!shift) return ranges.length > 0;
  return ranges.some(r => {
    const [s, e] = r.split('-').map(Number);
    return shift.start >= s && shift.end <= e;
  });
}

/**
 * Render the hourly availability checkbox grid (click/drag to toggle).
 */
export function renderAvailabilityEditor(container, availData) {
  const checkedMap = {};
  for (const day of DAYS) {
    checkedMap[day] = new Set();
    for (const r of (availData?.days?.[day] || [])) {
      const [s, e] = r.split('-').map(Number);
      for (let h = s; h < e; h++) checkedMap[day].add(h);
    }
  }

  const wrapper = document.createElement('div');
  wrapper.className = 'avail-grid';

  // Hour header row
  const headerRow = document.createElement('div');
  headerRow.className = 'avail-grid__row avail-grid__row--header';
  headerRow.innerHTML = `<div class="avail-grid__day-label"></div>` +
    HOURS.map(h => `<div class="avail-grid__hour-label">${h % 12 || 12}${h < 12 ? 'a' : 'p'}</div>`).join('');
  wrapper.appendChild(headerRow);

  for (const day of DAYS) {
    const row = document.createElement('div');
    row.className = 'avail-grid__row';
    const label = document.createElement('div');
    label.className = 'avail-grid__day-label';
    label.textContent = day.slice(0, 3);
    row.appendChild(label);

    for (const hour of HOURS) {
      const cell = document.createElement('div');
      cell.className = 'avail-grid__cell';
      cell.dataset.day  = day;
      cell.dataset.hour = hour;
      if (checkedMap[day].has(hour)) cell.classList.add('avail-grid__cell--checked');

      cell.addEventListener('mousedown', (e) => {
        e.preventDefault();
        cell.classList.toggle('avail-grid__cell--checked');
        wrapper._dragging  = true;
        wrapper._dragValue = cell.classList.contains('avail-grid__cell--checked');
      });
      cell.addEventListener('mouseenter', () => {
        if (!wrapper._dragging) return;
        wrapper._dragValue
          ? cell.classList.add('avail-grid__cell--checked')
          : cell.classList.remove('avail-grid__cell--checked');
      });
      row.appendChild(cell);
    }
    wrapper.appendChild(row);
  }

  document.addEventListener('mouseup', () => { wrapper._dragging = false; });

  container.innerHTML = '';
  container.appendChild(wrapper);
  const hint = document.createElement('p');
  hint.className = 'hint';
  hint.style.marginTop = '.75rem';
  hint.textContent = 'Click or drag to toggle hours. Green = available.';
  container.appendChild(hint);
}

/**
 * Read the availability grid into { days: { Monday: ["8-16"], ... } }.
 */
export function readAvailabilityEditor(container) {
  const days = {};
  for (const day of DAYS) {
    const hours = [];
    container.querySelectorAll(`.avail-grid__cell[data-day="${day}"]`).forEach(cell => {
      if (cell.classList.contains('avail-grid__cell--checked')) hours.push(parseInt(cell.dataset.hour));
    });
    days[day] = mergeHoursToRanges(hours);
  }
  return days;
}

function mergeHoursToRanges(hours) {
  if (!hours.length) return [];
  const sorted = [...hours].sort((a, b) => a - b);
  const ranges = [];
  let start = sorted[0], end = sorted[0] + 1;
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] === end) { end++; }
    else { ranges.push(`${start}-${end}`); start = sorted[i]; end = sorted[i] + 1; }
  }
  ranges.push(`${start}-${end}`);
  return ranges;
}

/**
 * Render time-off request list for managers.
 */
export function renderTimeOffList(container, requests, onReview, onDelete) {
  if (!requests.length) {
    container.innerHTML = '<p class="empty-state">No time-off requests.</p>';
    return;
  }
  container.innerHTML = `
    <ul class="timeoff-list">
      ${requests.map(r => {
        const sc = { pending: 'warning', approved: 'success', denied: 'danger' }[r.status] || '';
        const empName = r.employeeId?.name || 'Unknown';
        return `
          <li class="timeoff-list__item" data-id="${r._id}">
            <div class="timeoff-list__info">
              <strong>${empName}</strong>
              <span class="timeoff-list__dates">${r.startDate} → ${r.endDate}</span>
              ${r.reason ? `<span class="timeoff-list__reason">"${r.reason}"</span>` : ''}
              ${r.reviewNote ? `<span class="timeoff-list__note">Note: ${r.reviewNote}</span>` : ''}
            </div>
            <div class="timeoff-list__actions">
              <span class="status-badge status-badge--${sc}">${r.status}</span>
              ${r.status === 'pending' ? `
                <button class="btn btn--sm btn--primary timeoff-approve" data-id="${r._id}">Approve</button>
                <button class="btn btn--sm btn--danger timeoff-deny" data-id="${r._id}">Deny</button>
              ` : `<button class="btn btn--sm btn--ghost timeoff-delete" data-id="${r._id}">Remove</button>`}
            </div>
          </li>`;
      }).join('')}
    </ul>`;

  container.querySelectorAll('.timeoff-approve').forEach(b => b.addEventListener('click', () => onReview(b.dataset.id, 'approved')));
  container.querySelectorAll('.timeoff-deny').forEach(b => b.addEventListener('click', () => onReview(b.dataset.id, 'denied')));
  container.querySelectorAll('.timeoff-delete').forEach(b => b.addEventListener('click', () => onDelete(b.dataset.id)));
}

/**
 * Render employee's own time-off list.
 */
export function renderMyTimeOffList(container, requests, onCancel) {
  if (!requests.length) {
    container.innerHTML = '<p class="empty-state">No requests submitted yet.</p>';
    return;
  }
  container.innerHTML = `
    <ul class="timeoff-list">
      ${requests.map(r => {
        const sc = { pending: 'warning', approved: 'success', denied: 'danger' }[r.status] || '';
        return `
          <li class="timeoff-list__item" data-id="${r._id}">
            <div class="timeoff-list__info">
              <span class="timeoff-list__dates">${r.startDate} → ${r.endDate}</span>
              ${r.reason ? `<span class="timeoff-list__reason">"${r.reason}"</span>` : ''}
              ${r.reviewNote ? `<span class="timeoff-list__note">Manager note: ${r.reviewNote}</span>` : ''}
            </div>
            <div class="timeoff-list__actions">
              <span class="status-badge status-badge--${sc}">${r.status}</span>
              ${r.status === 'pending'
                ? `<button class="btn btn--sm btn--ghost timeoff-cancel" data-id="${r._id}">Cancel</button>`
                : ''}
            </div>
          </li>`;
      }).join('')}
    </ul>`;
  container.querySelectorAll('.timeoff-cancel').forEach(b => b.addEventListener('click', () => onCancel(b.dataset.id)));
}

/** Render employee list with delete buttons */
export function renderEmployeeList(container, employees, onDelete) {
  if (!employees.length) {
    container.innerHTML = '<p class="empty-state">No employees yet.</p>';
    return;
  }
  container.innerHTML = `
    <ul class="employee-list">
      ${employees.map(emp => `
        <li class="employee-list__item" data-id="${emp._id}">
          <div class="employee-list__info">
            <strong>${emp.name}</strong>
            <span>${emp.position || '—'}</span>
            <span class="employee-list__hours">${emp.maxHours}h/wk max</span>
          </div>
          <button class="btn btn--danger btn--sm employee-list__delete" data-id="${emp._id}">Remove</button>
        </li>`).join('')}
    </ul>`;
  container.querySelectorAll('.employee-list__delete').forEach(btn => {
    btn.addEventListener('click', () => onDelete(btn.dataset.id));
  });
}

export function showToast(message, type = 'success') {
  let toast = document.getElementById('toast');
  if (!toast) { toast = document.createElement('div'); toast.id = 'toast'; document.body.appendChild(toast); }
  toast.textContent = message;
  toast.className = `toast toast--${type} toast--visible`;
  clearTimeout(toast._timeout);
  toast._timeout = setTimeout(() => toast.classList.remove('toast--visible'), 3500);
}

export function formatWeek(weekStart) {
  const d = new Date(weekStart + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function getThisMonday() {
  // Week starts on Saturday — roll back to most recent Saturday
  const d = new Date();
  const day = d.getDay(); // 0=Sun, 6=Sat
  const diff = day === 6 ? 0 : -(day + 1);
  d.setDate(d.getDate() + diff);
  return d.toISOString().split('T')[0];
}

/**
 * Render the admin user management list.
 * @param {Array}    users       - User objects (no passwordHash)
 * @param {string}   currentId   - The logged-in admin's own ID (to protect self)
 * @param {Function} onRoleChange - (id, newRole)
 * @param {Function} onResetPw   - (id, name)
 * @param {Function} onDelete    - (id, name)
 */
export function renderUserList(container, users, currentId, onRoleChange, onResetPw, onDelete) {
  if (!users.length) {
    container.innerHTML = '<p class="empty-state">No users found.</p>';
    return;
  }
  const ROLES = ['employee', 'manager', 'admin'];
  container.innerHTML = `
    <ul class="user-mgmt-list">
      ${users.map(u => {
        const isSelf = u._id === currentId;
        const roleClass = { admin: 'danger', manager: 'warning', employee: '' }[u.role] || '';
        return `
          <li class="user-mgmt-list__item" data-id="${u._id}">
            <div class="user-mgmt-list__info">
              <strong>${u.name}</strong>
              ${u.email ? `<span class="user-mgmt-list__email">${u.email}</span>` : ''}
              <span class="status-badge status-badge--${roleClass}">${u.role}</span>
              ${isSelf ? '<span class="user-mgmt-list__self">(you)</span>' : ''}
            </div>
            <div class="user-mgmt-list__actions">
              ${!isSelf ? `
                <select class="user-role-select" data-id="${u._id}">
                  ${ROLES.map(r => `<option value="${r}" ${r === u.role ? 'selected' : ''}>${r}</option>`).join('')}
                </select>
                <button class="btn btn--ghost btn--sm user-reset-pw" data-id="${u._id}" data-name="${u.name}">Reset PW</button>
                <button class="btn btn--danger btn--sm user-delete" data-id="${u._id}" data-name="${u.name}">Delete</button>
              ` : '<span class="user-mgmt-list__self-note">Cannot modify your own account</span>'}
            </div>
          </li>`;
      }).join('')}
    </ul>`;

  container.querySelectorAll('.user-role-select').forEach(sel => {
    sel.addEventListener('change', () => onRoleChange(sel.dataset.id, sel.value));
  });
  container.querySelectorAll('.user-reset-pw').forEach(btn => {
    btn.addEventListener('click', () => onResetPw(btn.dataset.id, btn.dataset.name));
  });
  container.querySelectorAll('.user-delete').forEach(btn => {
    btn.addEventListener('click', () => onDelete(btn.dataset.id, btn.dataset.name));
  });
}
