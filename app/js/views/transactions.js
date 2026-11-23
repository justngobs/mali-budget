import { esc, icon } from '../ui.js';
import { money, monthLabel, dayHeading, todayIso, dateLabel } from '../format.js';
import { periodRange, startDayOf, activeCategories, category, goal } from '../model.js';
import { txAmount, txTitle, txEmoji } from './dashboard.js';

/** Remembered while the app is open. */
export const txFilters = { q: '', type: 'all', cat: '' };

function matches(s, t, f) {
  if (f.type !== 'all' && t.type !== f.type) return false;
  if (f.cat && t.categoryId !== f.cat && t.goalId !== f.cat) return false;
  if (f.q) {
    const q = f.q.toLowerCase();
    const name = t.type === 'savings' ? goal(s, t.goalId)?.name : category(s, t.categoryId)?.name;
    const hay = `${t.note || ''} ${name || ''} ${(t.amount / 100).toFixed(2)}`.toLowerCase();
    if (!q.split(/\s+/).every((w) => hay.includes(w))) return false;
  }
  return true;
}

export function renderTransactions({ state: s, period }) {
  const f = txFilters;
  const { start, end } = periodRange(period, startDayOf(s));
  const today = todayIso();
  const searchAll = Boolean(f.q);
  const list = s.transactions
    .filter((t) => (searchAll || (t.date >= start && t.date <= end)) && matches(s, t, f))
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : (b.createdAt || '').localeCompare(a.createdAt || '')));

  const upcoming = list.filter((t) => t.date > today).reverse();
  const done = list.filter((t) => t.date <= today);
  const totals = { income: 0, expense: 0, savings: 0 };
  for (const t of list) totals[t.type] += t.amount;

  const groups = new Map();
  for (const t of done) {
    if (!groups.has(t.date)) groups.set(t.date, []);
    groups.get(t.date).push(t);
  }

  const row = (t) => {
    const catName = t.type === 'savings' ? `To ${goal(s, t.goalId)?.name || 'a goal'}` : category(s, t.categoryId)?.name || 'Uncategorised';
    return `<li><button type="button" class="tx-row" data-edit-tx="${esc(t.id)}">
      <span class="avatar">${esc(txEmoji(s, t))}</span>
      <span class="tx-main">
        <span class="tx-title truncate">${esc(txTitle(s, t))}</span>
        <span class="tx-sub">${t.note ? esc(catName) : esc(t.type === 'income' ? 'Income' : t.type === 'savings' ? 'Savings' : 'Spending')}${
          t.recurringId ? ` · <i class="inline-icon" title="Recurring">${icon.repeat}</i>` : ''
        }${searchAll ? ` · ${esc(dateLabel(t.date, { year: true }))}` : ''}</span>
      </span>
      ${txAmount(t)}
    </button></li>`;
  };

  const dayTotal = (items) => {
    const spent = items.filter((t) => t.type === 'expense').reduce((a, t) => a + t.amount, 0);
    return spent ? `<span>${esc(money(-spent))}</span>` : '';
  };

  const catOptions = [
    ...activeCategories(s, 'expense').map((c) => [c.id, `${c.emoji} ${c.name}`]),
    ...activeCategories(s, 'income').map((c) => [c.id, `${c.emoji} ${c.name}`]),
    ...s.goals.filter((g) => !g.archived).map((g) => [g.id, `${g.emoji} ${g.name}`]),
  ];

  const empty = !list.length
    ? `<div class="empty-state">
        <div class="empty-icon">${icon.list}</div>
        <h3>${f.q || f.type !== 'all' || f.cat ? 'Nothing matches' : `No transactions in ${esc(monthLabel(period))}`}</h3>
        <p>${f.q || f.type !== 'all' || f.cat ? 'Try a different search or filter.' : 'Add what you spend and earn. It only takes a few seconds each.'}</p>
        ${f.q || f.type !== 'all' || f.cat ? `<button type="button" class="btn btn-ghost" data-clear-filters>Clear filters</button>` : `<button type="button" class="btn btn-primary" data-add>${icon.plus}<span>Add transaction</span></button>`}
      </div>`
    : '';

  const html = `
    <div class="toolbar">
      <label class="search">${icon.search}<input type="search" placeholder="Search notes, categories, amounts" value="${esc(f.q)}" data-fkey="tx-search" data-filter="q" aria-label="Search transactions"></label>
      <div class="seg-control seg-sm" role="radiogroup" aria-label="Type">
        ${[['all', 'All'], ['expense', 'Spending'], ['income', 'Income'], ['savings', 'Goals']]
          .map(([v, l]) => `<label><input type="radio" name="txtype" value="${v}" data-filter="type" ${f.type === v ? 'checked' : ''}><span>${l}</span></label>`)
          .join('')}
      </div>
      <select data-filter="cat" aria-label="Category" class="select-sm">
        <option value="">All categories</option>
        ${catOptions.map(([id, l]) => `<option value="${esc(id)}" ${f.cat === id ? 'selected' : ''}>${esc(l)}</option>`).join('')}
      </select>
      <span class="spacer"></span>
      <button type="button" class="btn btn-ghost btn-sm" data-export="month">${icon.download}<span>CSV</span></button>
    </div>
    <div class="summary-strip">
      <span>${list.length} transaction${list.length === 1 ? '' : 's'}${searchAll ? ' across all months' : ''}</span>
      <span><i class="dot-key" style="background:var(--series-2)"></i>Spending <strong>${esc(money(totals.expense))}</strong></span>
      <span><i class="dot-key" style="background:var(--series-1)"></i>Income <strong>${esc(money(totals.income))}</strong></span>
      ${totals.savings ? `<span><i class="dot-key" style="background:var(--series-3)"></i>To goals <strong>${esc(money(totals.savings))}</strong></span>` : ''}
    </div>
    ${empty}
    ${
      upcoming.length
        ? `<section class="card list-card"><header class="day-head"><span>Upcoming</span><span class="muted">${upcoming.length} scheduled</span></header>
           <ul class="tx-list">${upcoming.map((t) => row(t).replace('class="tx-row"', 'class="tx-row is-upcoming"')).join('')}</ul></section>`
        : ''
    }
    ${[...groups.entries()]
      .map(
        ([date, items]) => `<section class="card list-card">
        <header class="day-head"><span>${esc(searchAll ? dateLabel(date, { weekday: true, year: true }) : dayHeading(date))}</span><span class="muted">${dayTotal(items)}</span></header>
        <ul class="tx-list">${items.map(row).join('')}</ul></section>`
      )
      .join('')}
  `;
  return { html };
}
