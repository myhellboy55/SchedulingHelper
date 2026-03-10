// popup.js — Shift selector popup component
// Renders a quick-pick shift popup over a schedule cell.

const QUICK_SHIFTS = [
  { label: '8–4',  value: '8-4' },
  { label: '8–5',  value: '8-5' },
  { label: '9–5',  value: '9-5' },
  { label: '10–6', value: '10-6' },
  { label: '12–8', value: '12-8' },
  { label: '3–10', value: '3-10' },
  { label: '4–10', value: '4-10' },
  { label: '6–2',  value: '6-2'  },
];

let activePopup = null;

/**
 * Show a shift-selector popup near the target element.
 * @param {HTMLElement} anchor - The cell that was clicked.
 * @param {Function} onSelect - Called with the chosen time string "HH-HH".
 * @param {Function} onDelete - Called if user wants to remove existing shift. Pass null to hide.
 */
export function showShiftPopup(anchor, onSelect, onDelete = null) {
  closePopup();

  const popup = document.createElement('div');
  popup.className = 'shift-popup';
  popup.innerHTML = `
    <div class="shift-popup__header">
      <span>Select Shift</span>
      <button class="shift-popup__close" aria-label="Close">✕</button>
    </div>
    <div class="shift-popup__quick">
      ${QUICK_SHIFTS.map(s => `
        <button class="shift-popup__quick-btn" data-value="${s.value}">${s.label}</button>
      `).join('')}
    </div>
    <div class="shift-popup__custom">
      <label>Custom (e.g. 9-17)</label>
      <div class="shift-popup__custom-row">
        <input type="text" class="shift-popup__input" placeholder="start-end" maxlength="6" />
        <button class="shift-popup__apply">Apply</button>
      </div>
    </div>
    ${onDelete ? `<button class="shift-popup__delete">Remove Shift</button>` : ''}
  `;

  // Position near the anchor
  const rect = anchor.getBoundingClientRect();
  popup.style.position = 'fixed';
  popup.style.top = `${Math.min(rect.bottom + 4, window.innerHeight - 280)}px`;
  popup.style.left = `${Math.min(rect.left, window.innerWidth - 220)}px`;
  popup.style.zIndex = '9999';

  document.body.appendChild(popup);
  activePopup = popup;

  // Close button
  popup.querySelector('.shift-popup__close').addEventListener('click', closePopup);

  // Quick shift buttons
  popup.querySelectorAll('.shift-popup__quick-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      onSelect(btn.dataset.value);
      closePopup();
    });
  });

  // Custom apply
  popup.querySelector('.shift-popup__apply').addEventListener('click', () => {
    const val = popup.querySelector('.shift-popup__input').value.trim();
    if (!val.match(/^\d{1,2}-\d{1,2}$/)) {
      popup.querySelector('.shift-popup__input').classList.add('error');
      return;
    }
    onSelect(val);
    closePopup();
  });

  // Delete button (optional)
  popup.querySelector('.shift-popup__delete')?.addEventListener('click', () => {
    onDelete();
    closePopup();
  });

  // Close on outside click
  setTimeout(() => {
    document.addEventListener('click', outsideClickHandler);
  }, 50);
}

function outsideClickHandler(e) {
  if (activePopup && !activePopup.contains(e.target)) {
    closePopup();
  }
}

export function closePopup() {
  if (activePopup) {
    activePopup.remove();
    activePopup = null;
    document.removeEventListener('click', outsideClickHandler);
  }
}
