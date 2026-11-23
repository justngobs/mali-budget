// Every change to your budget goes through here, so saving and undo work the same everywhere.
import { store } from './store.js';
import { toast } from './ui.js';
import { uid, ensureOwnPlan, refreshRule, materializeThrough, newGoal, currentPeriod, shiftPeriod, planFor } from './model.js';
import { todayIso } from './format.js';

const clone = (o) => JSON.parse(JSON.stringify(o));

/** Runs a change and offers Undo in a toast. */
function withUndo(label, fn) {
  const before = clone(store.state);
  store.update(fn, 'change');
  toast(label, { action: { label: 'Undo', fn: () => store.replace(before, { reason: 'undo' }) } });
}

// ---------------------------------------------------------------- transactions

export function saveTransaction(fields, existingId = null) {
  store.update((s) => {
    if (existingId) {
      const t = s.transactions.find((x) => x.id === existingId);
      if (!t) return;
      const changed = t.amount !== fields.amount || t.date !== fields.date || t.categoryId !== fields.categoryId || t.goalId !== fields.goalId;
      Object.assign(t, fields, { updatedAt: new Date().toISOString() });
      if (t.recurringId && changed) t.edited = true;
    } else {
      s.transactions.push({ id: uid(), createdAt: new Date().toISOString(), ...fields });
    }
  }, 'transaction');
}

export function deleteTransaction(id) {
  withUndo('Transaction deleted', (s) => {
    const t = s.transactions.find((x) => x.id === id);
    if (!t) return;
    if (t.recurringId) {
      const rule = s.recurring.find((r) => r.id === t.recurringId);
      if (rule) rule.skips = [...new Set([...(rule.skips || []), t.date])];
    }
    s.transactions = s.transactions.filter((x) => x.id !== id);
  });
}

export function deleteTransactions(ids) {
  const set = new Set(ids);
  withUndo(`${ids.length} transaction${ids.length === 1 ? '' : 's'} deleted`, (s) => {
    for (const t of s.transactions) {
      if (!set.has(t.id) || !t.recurringId) continue;
      const rule = s.recurring.find((r) => r.id === t.recurringId);
      if (rule) rule.skips = [...new Set([...(rule.skips || []), t.date])];
    }
    s.transactions = s.transactions.filter((x) => !set.has(x.id));
  });
}

// ---------------------------------------------------------------- plan & categories

export function setPlanned(periodKey, categoryId, cents) {
  store.update((s) => {
    const plan = ensureOwnPlan(s, periodKey);
    plan[categoryId] = Math.max(0, Math.round(cents) || 0);
  }, 'plan');
}

export function copyPlanFromPrevious(periodKey) {
  store.update((s) => {
    const prev = planFor(s, shiftPeriod(periodKey, -1));
    if (!s.months[periodKey]) s.months[periodKey] = {};
    s.months[periodKey].plan = { ...prev };
  }, 'plan');
  toast('Copied last month’s plan');
}

export function saveCategory(fields, existingId = null, periodKey = null) {
  let id = existingId;
  store.update((s) => {
    if (existingId) {
      const c = s.categories.find((x) => x.id === existingId);
      if (c) Object.assign(c, { name: fields.name, emoji: fields.emoji });
      if (periodKey && fields.planned != null) ensureOwnPlan(s, periodKey)[existingId] = fields.planned;
    } else {
      id = uid();
      const maxOrder = s.categories.reduce((m, c) => Math.max(m, c.order ?? 0), 0);
      s.categories.push({ id, type: fields.type, name: fields.name, emoji: fields.emoji || '🏷️', order: maxOrder + 1, archived: false });
      if (periodKey) {
        // New categories join this month's plan and every later month that has its own plan.
        ensureOwnPlan(s, periodKey)[id] = fields.planned || 0;
        for (const k of Object.keys(s.months)) if (k > periodKey && s.months[k].plan) s.months[k].plan[id] = fields.planned || 0;
      }
    }
  }, 'category');
  return id;
}

export function archiveCategory(id) {
  withUndo('Category hidden. Its history is kept.', (s) => {
    const c = s.categories.find((x) => x.id === id);
    if (c) c.archived = true;
    const key = currentPeriod(s);
    for (const k of Object.keys(s.months)) if (k >= key && s.months[k].plan) delete s.months[k].plan[id];
  });
}

export function deleteCategory(id, moveToId) {
  withUndo('Category deleted', (s) => {
    for (const t of s.transactions) if (t.categoryId === id) t.categoryId = moveToId;
    for (const r of s.recurring) if (r.categoryId === id) r.categoryId = moveToId;
    for (const k of Object.keys(s.months)) {
      const p = s.months[k].plan;
      if (!p || p[id] == null) continue;
      if (moveToId) p[moveToId] = (p[moveToId] || 0) + p[id];
      delete p[id];
    }
    s.categories = s.categories.filter((c) => c.id !== id);
  });
}

export function moveCategory(id, dir) {
  store.update((s) => {
    const cat = s.categories.find((c) => c.id === id);
    if (!cat) return;
    const list = s.categories.filter((c) => c.type === cat.type && !c.archived).sort((a, b) => a.order - b.order);
    const i = list.findIndex((c) => c.id === id);
    const j = i + dir;
    if (j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
    list.forEach((c, n) => (c.order = n + (cat.type === 'income' ? 0 : 100)));
  }, 'category');
}

// ---------------------------------------------------------------- recurring

export function saveRecurring(fields, existingId = null) {
  store.update((s) => {
    let id = existingId;
    if (existingId) {
      const r = s.recurring.find((x) => x.id === existingId);
      if (!r) return;
      Object.assign(r, fields);
    } else {
      id = uid();
      s.recurring.push({ id, active: true, skips: [], generatedThrough: null, createdAt: new Date().toISOString(), ...fields });
    }
    refreshRule(s, id);
  }, 'recurring');
}

export function toggleRecurring(id) {
  store.update((s) => {
    const r = s.recurring.find((x) => x.id === id);
    if (!r) return;
    r.active = !r.active;
    refreshRule(s, id);
  }, 'recurring');
}

export function deleteRecurring(id, { removeUpcoming = true } = {}) {
  const today = todayIso();
  withUndo('Recurring item deleted', (s) => {
    s.recurring = s.recurring.filter((r) => r.id !== id);
    if (removeUpcoming) s.transactions = s.transactions.filter((t) => !(t.recurringId === id && t.date > today));
    for (const t of s.transactions) if (t.recurringId === id) t.recurringId = null;
  });
}

/** Viewing a future month fills in its recurring items so they show as upcoming. */
export function prepareMonth(periodKey) {
  const s = store.state;
  if (!s || store.ephemeral) {
    if (s) materializeThrough(s, periodKey);
    return;
  }
  const before = s.transactions.length;
  materializeThrough(s, periodKey);
  if (s.transactions.length !== before) store.update(() => {}, 'materialize');
}

// ---------------------------------------------------------------- goals

export function saveGoal(fields, existingId = null) {
  store.update((s) => {
    if (existingId) {
      const g = s.goals.find((x) => x.id === existingId);
      if (g) Object.assign(g, fields);
    } else {
      s.goals.push(newGoal(fields, currentPeriod(s)));
    }
  }, 'goal');
}

export function deleteGoal(id) {
  withUndo('Goal deleted', (s) => {
    s.goals = s.goals.filter((g) => g.id !== id);
    s.transactions = s.transactions.filter((t) => !(t.type === 'savings' && t.goalId === id));
    s.recurring = s.recurring.filter((r) => !(r.type === 'savings' && r.goalId === id));
  });
}

export function setSetting(key, value) {
  store.update((s) => {
    s.settings[key] = value;
  }, 'settings');
}
