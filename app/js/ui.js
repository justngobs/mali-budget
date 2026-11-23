// Small UI toolkit: escaping, icons, sheets (dialogs), toasts, confirm.

export function esc(v) {
  return String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

const path = (d) => `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">${d}</svg>`;

export const icon = {
  home: path('<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V20h14V9.5"/><path d="M10 20v-6h4v6"/>'),
  list: path('<path d="M8 6h13M8 12h13M8 18h13"/><circle cx="3.5" cy="6" r="1"/><circle cx="3.5" cy="12" r="1"/><circle cx="3.5" cy="18" r="1"/>'),
  wallet: path('<path d="M19 7V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-3"/><path d="M21 9h-5a3 3 0 0 0 0 6h5V9Z"/><circle cx="16" cy="12" r=".6"/>'),
  repeat: path('<path d="M17 2l4 4-4 4"/><path d="M3 11V9a3 3 0 0 1 3-3h15"/><path d="M7 22l-4-4 4-4"/><path d="M21 13v2a3 3 0 0 1-3 3H3"/>'),
  target: path('<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.2"/>'),
  settings: path('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z"/>'),
  plus: path('<path d="M12 5v14M5 12h14"/>'),
  chevronLeft: path('<path d="m15 18-6-6 6-6"/>'),
  chevronRight: path('<path d="m9 18 6-6-6-6"/>'),
  chevronDown: path('<path d="m6 9 6 6 6-6"/>'),
  x: path('<path d="M18 6 6 18M6 6l12 12"/>'),
  check: path('<path d="M20 6 9 17l-5-5"/>'),
  search: path('<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>'),
  download: path('<path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M5 21h14"/>'),
  upload: path('<path d="M12 21V9"/><path d="m7 14 5-5 5 5"/><path d="M5 3h14"/>'),
  trash: path('<path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/>'),
  edit: path('<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 1 1 3 3L7 19l-4 1 1-4 12.5-12.5Z"/>'),
  sun: path('<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>'),
  moon: path('<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z"/>'),
  more: path('<circle cx="5" cy="12" r="1.2"/><circle cx="12" cy="12" r="1.2"/><circle cx="19" cy="12" r="1.2"/>'),
  lock: path('<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>'),
  calendar: path('<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>'),
  arrowUp: path('<path d="M12 19V5M5 12l7-7 7 7"/>'),
  arrowDown: path('<path d="M12 5v14M19 12l-7 7-7-7"/>'),
  alert: path('<path d="M12 9v4M12 17h.01"/><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"/>'),
  info: path('<circle cx="12" cy="12" r="9"/><path d="M12 16v-4M12 8h.01"/>'),
  table: path('<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 10h18M3 15h18M9 4v16"/>'),
  chart: path('<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>'),
  copy: path('<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1"/>'),
  pause: path('<path d="M9 5v14M15 5v14"/>'),
  play: path('<path d="m7 4 13 8-13 8V4Z"/>'),
  file: path('<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9l-6-6Z"/><path d="M14 3v6h6"/>'),
  shield: path('<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z"/><path d="m9 12 2 2 4-4"/>'),
  install: path('<rect x="5" y="2" width="14" height="20" rx="3"/><path d="M12 7v7M9 11l3 3 3-3M10 18h4"/>'),
  sparkle: path('<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6"/>'),
};

// ---------------------------------------------------------------- toasts

export function toast(message, { action = null, timeout = 4200, tone = 'default' } = {}) {
  const host = document.getElementById('toasts');
  // Keep at most two on screen so they never pile up over buttons.
  const live = [...host.querySelectorAll('.toast:not(.leaving)')];
  live.slice(0, Math.max(0, live.length - 1)).forEach((t) => {
    t.classList.add('leaving');
    setTimeout(() => t.remove(), 220);
  });
  const el = document.createElement('div');
  el.className = `toast toast-${tone}`;
  const text = document.createElement('span');
  text.textContent = message;
  el.appendChild(text);
  let timer;
  const close = () => {
    clearTimeout(timer);
    el.classList.add('leaving');
    setTimeout(() => el.remove(), 220);
  };
  if (action) {
    const b = document.createElement('button');
    b.className = 'toast-action';
    b.type = 'button';
    b.textContent = action.label;
    b.addEventListener('click', () => {
      action.fn();
      close();
    });
    el.appendChild(b);
  }
  host.appendChild(el);
  requestAnimationFrame(() => el.classList.add('shown'));
  timer = setTimeout(close, timeout);
  return close;
}

// ---------------------------------------------------------------- sheets

let openCount = 0;

/**
 * Opens a sheet (a bottom sheet on phones, a centred dialog on larger screens).
 * body is trusted HTML built with esc(). Returns { el, close }.
 */
export function openSheet({ title, body, footer = '', wide = false, onClose = null, className = '' }) {
  const lastFocus = document.activeElement;
  const backdrop = document.createElement('div');
  backdrop.className = 'sheet-backdrop';
  backdrop.innerHTML = `
    <div class="sheet ${wide ? 'sheet-wide' : ''} ${className}" role="dialog" aria-modal="true" aria-labelledby="sheet-title-${++openCount}">
      <div class="sheet-grip" aria-hidden="true"></div>
      <header class="sheet-head">
        <h2 id="sheet-title-${openCount}">${esc(title)}</h2>
        <button type="button" class="icon-btn" data-close aria-label="Close">${icon.x}</button>
      </header>
      <div class="sheet-body">${body}</div>
      ${footer ? `<footer class="sheet-foot">${footer}</footer>` : ''}
    </div>`;
  document.body.appendChild(backdrop);
  document.body.classList.add('has-sheet');
  const sheet = backdrop.querySelector('.sheet');
  requestAnimationFrame(() => backdrop.classList.add('open'));

  let closed = false;
  function close(result) {
    if (closed) return;
    closed = true;
    backdrop.classList.remove('open');
    document.removeEventListener('keydown', onKey, true);
    setTimeout(() => {
      backdrop.remove();
      if (!document.querySelector('.sheet-backdrop')) document.body.classList.remove('has-sheet');
      if (lastFocus && lastFocus.focus && document.contains(lastFocus)) lastFocus.focus();
    }, 200);
    if (onClose) onClose(result);
  }
  function onKey(e) {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      close();
    } else if (e.key === 'Tab') {
      const items = $$('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])', sheet).filter((n) => !n.disabled && n.offsetParent !== null);
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  }
  document.addEventListener('keydown', onKey, true);
  backdrop.addEventListener('pointerdown', (e) => {
    if (e.target === backdrop) close();
  });
  $$('[data-close]', backdrop).forEach((b) => b.addEventListener('click', () => close()));
  // Focus straight away so fast typing never lands on the page behind.
  const auto = sheet.querySelector('[autofocus]') || sheet.querySelector('input, select, textarea, button:not([data-close])');
  if (auto) auto.focus({ preventScroll: true });
  return { el: sheet, close };
}

export function confirmDialog(message, { title = 'Are you sure?', confirmLabel = 'Delete', danger = true, detail = '' } = {}) {
  return new Promise((resolve) => {
    let answered = false;
    const { el, close } = openSheet({
      title,
      body: `<p class="confirm-text">${esc(message)}</p>${detail ? `<p class="muted small">${esc(detail)}</p>` : ''}`,
      footer: `<button type="button" class="btn btn-ghost" data-close>Cancel</button>
               <button type="button" class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-ok>${esc(confirmLabel)}</button>`,
      onClose: () => {
        if (!answered) resolve(false);
      },
    });
    el.querySelector('[data-ok]').addEventListener('click', () => {
      answered = true;
      resolve(true);
      close();
    });
    setTimeout(() => el.querySelector('[data-ok]').focus(), 80);
  });
}

// ---------------------------------------------------------------- emoji picker

export const EMOJIS = [
  '💼', '💰', '💵', '🪙', '🏦', '📈', '🛠️', '🎁', '🏠', '🏡', '🔑', '🛒', '🍞', '🥩', '🍎', '🍔', '🍕', '🍗', '☕', '🍺',
  '🚗', '⛽', '🚕', '🚌', '🚆', '✈️', '💡', '💧', '🔥', '📱', '📶', '💻', '📺', '🎬', '🎵', '🎮', '📚', '🎓', '🏫', '👶',
  '👪', '❤️', '🙏', '⛪', '🩺', '💊', '🦷', '🛡️', '💳', '🧾', '📄', '🏋️', '⚽', '👕', '👟', '💇', '💄', '🐶', '🌱', '🧹',
  '🎉', '🎂', '🎄', '🏖️', '🧳', '🚲', '🔧', '🪑', '🧺', '🚿', '🎯', '🌍', '🏥', '⚖️', '🗂️', '📦', '🛍️', '💍', '🚨', '🏷️',
];

export function emojiPickerHtml(selected, name = 'emoji') {
  return `<div class="emoji-grid" role="radiogroup" aria-label="Icon">${EMOJIS.map(
    (e) => `<label class="emoji-opt"><input type="radio" name="${name}" value="${e}" ${e === selected ? 'checked' : ''}><span>${e}</span></label>`
  ).join('')}</div>`;
}

// ---------------------------------------------------------------- files

export function download(filename, content, type = 'text/plain') {
  const blob = content instanceof Blob ? content : new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function pickFile(accept) {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.addEventListener('change', () => resolve(input.files && input.files[0] ? input.files[0] : null));
    input.click();
  });
}

// ---------------------------------------------------------------- focus keeping

/** Remembers which field had focus so a redraw does not kick you out of it. */
export function captureFocus() {
  const a = document.activeElement;
  if (!a || !a.dataset || !a.dataset.fkey) return null;
  return { key: a.dataset.fkey, start: a.selectionStart, end: a.selectionEnd };
}

export function restoreFocus(saved) {
  if (!saved) return;
  const el = document.querySelector(`[data-fkey="${CSS.escape(saved.key)}"]`);
  if (!el) return;
  el.focus({ preventScroll: true });
  try {
    if (saved.start != null) el.setSelectionRange(saved.start, saved.end);
  } catch {}
}
