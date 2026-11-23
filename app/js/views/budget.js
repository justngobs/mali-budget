import { esc, icon } from '../ui.js';
import { money, monthLabel } from '../format.js';
import { summarize, hasOwnPlan, goalProgress, budgetState } from '../model.js';
import { meter } from '../charts.js';

function planInput(r) {
  return `<input class="cell-input" data-plan="${esc(r.category.id)}" data-fkey="plan-${esc(r.category.id)}"
    inputmode="decimal" autocomplete="off" value="${r.planned ? esc(money(r.planned)) : ''}" placeholder="R 0.00"
    aria-label="Planned for ${esc(r.category.name)}">`;
}

export function renderBudget({ state: s, period }) {
  const sum = summarize(s, period);
  const own = hasOwnPlan(s, period);
  const left = sum.plannedLeftover;

  const leftMsg =
    sum.income.planned === 0
      ? 'Start with your income, then give each rand a job.'
      : left === 0
        ? 'Every rand has a job. Nicely done.'
        : left > 0
          ? `${money(left, { cents: false })} not planned yet. Give it a job, or move it to a goal.`
          : `You planned ${money(-left, { cents: false })} more than you expect to earn.`;

  const incomeRows = sum.incomeRows
    .filter((r) => !r.category.archived || r.actual || r.upcoming || r.planned)
    .map((r) => {
      const got = r.actual + r.upcoming;
      const diff = got - r.planned;
      return `<tr>
        <td><div class="cat-cell"><span class="emoji">${esc(r.category.emoji)}</span><span class="truncate">${esc(r.category.name)}</span>
          ${r.category.id.startsWith('none-') ? '' : `<button type="button" class="icon-btn icon-btn-sm row-edit" data-edit-cat="${esc(r.category.id)}" aria-label="Edit ${esc(r.category.name)}">${icon.edit}</button>`}</div></td>
        <td class="num">${r.category.id.startsWith('none-') ? '' : planInput(r)}</td>
        <td class="num">${esc(money(got))}${r.upcoming ? `<span class="cell-note">${esc(money(r.upcoming, { cents: false }))} expected</span>` : ''}</td>
        <td class="num ${diff < 0 ? 'neg-soft' : diff > 0 ? 'pos' : ''}">${diff === 0 ? '<span class="muted">–</span>' : esc(money(diff, { sign: true }))}</td>
      </tr>`;
    })
    .join('');

  const expenseRows = sum.expenseRows
    .filter((r) => !r.category.archived || r.actual || r.upcoming || r.planned)
    .map((r) => {
      const used = r.actual + r.upcoming;
      const rem = r.planned - used;
      const st = budgetState(used, r.planned);
      const state = st === 'unplanned' ? 'over' : st === 'full' ? 'idle' : st;
      return `<tr>
        <td><div class="cat-cell"><span class="emoji">${esc(r.category.emoji)}</span><span class="cat-name-wrap"><span class="truncate">${esc(r.category.name)}</span>${meter(used, r.planned)}</span>
          ${r.category.id.startsWith('none-') ? '' : `<button type="button" class="icon-btn icon-btn-sm row-edit" data-edit-cat="${esc(r.category.id)}" aria-label="Edit ${esc(r.category.name)}">${icon.edit}</button>`}</div></td>
        <td class="num">${r.category.id.startsWith('none-') ? '' : planInput(r)}</td>
        <td class="num">${esc(money(used))}${r.upcoming ? `<span class="cell-note">${esc(money(r.upcoming, { cents: false }))} to come</span>` : ''}</td>
        <td class="num"><span class="status status-${used === 0 && r.planned > 0 ? 'idle' : state}">${state === 'over' ? icon.alert : ''}${esc(money(rem))}</span></td>
      </tr>`;
    })
    .join('');

  const goals = s.goals.filter((g) => !g.archived);
  const goalRows = goals
    .map((g) => {
      const got = sum.savings.byGoal.get(g.id) || { actual: 0, upcoming: 0 };
      const done = got.actual + got.upcoming;
      const p = goalProgress(s, g);
      return `<tr>
        <td><div class="cat-cell"><span class="emoji">${esc(g.emoji)}</span><span class="cat-name-wrap"><span class="truncate">${esc(g.name)}</span>${meter(done, g.monthly || done, { tone: 'ok' })}</span>
          <a class="icon-btn icon-btn-sm row-edit" href="#/goals" aria-label="Open goals">${icon.chevronRight}</a></div></td>
        <td class="num"><span class="cell-static">${esc(money(g.monthly || 0))}</span></td>
        <td class="num">${esc(money(done))}</td>
        <td class="num"><span class="muted small">${esc(money(p.saved, { cents: false }))} saved</span></td>
      </tr>`;
    })
    .join('');

  const totalRow = (label, a, b, c, cls = '') => `<tr class="total-row ${cls}"><td>${label}</td><td class="num">${a}</td><td class="num">${b}</td><td class="num">${c}</td></tr>`;

  const html = `
    <section class="budget-summary">
      <div class="bs-item"><span class="kpi-label">Planned income</span><strong>${esc(money(sum.income.planned, { cents: false }))}</strong></div>
      <div class="bs-op">−</div>
      <div class="bs-item"><span class="kpi-label">Planned spending</span><strong>${esc(money(sum.expense.planned, { cents: false }))}</strong></div>
      <div class="bs-op">−</div>
      <div class="bs-item"><span class="kpi-label">Goals</span><strong>${esc(money(sum.savings.planned, { cents: false }))}</strong></div>
      <div class="bs-op">=</div>
      <div class="bs-item bs-result ${left < 0 ? 'is-neg' : left === 0 && sum.income.planned ? 'is-zero' : ''}"><span class="kpi-label">Left to plan</span><strong>${esc(money(left, { cents: false }))}</strong></div>
      <p class="bs-msg">${left < 0 ? icon.alert : left === 0 && sum.income.planned ? icon.check : icon.info}<span>${esc(leftMsg)}</span></p>
    </section>

    <div class="toolbar">
      <span class="muted small">${own ? `Plan for ${esc(monthLabel(period))}.` : `Using your latest plan. Changes here start a plan for ${esc(monthLabel(period))} that later months copy.`} Click an amount to change it.</span>
      <span class="spacer"></span>
      <button type="button" class="btn btn-ghost btn-sm" data-copy-plan>${icon.copy}<span>Copy last month</span></button>
      <button type="button" class="btn btn-ghost btn-sm" data-export="budget">${icon.download}<span>CSV</span></button>
      <button type="button" class="btn btn-primary btn-sm" data-new-cat="expense">${icon.plus}<span>Category</span></button>
    </div>

    <section class="card table-card">
      <header class="card-head"><div><h2>Income</h2><p class="sub">What you expect to come in</p></div><button type="button" class="link-btn" data-new-cat="income">${icon.plus} Add income source</button></header>
      <div class="table-scroll"><table class="budget-table">
        <thead><tr><th>Source</th><th class="num">Planned</th><th class="num">Received</th><th class="num">Difference</th></tr></thead>
        <tbody>${incomeRows || `<tr><td colspan="4" class="muted">No income sources yet.</td></tr>`}</tbody>
        <tfoot>${totalRow('Total income', esc(money(sum.income.planned)), esc(money(sum.income.actual + sum.income.upcoming)), esc(money(sum.income.actual + sum.income.upcoming - sum.income.planned, { sign: true })))}</tfoot>
      </table></div>
    </section>

    <section class="card table-card">
      <header class="card-head"><div><h2>Spending</h2><p class="sub">Your categories, planned against what went out</p></div><button type="button" class="link-btn" data-new-cat="expense">${icon.plus} Add category</button></header>
      <div class="table-scroll"><table class="budget-table">
        <thead><tr><th>Category</th><th class="num">Planned</th><th class="num">Spent</th><th class="num">Left</th></tr></thead>
        <tbody>${expenseRows || `<tr><td colspan="4" class="muted">No categories yet.</td></tr>`}</tbody>
        <tfoot>${totalRow('Total spending', esc(money(sum.expense.planned)), esc(money(sum.expense.actual + sum.expense.upcoming)), esc(money(sum.budgetLeft)))}</tfoot>
      </table></div>
    </section>

    <section class="card table-card">
      <header class="card-head"><div><h2>Savings goals</h2><p class="sub">Set the monthly amounts on the Goals page</p></div><a class="link-btn" href="#/goals">${icon.plus} Add goal</a></header>
      <div class="table-scroll"><table class="budget-table">
        <thead><tr><th>Goal</th><th class="num">Monthly</th><th class="num">Put away</th><th class="num">Total</th></tr></thead>
        <tbody>${goalRows || `<tr><td colspan="4" class="muted">No goals yet. Saving for something? <a href="#/goals">Add a goal</a>.</td></tr>`}</tbody>
        <tfoot>${totalRow('Total to goals', esc(money(sum.savings.planned)), esc(money(sum.savings.actual + sum.savings.upcoming)), '')}</tfoot>
      </table></div>
    </section>

    <section class="card leftover-card">
      <div><span class="kpi-label">Planned left over</span><strong>${esc(money(sum.plannedLeftover))}</strong></div>
      <div><span class="kpi-label">Actual left over (incl. upcoming)</span><strong class="${sum.income.actual + sum.income.upcoming - sum.expense.actual - sum.expense.upcoming - sum.savings.actual - sum.savings.upcoming < 0 ? 'neg' : ''}">${esc(
        money(sum.income.actual + sum.income.upcoming - sum.expense.actual - sum.expense.upcoming - sum.savings.actual - sum.savings.upcoming)
      )}</strong></div>
    </section>
  `;
  return { html };
}
