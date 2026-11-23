import { esc, icon } from '../ui.js';
import { money, moneyParts, monthLabel, dateLabel, percent, dayHeading, todayIso, addDays } from '../format.js';
import { summarize, dailySpending, trend, goalProgress, category, goal, firstPeriodWithData, budgetState } from '../model.js';
import { trendChart, burnChart, segBar, meter, ring } from '../charts.js';

const SPENT = 'var(--series-2)';
const TO_COME = 'var(--series-2-soft)';
const SAVED = 'var(--series-3)';

function figure(cents, cls = 'hero-figure') {
  const p = moneyParts(cents);
  return `<div class="${cls}">${esc(p.main)}<span class="cents">${esc(p.cents)}</span></div>`;
}

function txTitle(s, t) {
  if (t.note) return t.note;
  if (t.type === 'savings') return goal(s, t.goalId)?.name || 'Savings';
  return category(s, t.categoryId)?.name || 'Uncategorised';
}

function txEmoji(s, t) {
  if (t.type === 'savings') return goal(s, t.goalId)?.emoji || '🎯';
  return category(s, t.categoryId)?.emoji || '❔';
}

export function txAmount(t) {
  if (t.type === 'income') return `<span class="amt amt-in">${esc(money(t.amount, { sign: true }))}</span>`;
  if (t.type === 'savings') return `<span class="amt amt-save">${esc(money(t.amount))}</span>`;
  return `<span class="amt">${esc(money(-t.amount))}</span>`;
}

function heroCard(sum) {
  const { status } = sum;
  if (status === 'current') {
    const income = sum.income.expected;
    if (income <= 0) {
      return `<article class="card hero span-5">
        <div class="hero-top"><span class="eyebrow">Safe to spend</span></div>
        ${figure(0)}
        <p class="hero-sub">Add your income (planned or received) to see what is safe to spend this month.</p>
        <div class="hero-actions"><a class="btn btn-light" href="#/budget">Plan your income</a></div>
      </article>`;
    }
    const safe = sum.safeToSpend;
    const parts = [
      { label: 'Spent', value: sum.expense.actual, color: SPENT },
      { label: 'Bills still to come', value: sum.expense.upcoming, color: TO_COME },
      { label: 'For your goals', value: sum.savings.committed, color: SAVED },
    ];
    const negative = safe < 0;
    return `<article class="card hero span-5">
      <div class="hero-top"><span class="eyebrow">Safe to spend</span><span class="pill pill-glass">${sum.daysLeft} day${sum.daysLeft === 1 ? '' : 's'} left</span></div>
      ${figure(safe, `hero-figure ${negative ? 'is-negative' : ''}`)}
      <p class="hero-sub">${
        negative
          ? `${icon.alert}<span>You are <strong>${esc(money(-safe, { cents: false }))}</strong> short this month. Look at your biggest categories below.</span>`
          : `About <strong>${esc(money(sum.perDay, { cents: false }))}</strong> a day until ${esc(dateLabel(sum.end))}`
      }</p>
      ${segBar(parts, income, { className: 'hero-bar' })}
      <ul class="hero-legend">
        ${parts.map((p) => `<li><span class="sw" style="background:${p.color}"></span><span>${esc(p.label)}</span><strong>${esc(money(p.value, { cents: false }))}</strong></li>`).join('')}
        <li><span class="sw sw-track"></span><span>Safe to spend</span><strong>${esc(money(Math.max(0, safe), { cents: false }))}</strong></li>
      </ul>
      <p class="hero-foot">Out of ${esc(money(income, { cents: false }))} expected income this month</p>
    </article>`;
  }
  if (status === 'past') {
    const left = sum.leftover;
    const parts = [
      { label: 'Spent', value: sum.expense.actual, color: SPENT },
      { label: 'To your goals', value: sum.savings.actual, color: SAVED },
    ];
    return `<article class="card hero span-5">
      <div class="hero-top"><span class="eyebrow">${left >= 0 ? 'Left over' : 'Overspent'}</span><span class="pill pill-glass">Month closed</span></div>
      ${figure(left, `hero-figure ${left < 0 ? 'is-negative' : ''}`)}
      <p class="hero-sub">${left >= 0 ? 'What you did not spend or save in' : 'More went out than came in during'} ${esc(monthLabel(sum.key))}</p>
      ${segBar(parts, sum.income.actual, { className: 'hero-bar' })}
      <ul class="hero-legend">
        ${parts.map((p) => `<li><span class="sw" style="background:${p.color}"></span><span>${esc(p.label)}</span><strong>${esc(money(p.value, { cents: false }))}</strong></li>`).join('')}
        <li><span class="sw sw-track"></span><span>Left over</span><strong>${esc(money(Math.max(0, left), { cents: false }))}</strong></li>
      </ul>
      <p class="hero-foot">Out of ${esc(money(sum.income.actual, { cents: false }))} income received</p>
    </article>`;
  }
  const left = sum.plannedLeftover;
  return `<article class="card hero span-5">
    <div class="hero-top"><span class="eyebrow">Planned to keep</span><span class="pill pill-glass">Coming up</span></div>
    ${figure(left, `hero-figure ${left < 0 ? 'is-negative' : ''}`)}
    <p class="hero-sub">${esc(monthLabel(sum.key))} has not started. This is your plan: income less planned spending and savings.</p>
    ${segBar(
      [
        { label: 'Planned spending', value: sum.expense.planned, color: SPENT },
        { label: 'Planned savings', value: sum.savings.planned, color: SAVED },
      ],
      sum.income.planned,
      { className: 'hero-bar' }
    )}
    <ul class="hero-legend">
      <li><span class="sw" style="background:${SPENT}"></span><span>Planned spending</span><strong>${esc(money(sum.expense.planned, { cents: false }))}</strong></li>
      <li><span class="sw" style="background:${SAVED}"></span><span>Planned savings</span><strong>${esc(money(sum.savings.planned, { cents: false }))}</strong></li>
      <li><span class="sw sw-track"></span><span>Not planned yet</span><strong>${esc(money(Math.max(0, left), { cents: false }))}</strong></li>
    </ul>
    <p class="hero-foot">Out of ${esc(money(sum.income.planned, { cents: false }))} planned income</p>
  </article>`;
}

function kpi(label, value, meta, extra = '') {
  return `<article class="card kpi span-3">
    <span class="kpi-label">${esc(label)}</span>
    <div class="kpi-value">${esc(value)}</div>
    ${extra}
    <span class="kpi-meta">${meta}</span>
  </article>`;
}

function kpis(sum) {
  const spent = sum.expense.actual + sum.expense.upcoming;
  const budgetLeft = sum.expense.planned - spent;
  const incomeGot = sum.income.actual;
  return [
    kpi(
      'Income',
      money(incomeGot, { cents: false }),
      sum.income.planned ? `of ${esc(money(sum.income.planned, { cents: false }))} planned${sum.income.upcoming ? ` · ${esc(money(sum.income.upcoming, { cents: false }))} on the way` : ''}` : 'No income planned',
      meter(incomeGot, sum.income.planned || incomeGot, { tone: 'ok' })
    ),
    kpi(
      'Spending',
      money(sum.expense.actual, { cents: false }),
      sum.expense.planned
        ? budgetLeft >= 0
          ? `<span class="status status-ok">${icon.check}${esc(money(budgetLeft, { cents: false }))} left in budget</span>`
          : `<span class="status status-over">${icon.alert}${esc(money(-budgetLeft, { cents: false }))} over budget</span>`
        : 'No spending budget yet',
      meter(spent, sum.expense.planned)
    ),
    kpi(
      'Saved to goals',
      money(sum.savings.actual, { cents: false }),
      sum.savings.planned ? `of ${esc(money(sum.savings.planned, { cents: false }))} planned this month` : 'No monthly goal amounts yet',
      meter(sum.savings.actual, sum.savings.planned || sum.savings.actual, { tone: 'ok' })
    ),
    sum.status === 'current'
      ? kpi(
          sum.forecast >= 0 ? 'Month-end forecast' : 'Month-end shortfall',
          money(sum.forecast, { cents: false }),
          'Left at month end if the rest of your budget is spent as planned',
          `<div class="kpi-spacer"></div>`
        )
      : kpi(
          sum.status === 'past' ? (sum.leftover >= 0 ? 'Left over' : 'Overspent') : 'Planned left over',
          money(sum.status === 'past' ? sum.leftover : sum.plannedLeftover, { cents: false }),
          sum.status === 'past' ? 'Income less spending and savings' : 'Planned income less planned spending and savings',
          `<div class="kpi-spacer"></div>`
        ),
  ].join('');
}

function budgetCard(sum) {
  const rows = sum.expenseRows.filter((r) => r.planned > 0 || r.actual + r.upcoming !== 0);
  // Over budget first, then nearly used up, then the rest; bills paid exactly on plan go last.
  const rank = { unplanned: 0, over: 0, near: 1, ok: 2, full: 3 };
  const ratio = (r) => (r.planned ? (r.actual + r.upcoming) / r.planned : 9);
  rows.sort((a, b) => {
    const sa = budgetState(a.actual + a.upcoming, a.planned);
    const sb = budgetState(b.actual + b.upcoming, b.planned);
    return rank[sa] - rank[sb] || ratio(b) - ratio(a);
  });
  const shown = rows.slice(0, 8);
  const body = shown.length
    ? `<div class="meter-list">${shown
        .map((r) => {
          const used = r.actual + r.upcoming;
          const left = r.planned - used;
          const st = budgetState(used, r.planned);
          const state = st === 'unplanned' ? 'over' : st === 'full' ? 'ok' : st;
          const statusText =
            st === 'unplanned'
              ? `<span class="status status-over">${icon.alert}Not budgeted</span>`
              : st === 'over'
                ? `<span class="status status-over">${icon.alert}${esc(money(-left, { cents: false }))} over</span>`
                : st === 'full'
                  ? `<span class="status status-idle">${icon.check}On budget</span>`
                  : `<span class="status status-${state}">${state === 'near' ? icon.alert : icon.check}${esc(money(left, { cents: false }))} left</span>`;
          const upW = r.planned > 0 ? Math.min(100, (Math.max(0, used) / r.planned) * 100) : 0;
          const acW = r.planned > 0 ? Math.min(100, (Math.max(0, r.actual) / r.planned) * 100) : r.actual > 0 ? 100 : 0;
          return `<div class="meter-row">
            <div class="mr-name"><span class="emoji">${esc(r.category.emoji)}</span><span class="truncate">${esc(r.category.name)}</span></div>
            <div class="mr-bar"><div class="meter meter-${state}"><span class="meter-upcoming" style="width:${upW.toFixed(2)}%"></span><span style="width:${acW.toFixed(2)}%"></span></div></div>
            <div class="mr-fig"><strong>${esc(money(used, { cents: false }))}</strong><span class="muted"> / ${esc(money(r.planned, { cents: false }))}</span></div>
            <div class="mr-status">${statusText}</div>
          </div>`;
        })
        .join('')}</div>`
    : `<div class="empty-mini"><p>No budget for this month yet.</p><a class="btn btn-ghost btn-sm" href="#/budget">Set up your budget</a></div>`;
  return `<article class="card span-7">
    <header class="card-head"><div><h2>Budget vs actual</h2><p class="sub">Over or nearly used up first. Lighter bar = still to come.</p></div>
      <a class="link-btn" href="#/budget">All categories ${icon.chevronRight}</a></header>
    ${body}
  </article>`;
}

function categoryCard(sum) {
  const rows = sum.expenseRows.filter((r) => r.actual > 0).sort((a, b) => b.actual - a.actual);
  const total = rows.reduce((a, r) => a + r.actual, 0);
  const top = rows.slice(0, 7);
  const rest = rows.slice(7);
  if (rest.length) top.push({ category: { name: `${rest.length} more`, emoji: '…' }, actual: rest.reduce((a, r) => a + r.actual, 0) });
  const max = Math.max(1, ...top.map((r) => r.actual));
  const body = top.length
    ? `<div class="rank-list">${top
        .map(
          (r) => `<div class="rank-row" title="${esc(`${r.category.name}: ${money(r.actual)} (${percent(r.actual, total)})`)}">
          <div class="rank-name"><span class="emoji">${esc(r.category.emoji)}</span><span class="truncate">${esc(r.category.name)}</span></div>
          <div class="rank-bar"><span style="width:${((r.actual / max) * 100).toFixed(2)}%"></span></div>
          <div class="rank-fig"><strong>${esc(money(r.actual, { cents: false }))}</strong><span class="muted">${esc(percent(r.actual, total))}</span></div>
        </div>`
        )
        .join('')}</div>`
    : `<div class="empty-mini"><p>No spending recorded yet this month.</p></div>`;
  return `<article class="card span-5">
    <header class="card-head"><div><h2>Where it went</h2><p class="sub">${esc(money(total, { cents: false }))} spent so far, biggest first</p></div></header>
    ${body}
  </article>`;
}

function trendCard(data) {
  const table = `<table class="data-table"><thead><tr><th>Month</th><th class="num">Income</th><th class="num">Spending</th><th class="num">To goals</th><th class="num">Left over</th></tr></thead><tbody>
    ${data
      .slice()
      .reverse()
      .map(
        (d) => `<tr><td>${esc(monthLabel(d.key, { short: true }))}${d.partial ? ' <span class="muted">(so far)</span>' : ''}</td><td class="num">${esc(money(d.income, { cents: false }))}</td><td class="num">${esc(
          money(d.expense, { cents: false })
        )}</td><td class="num">${esc(money(d.savings, { cents: false }))}</td><td class="num ${d.net < 0 ? 'neg' : ''}">${esc(money(d.net, { cents: false }))}</td></tr>`
      )
      .join('')}</tbody></table>`;
  return `<article class="card span-8">
    <header class="card-head"><div><h2>Month by month</h2><p class="sub">Income and spending over the last ${data.length} months</p></div>
      <div class="head-tools">
        <div class="legend"><span><i class="lg-rect" style="background:var(--series-1)"></i>Income</span><span><i class="lg-rect" style="background:var(--series-2)"></i>Spending</span></div>
        <button type="button" class="icon-btn" data-toggle-table="trend" aria-pressed="false" title="Show as table">${icon.table}</button>
      </div></header>
    <div class="chart-box" data-chart="trend"></div>
    <div class="table-wrap" data-table="trend" hidden>${table}</div>
  </article>`;
}

function burnCard(sum, daily) {
  const spent = sum.expense.actual;
  const pctMonth = sum.days ? Math.round((sum.daysGone / sum.days) * 100) : 0;
  const sub =
    sum.status === 'current'
      ? `${money(spent, { cents: false })} of ${money(sum.expense.planned, { cents: false })} budget · ${pctMonth}% of the month gone`
      : sum.status === 'past'
        ? `${money(spent, { cents: false })} spent of ${money(sum.expense.planned, { cents: false })} budget`
        : `Starts ${dateLabel(sum.start)}`;
  const table = `<table class="data-table"><thead><tr><th>Day</th><th class="num">Spent that day</th><th class="num">Total so far</th></tr></thead><tbody>
    ${daily
      .filter((d) => !d.future)
      .reverse()
      .map((d) => `<tr><td>${esc(dateLabel(d.date, { weekday: true }))}</td><td class="num">${esc(money(d.day))}</td><td class="num">${esc(money(d.total))}</td></tr>`)
      .join('')}</tbody></table>`;
  return `<article class="card span-7">
    <header class="card-head"><div><h2>Spending through the month</h2><p class="sub">${esc(sub)}</p></div>
      <div class="head-tools"><button type="button" class="icon-btn" data-toggle-table="burn" aria-pressed="false" title="Show as table">${icon.table}</button></div></header>
    <div class="chart-box" data-chart="burn"></div>
    <div class="table-wrap" data-table="burn" hidden>${table}</div>
  </article>`;
}

function upcomingCard(s, sum) {
  const today = todayIso();
  const until = addDays(today, 31);
  const list = s.transactions
    .filter((t) => t.date > today && t.date <= until)
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : b.amount - a.amount))
    .slice(0, 7);
  const body = list.length
    ? `<ul class="tx-list compact">${list
        .map(
          (t) => `<li><button type="button" class="tx-row" data-edit-tx="${esc(t.id)}">
          <span class="avatar">${esc(txEmoji(s, t))}</span>
          <span class="tx-main"><span class="tx-title truncate">${esc(txTitle(s, t))}</span><span class="tx-sub">${esc(dayHeading(t.date))}${t.recurringId ? ` · <i class="inline-icon">${icon.repeat}</i>` : ''}</span></span>
          ${txAmount(t)}</button></li>`
        )
        .join('')}</ul>`
    : `<div class="empty-mini"><p>Nothing due in the next 30 days.</p><a class="btn btn-ghost btn-sm" href="#/recurring">Add rent, debit orders, subscriptions</a></div>`;
  return `<article class="card span-4">
    <header class="card-head"><div><h2>Coming up</h2><p class="sub">Next 30 days</p></div><a class="link-btn" href="#/recurring">Recurring ${icon.chevronRight}</a></header>
    ${body}
  </article>`;
}

function goalsCard(s) {
  const goals = s.goals.filter((g) => !g.archived);
  const body = goals.length
    ? `<ul class="goal-mini">${goals
        .slice(0, 4)
        .map((g) => {
          const p = goalProgress(s, g);
          return `<li><a href="#/goals" class="goal-mini-row">${ring(p.pct, { size: 48, stroke: 6, label: `${g.name} ${percent(p.pct, 1)}` })}
            <span class="tx-main"><span class="tx-title truncate">${esc(g.emoji)} ${esc(g.name)}</span>
            <span class="tx-sub">${esc(money(p.saved, { cents: false }))} of ${esc(money(p.target, { cents: false }))}</span></span>
            <strong class="goal-pct">${esc(percent(p.pct, 1))}</strong></a></li>`;
        })
        .join('')}</ul>`
    : `<div class="empty-mini"><p>Saving for something? Give it a goal and watch it grow.</p><a class="btn btn-ghost btn-sm" href="#/goals">Add a goal</a></div>`;
  return `<article class="card span-6">
    <header class="card-head"><div><h2>Goals</h2><p class="sub">Your savings progress</p></div><a class="link-btn" href="#/goals">All goals ${icon.chevronRight}</a></header>
    ${body}
  </article>`;
}

function recentCard(s, sum) {
  const today = todayIso();
  const list = sum.transactions
    .filter((t) => t.date <= today)
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : (b.createdAt || '').localeCompare(a.createdAt || '')))
    .slice(0, 6);
  const body = list.length
    ? `<ul class="tx-list compact">${list
        .map(
          (t) => `<li><button type="button" class="tx-row" data-edit-tx="${esc(t.id)}">
          <span class="avatar">${esc(txEmoji(s, t))}</span>
          <span class="tx-main"><span class="tx-title truncate">${esc(txTitle(s, t))}</span><span class="tx-sub">${esc(dayHeading(t.date))}</span></span>
          ${txAmount(t)}</button></li>`
        )
        .join('')}</ul>`
    : `<div class="empty-mini"><p>No transactions this month yet.</p><button type="button" class="btn btn-primary btn-sm" data-add>${icon.plus}<span>Add one</span></button></div>`;
  return `<article class="card span-6">
    <header class="card-head"><div><h2>Recent</h2><p class="sub">Latest transactions</p></div><a class="link-btn" href="#/transactions">All ${icon.chevronRight}</a></header>
    ${body}
  </article>`;
}

export function renderDashboard({ state: s, period }) {
  const sum = summarize(s, period);
  const daily = dailySpending(s, period);
  const first = firstPeriodWithData(s);
  let count = 12;
  if (first) {
    const [fy, fm] = first.split('-').map(Number);
    const [py, pm] = period.split('-').map(Number);
    count = Math.max(6, Math.min(12, (py - fy) * 12 + (pm - fm) + 1));
  }
  const data = trend(s, period, count).map((d) => ({ ...d, partial: d.key === period && sum.status === 'current' }));

  const html = `
    <section class="grid">
      ${heroCard(sum)}
      ${burnCard(sum, daily)}
      ${kpis(sum)}
      ${budgetCard(sum)}
      ${categoryCard(sum)}
      ${trendCard(data)}
      ${upcomingCard(s, sum)}
      ${goalsCard(s)}
      ${recentCard(s, sum)}
    </section>`;

  return {
    html,
    mount(root) {
      const burn = root.querySelector('[data-chart="burn"]');
      if (burn) burnChart(burn, daily, sum.expense.planned);
      const tr = root.querySelector('[data-chart="trend"]');
      if (tr) trendChart(tr, data);
    },
  };
}

export { txTitle, txEmoji };
