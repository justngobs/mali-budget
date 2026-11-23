// The forms: add or edit a transaction, category, recurring item or goal.
import { store } from './store.js';
import { esc, icon, openSheet, confirmDialog, emojiPickerHtml, toast, $, $$ } from './ui.js';
import { money, parseMoney, amountInput, todayIso, addDays, dateLabel, isIsoDate, monthLabel } from './format.js';
import { activeCategories, category, goal, planFor, periodOf, startDayOf, nextOccurrence } from './model.js';
import * as A from './actions.js';

const TYPE_LABEL = { expense: 'Spending', income: 'Income', savings: 'Savings' };

function seg(name, options, value) {
  return `<div class="seg-control" role="radiogroup">${options
    .map(([v, label]) => `<label><input type="radio" name="${name}" value="${v}" ${v === value ? 'checked' : ''}><span>${esc(label)}</span></label>`)
    .join('')}</div>`;
}

function fieldError(form, name, message) {
  const el = form.querySelector(`[data-error="${name}"]`);
  if (el) {
    el.textContent = message || '';
    el.hidden = !message;
  }
  const box = form.querySelector(`[data-field="${name}"]`);
  if (box) {
    box.classList.toggle('invalid', Boolean(message));
    if (message) {
      box.classList.remove('shake');
      void box.offsetWidth;
      box.classList.add('shake');
    }
  }
}

function recentNotes(s) {
  const counts = new Map();
  for (const t of s.transactions) {
    const n = (t.note || '').trim();
    if (!n) continue;
    const c = counts.get(n) || { n: 0, last: t };
    c.n++;
    if (t.date >= c.last.date) c.last = t;
    counts.set(n, c);
  }
  return [...counts.entries()].sort((a, b) => b[1].n - a[1].n).slice(0, 80);
}

// ---------------------------------------------------------------- transaction

export function openTxEditor({ tx = null, type = null, date = null, categoryId = null, goalId = null } = {}) {
  const s = store.state;
  const editing = Boolean(tx);
  let curType = tx?.type || type || 'expense';
  const notes = recentNotes(s);
  const rule = tx?.recurringId ? s.recurring.find((r) => r.id === tx.recurringId) : null;

  const chipsFor = (t, selected) => {
    if (t === 'savings') {
      const goals = s.goals.filter((g) => !g.archived);
      if (!goals.length) return `<p class="muted small">You have no goals yet. Add one on the Goals page first.</p>`;
      return goals
        .map((g) => `<label class="chip"><input type="radio" name="target" value="${esc(g.id)}" ${g.id === selected ? 'checked' : ''}><span><i>${esc(g.emoji)}</i>${esc(g.name)}</span></label>`)
        .join('');
    }
    return activeCategories(s, t)
      .map((c) => `<label class="chip"><input type="radio" name="target" value="${esc(c.id)}" ${c.id === selected ? 'checked' : ''}><span><i>${esc(c.emoji)}</i>${esc(c.name)}</span></label>`)
      .join('') + `<button type="button" class="chip chip-new" data-new-cat>${icon.plus}<span>New</span></button>`;
  };

  const body = `
    <form class="form tx-form" novalidate>
      ${seg('type', [['expense', 'Spending'], ['income', 'Income'], ['savings', 'To a goal']], curType)}
      <div class="amount-field" data-field="amount">
        <span class="amount-cur">R</span>
        <input name="amount" inputmode="decimal" autocomplete="off" placeholder="0.00" aria-label="Amount in rand"
          value="${tx ? esc(amountInput(tx.amount)) : ''}" autofocus>
      </div>
      <p class="field-error" data-error="amount" hidden></p>
      <div class="field" data-field="target">
        <span class="label" data-target-label>${curType === 'savings' ? 'Goal' : 'Category'}</span>
        <div class="chip-grid" data-chips>${chipsFor(curType, tx ? tx.categoryId || tx.goalId : categoryId || goalId)}</div>
        <p class="field-error" data-error="target" hidden></p>
      </div>
      <div class="row-2">
        <label class="field" data-field="date"><span class="label">Date</span>
          <input type="date" name="date" value="${esc(tx?.date || date || todayIso())}" required>
          <span class="quick-dates"><button type="button" class="link-btn" data-day="0">Today</button><button type="button" class="link-btn" data-day="-1">Yesterday</button></span>
        </label>
        <label class="field"><span class="label">Note</span>
          <input name="note" maxlength="140" placeholder="Where or what (optional)" list="note-list" autocomplete="off" value="${esc(tx?.note || '')}">
          <datalist id="note-list">${notes.map(([n]) => `<option value="${esc(n)}"></option>`).join('')}</datalist>
        </label>
      </div>
      ${rule ? `<p class="hint">${icon.repeat}<span>From the recurring item “${esc(rule.name)}”. Changes here apply to this payment only.</span></p>` : ''}
      <button type="submit" hidden></button>
    </form>`;

  const footer = `
    ${editing ? `<button type="button" class="btn btn-ghost btn-danger-text" data-delete>${icon.trash}<span>Delete</span></button>` : ''}
    <span class="spacer"></span>
    ${editing ? '' : `<button type="button" class="btn btn-ghost hide-sm" data-again title="Ctrl+Enter">Save and add another</button>`}
    <button type="button" class="btn btn-primary" data-save>${editing ? 'Save changes' : 'Add'}</button>`;

  const { el, close } = openSheet({ title: editing ? 'Edit transaction' : 'Add transaction', body, footer, className: 'sheet-tx' });
  const form = $('form', el);

  const refreshChips = (keep) => {
    $('[data-chips]', el).innerHTML = chipsFor(curType, keep);
    $('[data-target-label]', el).textContent = curType === 'savings' ? 'Goal' : 'Category';
  };

  form.addEventListener('change', (e) => {
    if (e.target.name === 'type') {
      curType = e.target.value;
      refreshChips(null);
      fieldError(form, 'target', '');
    }
    if (e.target.name === 'target') fieldError(form, 'target', '');
  });

  // Picking a note you have used before fills in its category.
  form.note.addEventListener('change', () => {
    const hit = notes.find(([n]) => n.toLowerCase() === form.note.value.trim().toLowerCase());
    if (!hit || form.querySelector('input[name="target"]:checked')) return;
    const last = hit[1].last;
    if (last.type !== curType) {
      curType = last.type;
      form.querySelector(`input[name="type"][value="${curType}"]`).checked = true;
    }
    refreshChips(last.categoryId || last.goalId);
  });

  $$('[data-day]', el).forEach((b) => b.addEventListener('click', () => (form.date.value = addDays(todayIso(), Number(b.dataset.day)))));

  el.addEventListener('click', (e) => {
    if (e.target.closest('[data-new-cat]')) {
      openCategoryEditor({ type: curType === 'income' ? 'income' : 'expense', onSaved: (id) => refreshChips(id) });
    }
  });

  const submit = (again) => {
    const amount = parseMoney(form.amount.value);
    const target = form.querySelector('input[name="target"]:checked')?.value || null;
    let ok = true;
    if (!Number.isFinite(amount) || amount === 0) {
      fieldError(form, 'amount', 'Type an amount, like 250 or 1 499.99');
      ok = false;
    } else fieldError(form, 'amount', '');
    if (!target) {
      fieldError(form, 'target', curType === 'savings' ? 'Pick a goal' : 'Pick a category');
      ok = false;
    }
    if (!isIsoDate(form.date.value)) ok = false;
    if (!ok) return;
    const fields = {
      type: curType,
      amount: curType === 'savings' ? amount : Math.abs(amount) * (amount < 0 && curType === 'expense' ? -1 : 1),
      date: form.date.value,
      note: form.note.value.trim(),
      categoryId: curType === 'savings' ? null : target,
      goalId: curType === 'savings' ? target : null,
    };
    A.saveTransaction(fields, tx?.id || null);
    if (again) {
      toast(`Added ${money(fields.amount)}`);
      form.amount.value = '';
      form.note.value = '';
      form.amount.focus();
    } else {
      close();
      if (!editing) toast(`Added ${money(fields.amount)} · ${fields.categoryId ? category(store.state, fields.categoryId)?.name : goal(store.state, fields.goalId)?.name}`);
    }
  };

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    submit(false);
  });
  form.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && !editing) {
      e.preventDefault();
      submit(true);
    }
  });
  $('[data-save]', el).addEventListener('click', () => submit(false));
  $('[data-again]', el)?.addEventListener('click', () => submit(true));
  $('[data-delete]', el)?.addEventListener('click', () => {
    close();
    A.deleteTransaction(tx.id);
  });
}

// ---------------------------------------------------------------- category

export function openCategoryEditor({ cat = null, type = 'expense', periodKey = null, onSaved = null } = {}) {
  const s = store.state;
  const editing = Boolean(cat);
  const t = cat?.type || type;
  const planned = periodKey && cat ? planFor(s, periodKey)[cat.id] || 0 : 0;
  const body = `
    <form class="form" novalidate>
      ${editing ? '' : seg('ctype', [['expense', 'Spending'], ['income', 'Income']], t)}
      <label class="field" data-field="name"><span class="label">Name</span>
        <input name="name" maxlength="40" required value="${esc(cat?.name || '')}" placeholder="e.g. Groceries" autofocus>
        <p class="field-error" data-error="name" hidden></p>
      </label>
      ${periodKey ? `<label class="field"><span class="label">Planned for ${esc(monthLabel(periodKey))}</span>
        <div class="input-money"><span>R</span><input name="planned" inputmode="decimal" placeholder="0.00" value="${planned ? esc(amountInput(planned)) : ''}"></div></label>` : ''}
      <div class="field"><span class="label">Icon</span>${emojiPickerHtml(cat?.emoji || (t === 'income' ? '💰' : '🏷️'))}</div>
      <button type="submit" hidden></button>
    </form>`;
  const footer = `
    ${editing ? `<button type="button" class="btn btn-ghost btn-danger-text" data-remove>${icon.trash}<span>Remove</span></button>` : ''}
    <span class="spacer"></span>
    <button type="button" class="btn btn-primary" data-save>${editing ? 'Save' : 'Add category'}</button>`;
  const { el, close } = openSheet({ title: editing ? 'Edit category' : 'New category', body, footer });
  const form = $('form', el);
  const save = () => {
    const name = form.name.value.trim();
    if (!name) return fieldError(form, 'name', 'Give it a name');
    const plannedVal = form.planned ? parseMoney(form.planned.value || '0') : null;
    const fields = {
      name,
      emoji: form.querySelector('input[name="emoji"]:checked')?.value || '🏷️',
      type: editing ? cat.type : form.querySelector('input[name="ctype"]:checked')?.value || t,
      planned: Number.isFinite(plannedVal) ? Math.max(0, plannedVal) : null,
    };
    const id = A.saveCategory(fields, cat?.id || null, periodKey || periodOf(todayIso(), startDayOf(s)));
    close();
    if (onSaved) onSaved(id);
  };
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    save();
  });
  $('[data-save]', el).addEventListener('click', save);
  $('[data-remove]', el)?.addEventListener('click', async () => {
    const used = s.transactions.some((x) => x.categoryId === cat.id);
    close();
    if (!used) {
      A.deleteCategory(cat.id, null);
      return;
    }
    const ok = await confirmDialog(`“${cat.name}” has transactions. Hide it from now on? Past months keep their history.`, {
      title: 'Hide category',
      confirmLabel: 'Hide category',
    });
    if (ok) A.archiveCategory(cat.id);
  });
}

// ---------------------------------------------------------------- recurring

export function openRecurringEditor({ rule = null, preset = {} } = {}) {
  const s = store.state;
  const editing = Boolean(rule);
  const r = rule || { type: 'expense', frequency: 'monthly', amount: 0, name: '', startDate: todayIso(), endDate: null, ...preset };
  let curType = r.type;
  const options = (t, selected) =>
    t === 'savings'
      ? s.goals.filter((g) => !g.archived).map((g) => `<option value="${esc(g.id)}" ${g.id === selected ? 'selected' : ''}>${esc(g.emoji)} ${esc(g.name)}</option>`).join('')
      : activeCategories(s, t).map((c) => `<option value="${esc(c.id)}" ${c.id === selected ? 'selected' : ''}>${esc(c.emoji)} ${esc(c.name)}</option>`).join('');

  const body = `
    <form class="form" novalidate>
      ${seg('rtype', [['expense', 'Bill or debit order'], ['income', 'Income'], ['savings', 'To a goal']], curType)}
      <label class="field" data-field="name"><span class="label">Name</span>
        <input name="name" maxlength="60" placeholder="e.g. Rent, Vodacom contract, Netflix" value="${esc(r.name)}" autofocus>
        <p class="field-error" data-error="name" hidden></p></label>
      <div class="row-2">
        <label class="field" data-field="amount"><span class="label">Amount</span>
          <div class="input-money"><span>R</span><input name="amount" inputmode="decimal" placeholder="0.00" value="${r.amount ? esc(amountInput(r.amount)) : ''}"></div>
          <p class="field-error" data-error="amount" hidden></p></label>
        <label class="field" data-field="target"><span class="label" data-target-label>${curType === 'savings' ? 'Goal' : 'Category'}</span>
          <select name="target">${options(curType, r.categoryId || r.goalId)}</select>
          <p class="field-error" data-error="target" hidden></p></label>
      </div>
      <div class="row-2">
        <label class="field"><span class="label">How often</span>
          <select name="frequency">
            ${[['monthly', 'Every month'], ['weekly', 'Every week'], ['fortnightly', 'Every 2 weeks'], ['yearly', 'Every year']]
              .map(([v, l]) => `<option value="${v}" ${v === r.frequency ? 'selected' : ''}>${l}</option>`)
              .join('')}
          </select></label>
        <label class="field" data-field="start"><span class="label">${editing ? 'Starts' : 'First payment'}</span>
          <input type="date" name="startDate" value="${esc(r.startDate)}"></label>
      </div>
      <label class="field"><span class="label">Ends (optional)</span><input type="date" name="endDate" value="${esc(r.endDate || '')}"></label>
      <p class="hint">${icon.info}<span>${editing ? 'Changes apply to upcoming payments. Past ones stay as they were.' : 'It is added to your transactions on each date, and shows as upcoming until the day arrives.'}</span></p>
      <button type="submit" hidden></button>
    </form>`;
  const footer = `
    ${editing ? `<button type="button" class="btn btn-ghost btn-danger-text" data-delete>${icon.trash}<span>Delete</span></button>` : ''}
    <span class="spacer"></span>
    <button type="button" class="btn btn-primary" data-save>${editing ? 'Save' : 'Add recurring item'}</button>`;
  const { el, close } = openSheet({ title: editing ? 'Edit recurring item' : 'New recurring item', body, footer });
  const form = $('form', el);
  form.addEventListener('change', (e) => {
    if (e.target.name === 'rtype') {
      curType = e.target.value;
      form.target.innerHTML = options(curType, null);
      $('[data-target-label]', el).textContent = curType === 'savings' ? 'Goal' : 'Category';
    }
  });
  const save = () => {
    const name = form.name.value.trim();
    const amount = parseMoney(form.amount.value);
    let ok = true;
    if (!name) {
      fieldError(form, 'name', 'Give it a name');
      ok = false;
    } else fieldError(form, 'name', '');
    if (!Number.isFinite(amount) || amount <= 0) {
      fieldError(form, 'amount', 'Type the amount');
      ok = false;
    } else fieldError(form, 'amount', '');
    if (!form.target.value) {
      fieldError(form, 'target', curType === 'savings' ? 'Add a goal first' : 'Pick a category');
      ok = false;
    }
    if (!isIsoDate(form.startDate.value)) ok = false;
    if (!ok) return;
    A.saveRecurring(
      {
        name,
        type: curType,
        amount,
        categoryId: curType === 'savings' ? null : form.target.value,
        goalId: curType === 'savings' ? form.target.value : null,
        frequency: form.frequency.value,
        startDate: form.startDate.value,
        endDate: isIsoDate(form.endDate.value) ? form.endDate.value : null,
      },
      rule?.id || null
    );
    close();
    const saved = store.state.recurring.find((x) => x.name === name);
    const next = saved ? nextOccurrence(saved) : null;
    toast(editing ? 'Recurring item saved' : `Added. Next: ${next ? dateLabel(next) : 'none'}`);
  };
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    save();
  });
  $('[data-save]', el).addEventListener('click', save);
  $('[data-delete]', el)?.addEventListener('click', async () => {
    close();
    const ok = await confirmDialog(`Delete “${rule.name}”? Upcoming payments it added are removed. Past ones stay in your history.`, {
      title: 'Delete recurring item',
    });
    if (ok) A.deleteRecurring(rule.id);
  });
}

// ---------------------------------------------------------------- goal

export function openGoalEditor({ g = null } = {}) {
  const editing = Boolean(g);
  const v = g || { name: '', emoji: '🎯', target: 0, startingBalance: 0, monthly: 0, targetDate: '' };
  const body = `
    <form class="form" novalidate>
      <label class="field" data-field="name"><span class="label">What are you saving for?</span>
        <input name="name" maxlength="50" placeholder="e.g. Emergency fund, December holiday" value="${esc(v.name)}" autofocus>
        <p class="field-error" data-error="name" hidden></p></label>
      <div class="row-2">
        <label class="field" data-field="target"><span class="label">Target</span>
          <div class="input-money"><span>R</span><input name="target" inputmode="decimal" placeholder="0.00" value="${v.target ? esc(amountInput(v.target)) : ''}"></div>
          <p class="field-error" data-error="target" hidden></p></label>
        <label class="field"><span class="label">Already saved</span>
          <div class="input-money"><span>R</span><input name="startingBalance" inputmode="decimal" placeholder="0.00" value="${v.startingBalance ? esc(amountInput(v.startingBalance)) : ''}"></div></label>
      </div>
      <div class="row-2">
        <label class="field"><span class="label">Put away each month</span>
          <div class="input-money"><span>R</span><input name="monthly" inputmode="decimal" placeholder="0.00" value="${v.monthly ? esc(amountInput(v.monthly)) : ''}"></div></label>
        <label class="field"><span class="label">Target month (optional)</span><input type="month" name="targetDate" value="${esc(v.targetDate || '')}"></label>
      </div>
      <div class="field"><span class="label">Icon</span>${emojiPickerHtml(v.emoji)}</div>
      <p class="hint">${icon.info}<span>The monthly amount is set aside in your budget and taken off “safe to spend”.</span></p>
      <button type="submit" hidden></button>
    </form>`;
  const footer = `
    ${editing ? `<button type="button" class="btn btn-ghost btn-danger-text" data-delete>${icon.trash}<span>Delete</span></button>` : ''}
    <span class="spacer"></span>
    <button type="button" class="btn btn-primary" data-save>${editing ? 'Save' : 'Add goal'}</button>`;
  const { el, close } = openSheet({ title: editing ? 'Edit goal' : 'New savings goal', body, footer });
  const form = $('form', el);
  const num = (x) => {
    const c = parseMoney(x || '0');
    return Number.isFinite(c) ? Math.max(0, c) : 0;
  };
  const save = () => {
    const name = form.name.value.trim();
    const target = num(form.target.value);
    let ok = true;
    if (!name) {
      fieldError(form, 'name', 'Give your goal a name');
      ok = false;
    } else fieldError(form, 'name', '');
    if (!target) {
      fieldError(form, 'target', 'How much do you need?');
      ok = false;
    } else fieldError(form, 'target', '');
    if (!ok) return;
    A.saveGoal(
      {
        name,
        target,
        startingBalance: num(form.startingBalance.value),
        monthly: num(form.monthly.value),
        targetDate: /^\d{4}-\d{2}$/.test(form.targetDate.value) ? form.targetDate.value : null,
        emoji: form.querySelector('input[name="emoji"]:checked')?.value || '🎯',
      },
      g?.id || null
    );
    close();
    toast(editing ? 'Goal saved' : 'Goal added');
  };
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    save();
  });
  $('[data-save]', el).addEventListener('click', save);
  $('[data-delete]', el)?.addEventListener('click', async () => {
    close();
    const ok = await confirmDialog(`Delete “${g.name}” and the money moves recorded against it?`, { title: 'Delete goal' });
    if (ok) A.deleteGoal(g.id);
  });
}

export { TYPE_LABEL };
