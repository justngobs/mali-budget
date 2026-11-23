import { esc, icon } from '../ui.js';
import { money, monthLabel, percent, dateLabel } from '../format.js';
import { goalProgress } from '../model.js';
import { ring } from '../charts.js';

export function renderGoals({ state: s }) {
  const goals = s.goals.filter((g) => !g.archived);
  let totalSaved = 0;
  let totalTarget = 0;
  let monthly = 0;
  const cards = goals
    .map((g) => {
      const p = goalProgress(s, g);
      totalSaved += p.saved;
      totalTarget += p.target;
      monthly += g.monthly || 0;
      let plan;
      if (p.done) plan = `<span class="status status-ok">${icon.check}Reached. Well done!</span>`;
      else if (p.neededMonthly != null && !p.onTrack)
        plan = `<span class="status status-near">${icon.alert}Needs ${esc(money(p.neededMonthly, { cents: false }))} a month to reach it by ${esc(monthLabel(g.targetDate, { short: true }))}</span>`;
      else if (p.eta) plan = `<span class="status status-ok">${icon.check}At ${esc(money(g.monthly, { cents: false }))} a month: ${esc(monthLabel(p.eta, { short: true }))}</span>`;
      else plan = `<span class="muted small">Set a monthly amount to see when you’ll get there.</span>`;
      const last = s.transactions
        .filter((t) => t.type === 'savings' && t.goalId === g.id)
        .sort((a, b) => (a.date < b.date ? 1 : -1))[0];
      return `<article class="card goal-card">
        <div class="goal-top">
          <div class="goal-ring">${ring(p.pct, { size: 92, stroke: 9, label: `${g.name}: ${percent(p.pct, 1)}` })}<span class="goal-emoji">${esc(g.emoji)}</span></div>
          <div class="goal-head">
            <h3>${esc(g.name)}</h3>
            <div class="goal-amount"><strong>${esc(money(p.saved, { cents: false }))}</strong><span class="muted"> of ${esc(money(p.target, { cents: false }))}</span></div>
            <div class="goal-pct-big">${esc(percent(p.pct, 1))}</div>
          </div>
          <button type="button" class="icon-btn" data-edit-goal="${esc(g.id)}" aria-label="Edit ${esc(g.name)}">${icon.edit}</button>
        </div>
        <dl class="goal-facts">
          <div><dt>Monthly</dt><dd>${esc(money(g.monthly || 0, { cents: false }))}</dd></div>
          <div><dt>Still to go</dt><dd>${esc(money(p.remaining, { cents: false }))}</dd></div>
          <div><dt>Target</dt><dd>${g.targetDate ? esc(monthLabel(g.targetDate, { short: true })) : '<span class="muted">Any time</span>'}</dd></div>
        </dl>
        <p class="goal-plan">${plan}</p>
        ${last ? `<p class="muted small">Last move: ${esc(money(last.amount, { sign: true }))} on ${esc(dateLabel(last.date))}</p>` : ''}
        <div class="goal-actions">
          <button type="button" class="btn btn-primary btn-sm" data-contribute="${esc(g.id)}">${icon.plus}<span>Add money</span></button>
          <button type="button" class="btn btn-ghost btn-sm" data-withdraw="${esc(g.id)}">Take out</button>
        </div>
      </article>`;
    })
    .join('');

  const html = goals.length
    ? `
    <section class="grid">
      <article class="card kpi span-4"><span class="kpi-label">Saved across goals</span><div class="kpi-value">${esc(money(totalSaved, { cents: false }))}</div><span class="kpi-meta">${esc(percent(totalSaved, totalTarget))} of ${esc(money(totalTarget, { cents: false }))}</span></article>
      <article class="card kpi span-4"><span class="kpi-label">Put away each month</span><div class="kpi-value">${esc(money(monthly, { cents: false }))}</div><span class="kpi-meta">Taken off “safe to spend”</span></article>
      <article class="card kpi span-4 kpi-action"><span class="kpi-label">New goal</span><p class="kpi-meta">Holiday, school fees, a car, an emergency fund…</p><button type="button" class="btn btn-primary btn-sm" data-new-goal>${icon.plus}<span>Add a goal</span></button></article>
    </section>
    <section class="goal-grid">${cards}</section>`
    : `<div class="empty-state big">
        <div class="empty-icon">${icon.target}</div>
        <h3>Give your savings a purpose</h3>
        <p>An emergency fund, December holidays, school fees in January, a deposit on a car. Set a target and a monthly amount and Mali keeps track.</p>
        <button type="button" class="btn btn-primary" data-new-goal>${icon.plus}<span>Add your first goal</span></button>
      </div>`;
  return { html };
}
