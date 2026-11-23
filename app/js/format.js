// Money and date helpers. Money is always whole cents (integers) inside the app.

const NBSP = ' ';
const NNBSP = ' ';
const MINUS = '−';

let numberStyle = 'space-dot';

export const NUMBER_STYLES = {
  'space-dot': 'R 12 345.67',
  'space-comma': 'R 12 345,67',
  'comma-dot': 'R12,345.67',
};

export function setNumberStyle(style) {
  if (NUMBER_STYLES[style]) numberStyle = style;
}

function group(whole) {
  const sep = numberStyle === 'comma-dot' ? ',' : NNBSP;
  return String(whole).replace(/\B(?=(\d{3})+(?!\d))/g, sep);
}

/**
 * Format cents as rand.
 * opts.cents: show cents (default true). opts.sign: show + for positive values.
 * opts.abs: drop the minus sign.
 */
export function money(cents, opts = {}) {
  const { cents: showCents = true, sign = false, abs = false } = opts;
  const value = Math.round(Number(cents) || 0);
  const neg = value < 0;
  const v = Math.abs(value);
  let body;
  if (showCents) {
    const dec = numberStyle === 'space-comma' ? ',' : '.';
    body = group(Math.floor(v / 100)) + dec + String(v % 100).padStart(2, '0');
  } else {
    body = group(Math.round(v / 100));
  }
  const cur = numberStyle === 'comma-dot' ? 'R' : 'R' + NBSP;
  const prefix = neg && !abs ? MINUS : sign && !neg && value !== 0 ? '+' : '';
  return prefix + cur + body;
}

/** Splits a money string into the rand part and the cents part, for big figures. */
export function moneyParts(cents) {
  const full = money(cents);
  const m = full.match(/^(.*?)([.,]\d{2})$/);
  return m ? { main: m[1], cents: m[2] } : { main: full, cents: '' };
}

/** Compact form for chart axes: R 0, R 500, R 12K, R 1.2M */
export function moneyShort(cents) {
  const r = Math.round(Number(cents) || 0) / 100;
  const a = Math.abs(r);
  const neg = r < 0 ? MINUS : '';
  const cur = numberStyle === 'comma-dot' ? 'R' : 'R' + NBSP;
  const dec = numberStyle === 'space-comma' ? ',' : '.';
  const trim = (n) => n.toFixed(1).replace(/\.0$/, '').replace('.', dec);
  if (a >= 1e6) return `${neg}${cur}${trim(a / 1e6)}M`;
  if (a >= 1e4) return `${neg}${cur}${Math.round(a / 1e3)}K`;
  if (a >= 1e3) return `${neg}${cur}${trim(a / 1e3)}K`;
  return `${neg}${cur}${Math.round(a)}`;
}

/** Plain number for CSV files: 1234.56 */
export function plainAmount(cents) {
  const v = Math.round(Number(cents) || 0);
  const neg = v < 0 ? '-' : '';
  const a = Math.abs(v);
  return `${neg}${Math.floor(a / 100)}.${String(a % 100).padStart(2, '0')}`;
}

/**
 * Reads what people type or what a spreadsheet exports and returns cents (or NaN).
 * Accepts R 1 234.56, 1234,56, R1,234.56, (500.00), -500, 1.234,56 and 1234.
 */
export function parseMoney(input) {
  if (typeof input === 'number') return Number.isFinite(input) ? Math.round(input * 100) : NaN;
  let s = String(input ?? '').trim();
  if (!s) return NaN;
  let neg = false;
  if (/^\(.*\)$/.test(s)) {
    neg = true;
    s = s.slice(1, -1);
  }
  s = s.replace(/^ZAR/i, '').replace(/[R\s  ']/gi, '');
  if (/^[-−]/.test(s)) {
    neg = !neg;
    s = s.slice(1);
  } else if (/^\+/.test(s)) {
    s = s.slice(1);
  }
  if (/-$/.test(s)) {
    neg = !neg;
    s = s.slice(0, -1);
  }
  s = s.replace(/^R/i, '');
  if (!s) return NaN;
  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');
  if (lastComma > -1 && lastDot > -1) {
    s = lastComma > lastDot ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  } else if (lastComma > -1) {
    const commas = (s.match(/,/g) || []).length;
    const after = s.length - lastComma - 1;
    s = commas === 1 && after > 0 && after <= 2 ? s.replace(',', '.') : s.replace(/,/g, '');
  } else if (lastDot > -1) {
    const dots = (s.match(/\./g) || []).length;
    if (dots > 1) s = s.replace(/\./g, '');
  }
  if (!/^(\d+\.?\d*|\.\d+)$/.test(s)) return NaN;
  const cents = Math.round(parseFloat(s) * 100);
  return neg ? -cents : cents;
}

/** Value for an editable amount box: 1234.5 → "1234.50" in the chosen decimal style */
export function amountInput(cents) {
  if (cents == null || cents === '') return '';
  const s = plainAmount(cents);
  return numberStyle === 'space-comma' ? s.replace('.', ',') : s;
}

// ---------- dates (local time, ISO strings YYYY-MM-DD) ----------

export const pad = (n) => String(n).padStart(2, '0');

export function iso(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

let todayOverride = null;
/** For tests and screenshots: pretend today is a given date. */
export function setToday(isoDate) {
  todayOverride = isoDate || null;
}

export function todayIso() {
  return todayOverride || iso(new Date());
}

export function parseIso(s) {
  const [y, m, d] = String(s).split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function isIsoDate(s) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(s))) return false;
  const d = parseIso(s);
  return iso(d) === s;
}

export function addDays(s, n) {
  const d = parseIso(s);
  d.setDate(d.getDate() + n);
  return iso(d);
}

export function daysBetween(a, b) {
  return Math.round((parseIso(b) - parseIso(a)) / 86400000);
}

export function daysInMonth(y, m) {
  return new Date(y, m, 0).getDate();
}

export const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** '2026-11' → 'November 2026' (or 'Nov 2026' / 'Nov' with options) */
export function monthLabel(key, { short = false, year = true } = {}) {
  const [y, m] = key.split('-').map(Number);
  const name = (short ? MONTHS_SHORT : MONTHS)[m - 1];
  return year ? `${name} ${y}` : name;
}

/** '2026-11-23' → '23 Nov' (adds the year when it is not this year, or when asked) */
export function dateLabel(s, { weekday = false, year = 'auto' } = {}) {
  const d = parseIso(s);
  const showYear = year === true || (year === 'auto' && d.getFullYear() !== parseIso(todayIso()).getFullYear());
  let out = `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}`;
  if (showYear) out += ` ${d.getFullYear()}`;
  if (weekday) out = `${DAYS_SHORT[d.getDay()]} ${out}`;
  return out;
}

/** Friendly day heading: Today, Yesterday, Tomorrow, or 'Mon 23 Nov' */
export function dayHeading(s) {
  const t = todayIso();
  if (s === t) return 'Today';
  if (s === addDays(t, -1)) return 'Yesterday';
  if (s === addDays(t, 1)) return 'Tomorrow';
  return dateLabel(s, { weekday: true });
}

export function ordinal(n) {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

export function relativeTime(isoString) {
  if (!isoString) return 'never';
  const diff = (Date.now() - new Date(isoString).getTime()) / 1000;
  if (diff < 10) return 'just now';
  if (diff < 60) return `${Math.round(diff)} s ago`;
  if (diff < 3600) return `${Math.round(diff / 60)} min ago`;
  if (diff < 86400) return `${Math.round(diff / 3600)} h ago`;
  const days = Math.round(diff / 86400);
  return days === 1 ? 'yesterday' : `${days} days ago`;
}

export function percent(part, whole, digits = 0) {
  if (!whole) return '0%';
  return `${((part / whole) * 100).toFixed(digits)}%`;
}
