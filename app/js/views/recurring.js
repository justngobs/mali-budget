import { esc, icon } from '../ui.js';
import { money, dateLabel, ordinal, parseIso, dayHeading } from '../format.js';
import { category, goal, nextOccurrence, monthlyEquivalent } from '../model.js';

const DAYS = ['Sundays', 'Mondays', 'Tuesdays', 'Wednesdays', 'Thursdays', 'Fridays', 'Saturdays'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export function scheduleText(r) {
  const d = parseIso(r.startDate);
  switch (r.frequency) {
    case 'weekly':
      return `Every week on ${DAYS[d.getDay()]}`;
    case 'fortnightly':
      return `Every 2 weeks on ${DAYS[d.getDay()]}`;
    case 'yearly':
      return `Every year on ${d.getDate()} ${MONTHS[d.getMonth()]}`;
    default:
      return `Monthly on the ${ordinal(d.getDate())}`;
  }
}

export const SUGGESTIONS = [
  { name: 'Rent', type: 'expense', cat: 'Rent or bond', amount: 0 },
  { name: 'Bond repayment', type: 'expense', cat: 'Rent or bond', amount: 0 },
  { name: 'Medical aid', type: 'expense', cat: 'Medical aid & health', amount: 0 },
  { name: 'Car insurance', type: 'expense', cat: 'Insurance', amount: 0 },
  { name: 'Funeral cover', type: 'expense', cat: 'Insurance', amount: 0 },
  { name: 'Cellphone contract', type: 'expense', cat: 'Airtime & data', amount: 0 },
  { name: 'Fibre', type: 'expense', cat: 'Airtime & data', amount: 0 },
  { name: 'Netflix', type: 'expense', cat: 'Subscriptions', amount: 19900 },
  { name: 'Showmax', type: 'expense', cat: 'Subscriptions', amount: 9900 },
  { name: 'DStv', type: 'expense', cat: 'Subscriptions', amount: 0 },
  { name: 'Spotify', type: 'expense', cat: 'Subscriptions', amount: 6999 },
  { name: 'Gym', type: 'expense', cat: 'Entertainment', amount: 0 },
  { name: 'School fees', type: 'expense', cat: 'School & education', amount: 0 },
  { name: 'Salary', type: 'income', cat: 'Salary', amount: 0 },
];

export function renderRecurring({ state: s }) {
  const rules = s.recurring.slice().sort((a, b) => (a.type === b.type ? (nextOccurrence(a) || '9') < (nextOccurrence(b) || '9') ? -1 : 1 : a.type < b.type ? -1 : 1));
  const groups = [
    ['expense', 'Bills, debit orders and subscriptions'],
    ['income', 'Income'],
    ['savings', 'To your goals'],
  ];
  const totals = { expense: 0, income: 0, savings: 0 };
  for (const r of rules) if (r.active) totals[r.type] += monthlyEquivalent(r);

  const row = (r) => {
    const target = r.type === 'savings' ? goal(s, r.goalId) : category(s, r.categoryId);
    const next = nextOccurrence(r);
    return `<li class="rec-row ${r.active ? '' : 'is-paused'}">
      <button type="button" class="tx-row" data-edit-rule="${esc(r.id)}">
        <span class="avatar">${esc(target?.emoji || '🔁')}</span>
        <span class="tx-main">
          <span class="tx-title truncate">${esc(r.name)}</span>
          <span class="tx-sub">${esc(scheduleText(r))} · ${esc(target?.name || 'No category')}</span>
        </span>
        <span class="rec-next">${r.active ? (next ? `<span class="muted small">Next</span><span>${esc(dayHeading(next))}</span>` : '<span class="muted small">Ended</span>') : '<span class="pill">Paused</span>'}</span>
        <span class="amt ${r.type === 'income' ? 'amt-in' : r.type === 'savings' ? 'amt-save' : ''}">${esc(money(r.type === 'expense' ? -r.amount : r.amount, { sign: r.type === 'income' }))}</span>
      </button>
      <button type="button" class="icon-btn" data-toggle-rule="${esc(r.id)}" title="${r.active ? 'Pause' : 'Resume'}" aria-label="${r.active ? 'Pause' : 'Resume'} ${esc(r.name)}">${r.active ? icon.pause : icon.play}</button>
    </li>`;
  };

  const have = new Set(s.recurring.map((r) => r.name.toLowerCase()));
  const chips = SUGGESTIONS.filter((x) => !have.has(x.name.toLowerCase()))
    .map((x, i) => `<button type="button" class="chip-btn" data-suggest="${SUGGESTIONS.indexOf(x)}">${icon.plus}<span>${esc(x.name)}</span></button>`)
    .join('');

  const html = `
    <section class="grid">
      <article class="card kpi span-4"><span class="kpi-label">Bills each month</span><div class="kpi-value">${esc(money(totals.expense, { cents: false }))}</div><span class="kpi-meta">Rent, debit orders, subscriptions</span></article>
      <article class="card kpi span-4"><span class="kpi-label">Regular income</span><div class="kpi-value">${esc(money(totals.income, { cents: false }))}</div><span class="kpi-meta">Per month</span></article>
      <article class="card kpi span-4"><span class="kpi-label">Automatic saving</span><div class="kpi-value">${esc(money(totals.savings, { cents: false }))}</div><span class="kpi-meta">Per month, to goals</span></article>
    </section>
    <div class="toolbar">
      <span class="muted small">Recurring items add themselves to your transactions on each date. Until then they show as upcoming and count against “safe to spend”.</span>
      <span class="spacer"></span>
      <button type="button" class="btn btn-primary btn-sm" data-new-rule>${icon.plus}<span>Recurring item</span></button>
    </div>
    ${groups
      .map(([type, title]) => {
        const list = rules.filter((r) => r.type === type);
        if (!list.length) return '';
        return `<section class="card list-card"><header class="day-head"><span>${esc(title)}</span><span class="muted">${list.length}</span></header><ul class="tx-list">${list.map(row).join('')}</ul></section>`;
      })
      .join('')}
    ${
      !rules.length
        ? `<div class="empty-state"><div class="empty-icon">${icon.repeat}</div><h3>No recurring items yet</h3>
           <p>Add rent, debit orders and subscriptions once, and they fill themselves in every month.</p></div>`
        : ''
    }
    ${chips ? `<section class="suggest"><h3 class="section-label">Quick add</h3><div class="chip-row">${chips}</div></section>` : ''}
  `;
  return { html };
}
