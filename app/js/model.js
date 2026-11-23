// The budget maths. Pure functions over the saved state, so they are easy to test.
import { pad, addDays, daysBetween, daysInMonth, todayIso, parseIso, iso } from './format.js';

export const SCHEMA_VERSION = 1;

export function uid() {
  if (globalThis.crypto && typeof crypto.randomUUID === 'function') return crypto.randomUUID().slice(0, 13);
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

// ---------------------------------------------------------------- periods
// A "period" is one budget month, keyed 'YYYY-MM'. With payday budgeting
// (startDay > 1) a period runs from payday to the day before the next payday.
// Paydays after the 15th name the period after the following month
// (25 Nov to 24 Dec is "December"); earlier paydays use the month they start in.

function startDate(y, m, startDay) {
  return `${y}-${pad(m)}-${pad(Math.min(startDay, daysInMonth(y, m)))}`;
}

export function shiftPeriod(key, n) {
  const [y, m] = key.split('-').map(Number);
  const total = y * 12 + (m - 1) + n;
  return `${Math.floor(total / 12)}-${pad((total % 12) + 1)}`;
}

export function periodOf(dateIso, startDay = 1) {
  const [y, m] = dateIso.split('-').map(Number);
  let key = `${y}-${pad(m)}`;
  if (startDay <= 1) return key;
  if (dateIso < startDate(y, m, startDay)) key = shiftPeriod(key, -1);
  return startDay > 15 ? shiftPeriod(key, 1) : key;
}

export function periodRange(key, startDay = 1) {
  const [y, m] = key.split('-').map(Number);
  if (startDay <= 1) return { start: `${key}-01`, end: `${key}-${pad(daysInMonth(y, m))}` };
  const startKey = startDay > 15 ? shiftPeriod(key, -1) : key;
  const [sy, sm] = startKey.split('-').map(Number);
  const [ny, nm] = shiftPeriod(startKey, 1).split('-').map(Number);
  return { start: startDate(sy, sm, startDay), end: addDays(startDate(ny, nm, startDay), -1) };
}

export function periodDays(key, startDay = 1) {
  const { start, end } = periodRange(key, startDay);
  return daysBetween(start, end) + 1;
}

export function currentPeriod(state, today = todayIso()) {
  return periodOf(today, startDayOf(state));
}

export function startDayOf(state) {
  return Number(state?.settings?.startDay) || 1;
}

/** Where a period sits relative to today: 'past' | 'current' | 'future' */
export function periodStatus(key, startDay, today = todayIso()) {
  const { start, end } = periodRange(key, startDay);
  if (today > end) return 'past';
  if (today < start) return 'future';
  return 'current';
}

// ---------------------------------------------------------------- state

export function emptyState() {
  return {
    version: SCHEMA_VERSION,
    savedAt: null,
    createdAt: new Date().toISOString(),
    demo: false,
    settings: { theme: 'system', numberStyle: 'space-dot', startDay: 1, lastBackupAt: null },
    categories: [],
    months: {},
    transactions: [],
    recurring: [],
    goals: [],
  };
}

/** Brings older or hand-edited files up to the current shape. */
export function migrate(raw) {
  const s = { ...emptyState(), ...(raw || {}) };
  s.settings = { ...emptyState().settings, ...(raw?.settings || {}) };
  for (const k of ['categories', 'transactions', 'recurring', 'goals']) if (!Array.isArray(s[k])) s[k] = [];
  if (!s.months || typeof s.months !== 'object') s.months = {};
  s.transactions = s.transactions
    .filter((t) => t && typeof t.date === 'string' && Number.isFinite(Number(t.amount)))
    .map((t) => ({ ...t, amount: Math.round(Number(t.amount)), type: ['income', 'expense', 'savings'].includes(t.type) ? t.type : 'expense' }));
  s.recurring = s.recurring.map((r) => ({ frequency: 'monthly', skips: [], active: true, ...r }));
  s.categories = s.categories.map((c, i) => ({ order: i, archived: false, emoji: '🏷️', ...c }));
  s.version = SCHEMA_VERSION;
  return s;
}

export function category(state, id) {
  return state.categories.find((c) => c.id === id) || null;
}

export function goal(state, id) {
  return state.goals.find((g) => g.id === id) || null;
}

export function activeCategories(state, type) {
  return state.categories
    .filter((c) => !c.archived && (!type || c.type === type))
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

// ---------------------------------------------------------------- plans
// Each month stores its own plan once you change it. A month with no plan of
// its own uses the latest earlier plan (so a plan carries forward like copying
// last month's sheet), or the earliest later plan when there is nothing before.

export function planFor(state, key) {
  if (state.months[key]?.plan) return state.months[key].plan;
  const keys = Object.keys(state.months).filter((k) => state.months[k]?.plan).sort();
  const before = keys.filter((k) => k < key);
  if (before.length) return state.months[before[before.length - 1]].plan;
  if (keys.length) return state.months[keys[0]].plan;
  return {};
}

export function hasOwnPlan(state, key) {
  return Boolean(state.months[key]?.plan);
}

/** Make sure the month has its own copy of the plan before editing it. */
export function ensureOwnPlan(state, key) {
  if (!state.months[key]) state.months[key] = {};
  if (!state.months[key].plan) state.months[key].plan = { ...planFor(state, key) };
  return state.months[key].plan;
}

export function plannedSavings(state, key) {
  return state.goals
    .filter((g) => !g.archived && (!g.createdPeriod || g.createdPeriod <= key))
    .reduce((sum, g) => sum + (Number(g.monthly) || 0), 0);
}

// ---------------------------------------------------------------- summaries

/**
 * How a spending category stands against its plan:
 * 'over' (went over), 'full' (exactly on plan, e.g. a bill paid in full),
 * 'near' (85% or more used), 'ok', or 'unplanned' (spent with no budget).
 */
export function budgetState(used, planned) {
  if (planned <= 0) return used > 0 ? 'unplanned' : 'ok';
  if (used > planned) return 'over';
  if (used === planned) return 'full';
  return used / planned >= 0.85 ? 'near' : 'ok';
}

export function txInRange(state, start, end) {
  return state.transactions.filter((t) => t.date >= start && t.date <= end);
}

/**
 * Everything the screens need about one budget month.
 * "Actual" counts money up to today; anything dated later this month is "upcoming".
 */
export function summarize(state, key, today = todayIso()) {
  const sd = startDayOf(state);
  const { start, end } = periodRange(key, sd);
  const status = periodStatus(key, sd, today);
  const plan = planFor(state, key);
  const txs = txInRange(state, start, end);

  const rows = new Map();
  const rowFor = (cat, fallbackType) => {
    const id = cat ? cat.id : `none-${fallbackType}`;
    if (!rows.has(id)) {
      rows.set(id, {
        id,
        category: cat || { id, name: 'Uncategorised', emoji: '❔', type: fallbackType },
        type: cat ? cat.type : fallbackType,
        planned: cat ? Number(plan[cat.id]) || 0 : 0,
        actual: 0,
        upcoming: 0,
        count: 0,
      });
    }
    return rows.get(id);
  };
  for (const c of state.categories) {
    if (!c.archived || plan[c.id]) rowFor(c);
  }

  const savingsByGoal = new Map();
  let savingsActual = 0;
  let savingsUpcoming = 0;

  for (const t of txs) {
    const future = t.date > today;
    if (t.type === 'savings') {
      if (future) savingsUpcoming += t.amount;
      else savingsActual += t.amount;
      const g = savingsByGoal.get(t.goalId) || { actual: 0, upcoming: 0 };
      g[future ? 'upcoming' : 'actual'] += t.amount;
      savingsByGoal.set(t.goalId, g);
      continue;
    }
    const cat = category(state, t.categoryId);
    const row = rowFor(cat && cat.type === t.type ? cat : null, t.type);
    if (future) row.upcoming += t.amount;
    else row.actual += t.amount;
    row.count += 1;
  }

  const all = [...rows.values()];
  const incomeRows = all.filter((r) => r.type === 'income');
  const expenseRows = all.filter((r) => r.type === 'expense');
  const sum = (list, f) => list.reduce((a, r) => a + f(r), 0);

  const income = {
    planned: sum(incomeRows, (r) => r.planned),
    actual: sum(incomeRows, (r) => r.actual),
    upcoming: sum(incomeRows, (r) => r.upcoming),
  };
  income.expected = sum(incomeRows, (r) => Math.max(r.planned, r.actual + r.upcoming));

  const expense = {
    planned: sum(expenseRows, (r) => r.planned),
    actual: sum(expenseRows, (r) => r.actual),
    upcoming: sum(expenseRows, (r) => r.upcoming),
  };

  const savings = {
    planned: plannedSavings(state, key),
    actual: savingsActual,
    upcoming: savingsUpcoming,
    byGoal: savingsByGoal,
  };
  savings.committed = Math.max(savings.planned, savings.actual + savings.upcoming);

  const days = daysBetween(start, end) + 1;
  const daysLeft = status === 'current' ? daysBetween(today, end) + 1 : status === 'future' ? days : 0;
  const daysGone = days - daysLeft;

  // Safe to spend: what is left of this month's expected income after what you
  // have spent, the bills still to come, and what you are putting into goals.
  const savingsStillToSet = Math.max(0, savings.committed - savings.actual);
  const safeToSpend = income.expected - expense.actual - expense.upcoming - savings.committed;
  const leftover = income.actual - expense.actual - savings.actual;
  const plannedLeftover = income.planned - expense.planned - savings.planned;
  const budgetLeft = expense.planned - expense.actual - expense.upcoming;
  // If the rest of each budget gets spent as planned, this is what remains at month end.
  const forecast = income.expected - sum(expenseRows, (r) => Math.max(r.planned, r.actual + r.upcoming)) - savings.committed;

  expenseRows.sort((a, b) => (a.category.order ?? 999) - (b.category.order ?? 999));
  incomeRows.sort((a, b) => (a.category.order ?? 999) - (b.category.order ?? 999));

  return {
    key,
    start,
    end,
    status,
    today,
    days,
    daysLeft,
    daysGone,
    plan,
    incomeRows,
    expenseRows,
    income,
    expense,
    savings,
    savingsStillToSet,
    safeToSpend,
    perDay: daysLeft > 0 ? Math.floor(safeToSpend / daysLeft) : 0,
    leftover,
    plannedLeftover,
    budgetLeft,
    forecast,
    transactions: txs,
  };
}

/** Spending to date, day by day, for the burn-up chart. */
export function dailySpending(state, key, today = todayIso()) {
  const sd = startDayOf(state);
  const { start, end } = periodRange(key, sd);
  const byDay = new Map();
  for (const t of txInRange(state, start, end)) {
    if (t.type !== 'expense') continue;
    byDay.set(t.date, (byDay.get(t.date) || 0) + t.amount);
  }
  const out = [];
  let running = 0;
  for (let d = start; d <= end; d = addDays(d, 1)) {
    running += byDay.get(d) || 0;
    out.push({ date: d, day: byDay.get(d) || 0, total: running, future: d > today });
  }
  return out;
}

/** Income, spending and savings for the `count` months ending at `key`. */
export function trend(state, key, count = 12, today = todayIso()) {
  const sd = startDayOf(state);
  const out = [];
  for (let i = count - 1; i >= 0; i--) {
    const k = shiftPeriod(key, -i);
    const { start, end } = periodRange(k, sd);
    let income = 0;
    let expense = 0;
    let savings = 0;
    for (const t of txInRange(state, start, end)) {
      if (t.date > today) continue;
      if (t.type === 'income') income += t.amount;
      else if (t.type === 'expense') expense += t.amount;
      else savings += t.amount;
    }
    out.push({ key: k, income, expense, savings, net: income - expense - savings });
  }
  return out;
}

/** Earliest month with any data, so charts don't show empty years. */
export function firstPeriodWithData(state) {
  if (!state.transactions.length) return null;
  let min = state.transactions[0].date;
  for (const t of state.transactions) if (t.date < min) min = t.date;
  return periodOf(min, startDayOf(state));
}

// ---------------------------------------------------------------- recurring

/** Dates a recurring rule falls on between start and end (inclusive). */
export function occurrences(rule, start, end) {
  const out = [];
  if (!rule.active) return out;
  const anchor = rule.startDate;
  const from = anchor > start ? anchor : start;
  const to = rule.endDate && rule.endDate < end ? rule.endDate : end;
  if (from > to) return out;
  const anchorDay = parseIso(anchor).getDate();

  if (rule.frequency === 'weekly' || rule.frequency === 'fortnightly') {
    const step = rule.frequency === 'weekly' ? 7 : 14;
    let offset = daysBetween(anchor, from);
    let first = Math.ceil(offset / step) * step;
    for (let d = addDays(anchor, first); d <= to; d = addDays(d, step)) out.push(d);
    return out;
  }

  // monthly / yearly: walk the calendar months that overlap the range
  const [fy, fm] = from.split('-').map(Number);
  const [ty, tm] = to.split('-').map(Number);
  const anchorMonth = parseIso(anchor).getMonth() + 1;
  for (let y = fy, m = fm; y < ty || (y === ty && m <= tm); m === 12 ? (y++, (m = 1)) : m++) {
    if (rule.frequency === 'yearly' && m !== anchorMonth) continue;
    const d = `${y}-${pad(m)}-${pad(Math.min(anchorDay, daysInMonth(y, m)))}`;
    if (d >= from && d <= to) out.push(d);
  }
  return out;
}

function txFromRule(rule, date) {
  return {
    id: uid(),
    date,
    type: rule.type,
    amount: rule.amount,
    categoryId: rule.type === 'savings' ? null : rule.categoryId,
    goalId: rule.type === 'savings' ? rule.goalId : null,
    note: rule.name,
    recurringId: rule.id,
    createdAt: new Date().toISOString(),
  };
}

/**
 * Adds the transactions one recurring item creates up to `until`, starting after
 * the last date it already covered. Deleted ones (rule.skips) stay deleted.
 */
export function materializeRule(state, rule, until) {
  if (!rule.active) return 0;
  const from = rule.generatedThrough ? addDays(rule.generatedThrough, 1) : rule.startDate;
  if (from > until) return 0;
  const have = new Set(state.transactions.filter((t) => t.recurringId === rule.id).map((t) => t.date));
  const skips = new Set(rule.skips || []);
  let added = 0;
  for (const d of occurrences(rule, from, until)) {
    if (have.has(d) || skips.has(d)) continue;
    state.transactions.push(txFromRule(rule, d));
    added++;
  }
  rule.generatedThrough = until;
  return added;
}

/** Catch every recurring item up to the end of `throughKey` (default: this month). */
export function materializeThrough(state, throughKey, today = todayIso()) {
  const sd = startDayOf(state);
  const cur = periodOf(today, sd);
  const through = throughKey && throughKey > cur ? throughKey : cur;
  const until = periodRange(through, sd).end;
  let added = 0;
  for (const rule of state.recurring) added += materializeRule(state, rule, until);
  if (!state.horizon || through > state.horizon) state.horizon = through;
  return added;
}

/**
 * After a rule is created or changed: rebuild its upcoming payments (ones you
 * have not edited by hand). Past payments are left alone. A rule that has never
 * produced a payment starts from its first date, even if that date has passed.
 */
export function refreshRule(state, ruleId, today = todayIso()) {
  const rule = state.recurring.find((r) => r.id === ruleId);
  state.transactions = state.transactions.filter((t) => !(t.recurringId === ruleId && t.date > today && !t.edited));
  if (!rule) return 0;
  const hasAny = state.transactions.some((t) => t.recurringId === ruleId);
  rule.generatedThrough = hasAny ? today : null;
  const sd = startDayOf(state);
  const cur = periodOf(today, sd);
  const horizon = state.horizon && state.horizon > cur ? state.horizon : cur;
  return materializeRule(state, rule, periodRange(horizon, sd).end);
}

export function nextOccurrence(rule, today = todayIso()) {
  const list = occurrences(rule, today, addDays(today, 400));
  return list[0] || null;
}

/** Rough monthly cost of a rule, for the recurring summary. */
export function monthlyEquivalent(rule) {
  const a = Number(rule.amount) || 0;
  switch (rule.frequency) {
    case 'weekly':
      return Math.round((a * 52) / 12);
    case 'fortnightly':
      return Math.round((a * 26) / 12);
    case 'yearly':
      return Math.round(a / 12);
    default:
      return a;
  }
}

// ---------------------------------------------------------------- goals

export function goalSaved(state, g) {
  const today = todayIso();
  let total = Number(g.startingBalance) || 0;
  for (const t of state.transactions) if (t.type === 'savings' && t.goalId === g.id && t.date <= today) total += t.amount;
  return total;
}

export function goalProgress(state, g, today = todayIso()) {
  const saved = goalSaved(state, g);
  const target = Number(g.target) || 0;
  const remaining = Math.max(0, target - saved);
  const pct = target > 0 ? Math.min(1, Math.max(0, saved / target)) : 0;
  let eta = null;
  if (remaining > 0 && g.monthly > 0) {
    const months = Math.ceil(remaining / g.monthly);
    eta = shiftPeriod(today.slice(0, 7), months);
  }
  let neededMonthly = null;
  if (remaining > 0 && g.targetDate) {
    const [ty, tm] = g.targetDate.split('-').map(Number);
    const [cy, cm] = today.split('-').map(Number);
    const months = Math.max(1, (ty - cy) * 12 + (tm - cm));
    neededMonthly = Math.ceil(remaining / months);
  }
  const onTrack = neededMonthly == null || (g.monthly || 0) >= neededMonthly;
  return { saved, target, remaining, pct, eta, neededMonthly, onTrack, done: target > 0 && saved >= target };
}

// ---------------------------------------------------------------- defaults

export const DEFAULT_CATEGORIES = [
  { type: 'income', name: 'Salary', emoji: '💼' },
  { type: 'income', name: 'Side income', emoji: '🛠️' },
  { type: 'income', name: 'Other income', emoji: '🎁' },
  { type: 'expense', name: 'Rent or bond', emoji: '🏠' },
  { type: 'expense', name: 'Groceries', emoji: '🛒' },
  { type: 'expense', name: 'Transport & fuel', emoji: '🚗' },
  { type: 'expense', name: 'Electricity & water', emoji: '💡' },
  { type: 'expense', name: 'Airtime & data', emoji: '📱' },
  { type: 'expense', name: 'Insurance', emoji: '🛡️' },
  { type: 'expense', name: 'Medical aid & health', emoji: '🩺' },
  { type: 'expense', name: 'Debt & accounts', emoji: '💳' },
  { type: 'expense', name: 'Subscriptions', emoji: '📺' },
  { type: 'expense', name: 'Eating out', emoji: '🍔' },
  { type: 'expense', name: 'Family support', emoji: '👪' },
  { type: 'expense', name: 'School & education', emoji: '🎓' },
  { type: 'expense', name: 'Clothing & personal', emoji: '👕' },
  { type: 'expense', name: 'Giving & church', emoji: '🙏' },
  { type: 'expense', name: 'Entertainment', emoji: '🎉' },
  { type: 'expense', name: 'Other', emoji: '🧾' },
];

export function seedCategories(state) {
  state.categories = DEFAULT_CATEGORIES.map((c, i) => ({ id: uid(), order: i, archived: false, ...c }));
  return state;
}

export function newGoal(fields, key) {
  return {
    id: uid(),
    name: fields.name,
    emoji: fields.emoji || '🎯',
    target: fields.target || 0,
    startingBalance: fields.startingBalance || 0,
    monthly: fields.monthly || 0,
    targetDate: fields.targetDate || null,
    createdPeriod: key,
    archived: false,
    createdAt: new Date().toISOString(),
  };
}

export { iso };
