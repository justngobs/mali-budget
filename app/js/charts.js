// Hand-drawn SVG charts with hover and keyboard tooltips. No libraries.
// Colours come from CSS variables (validated for colour-blind safety in light and dark).
import { esc } from './ui.js';
import { money, moneyShort, monthLabel, dateLabel, percent } from './format.js';
import { budgetState } from './model.js';

const observers = new WeakMap();

/** Draws `draw(width)` into el now and again whenever its width changes. */
function responsive(el, draw) {
  let lastW = 0;
  const run = () => {
    const w = Math.floor(el.clientWidth);
    if (!w || w === lastW) return;
    lastW = w;
    draw(w);
  };
  run();
  if (observers.has(el)) observers.get(el).disconnect();
  const ro = new ResizeObserver(() => run());
  ro.observe(el);
  observers.set(el, ro);
}

function niceStep(raw) {
  if (raw <= 0) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(raw)));
  for (const m of [1, 2, 2.5, 5, 10]) if (m * p >= raw) return m * p;
  return 10 * p;
}

function scaleMax(max, ticks = 4) {
  const step = niceStep(Math.max(max, 1) / ticks);
  return { step, max: Math.max(step, Math.ceil(max / step) * step) };
}

/** Column path: 4px rounded top, square at the baseline. */
function colPath(x, y, w, h) {
  if (h <= 0) return '';
  const r = Math.min(4, w / 2, h);
  const b = y + h;
  return `M${x},${b}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${b}Z`;
}

function tipEl(el) {
  let tip = el.querySelector(':scope > .chart-tip');
  if (!tip) {
    tip = document.createElement('div');
    tip.className = 'chart-tip';
    tip.setAttribute('role', 'presentation');
    el.appendChild(tip);
  }
  return tip;
}

/** rows: [{label, value, color}] — values lead, labels follow (text nodes only). */
function showTip(el, x, y, title, rows) {
  const tip = tipEl(el);
  tip.replaceChildren();
  const h = document.createElement('div');
  h.className = 'tip-title';
  h.textContent = title;
  tip.appendChild(h);
  for (const r of rows) {
    const row = document.createElement('div');
    row.className = 'tip-row';
    const key = document.createElement('span');
    key.className = 'tip-key';
    if (r.color) key.style.background = r.color;
    else key.classList.add('tip-key-none');
    const v = document.createElement('strong');
    v.textContent = r.value;
    const l = document.createElement('span');
    l.className = 'tip-label';
    l.textContent = r.label;
    row.append(key, v, l);
    tip.appendChild(row);
  }
  tip.classList.add('shown');
  const W = el.clientWidth;
  const tw = tip.offsetWidth;
  let left = x + 14;
  if (left + tw > W - 4) left = x - tw - 14;
  if (left < 4) left = 4;
  tip.style.left = `${left}px`;
  tip.style.top = `${Math.max(0, y)}px`;
}

function hideTip(el) {
  const tip = el.querySelector(':scope > .chart-tip');
  if (tip) tip.classList.remove('shown');
}

// ---------------------------------------------------------------- month-by-month columns

/**
 * data: [{key, income, expense, savings, net, partial}] — two series, one shared rand axis.
 */
export function trendChart(el, data) {
  responsive(el, (W) => {
    const H = 248;
    const m = { l: 58, r: 6, t: 14, b: 30 };
    const pw = W - m.l - m.r;
    const ph = H - m.t - m.b;
    const top = Math.max(...data.map((d) => Math.max(d.income, d.expense)), 0);
    const { step, max } = scaleMax(top);
    const y = (v) => m.t + ph - (Math.max(0, v) / max) * ph;
    const band = pw / data.length;
    const colW = Math.max(3, Math.min(20, (band - 10) / 2));
    const gap = 2;
    const showEvery = band < 30 ? 3 : band < 44 ? 2 : 1;

    let grid = '';
    for (let v = 0; v <= max + 1; v += step) {
      const yy = Math.round(y(v)) + 0.5;
      grid += `<line class="${v === 0 ? 'axis' : 'grid'}" x1="${m.l}" x2="${W - m.r}" y1="${yy}" y2="${yy}"/>`;
      grid += `<text class="tick" x="${m.l - 10}" y="${yy + 4}" text-anchor="end">${esc(moneyShort(v))}</text>`;
    }
    let cols = '';
    let labels = '';
    let hits = '';
    data.forEach((d, i) => {
      const cx = m.l + band * i + band / 2;
      const x1 = cx - gap / 2 - colW;
      const x2 = cx + gap / 2;
      cols += `<path class="col s1 ${d.partial ? 'partial' : ''}" d="${colPath(x1, y(d.income), colW, y(0) - y(d.income))}"/>`;
      cols += `<path class="col s2 ${d.partial ? 'partial' : ''}" d="${colPath(x2, y(d.expense), colW, y(0) - y(d.expense))}"/>`;
      if (i % showEvery === (data.length - 1) % showEvery) {
        labels += `<text class="tick ${d.partial ? 'tick-strong' : ''}" x="${cx}" y="${H - 9}" text-anchor="middle">${esc(monthLabel(d.key, { short: true, year: false }))}</text>`;
      }
      hits += `<rect class="hit" data-i="${i}" x="${m.l + band * i}" y="${m.t}" width="${band}" height="${ph}" tabindex="0"
        aria-label="${esc(`${monthLabel(d.key)}: income ${money(d.income)}, spending ${money(d.expense)}`)}"/>`;
    });
    el.innerHTML = `<svg class="chart" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="Income and spending by month">
      <g>${grid}</g><rect class="band-hl" x="0" y="${m.t}" width="${band}" height="${ph}" opacity="0"/>
      <g>${cols}</g><g>${labels}</g><g>${hits}</g></svg>`;

    const hl = el.querySelector('.band-hl');
    const show = (i) => {
      const d = data[i];
      hl.setAttribute('x', m.l + band * i);
      hl.setAttribute('opacity', '1');
      const x = m.l + band * i + band / 2;
      showTip(el, x, m.t, `${monthLabel(d.key)}${d.partial ? ' (so far)' : ''}`, [
        { label: 'Income', value: money(d.income, { cents: false }), color: 'var(--series-1)' },
        { label: 'Spending', value: money(d.expense, { cents: false }), color: 'var(--series-2)' },
        { label: 'To goals', value: money(d.savings, { cents: false }) },
        { label: d.net >= 0 ? 'Left over' : 'Overspent', value: money(d.net, { cents: false }) },
      ]);
    };
    const hide = () => {
      hl.setAttribute('opacity', '0');
      hideTip(el);
    };
    el.querySelectorAll('.hit').forEach((r) => {
      const i = Number(r.dataset.i);
      r.addEventListener('pointerenter', () => show(i));
      r.addEventListener('focus', () => show(i));
      r.addEventListener('blur', hide);
    });
    el.querySelector('svg').addEventListener('pointerleave', hide);
  });
}

// ---------------------------------------------------------------- spending through the month

/**
 * daily: [{date, total, day, future}], budget: planned spending for the month (cents).
 * One series (spending so far) against a single reference line (even budget pace).
 */
export function burnChart(el, daily, budget) {
  responsive(el, (W) => {
    const H = 196;
    const m = { l: 58, r: 14, t: 16, b: 28 };
    const pw = W - m.l - m.r;
    const ph = H - m.t - m.b;
    const past = daily.filter((d) => !d.future);
    const lastTotal = past.length ? past[past.length - 1].total : 0;
    const { step, max } = scaleMax(Math.max(budget, lastTotal, 1), 3);
    const n = daily.length;
    const x = (i) => m.l + (n <= 1 ? 0 : (i / (n - 1)) * pw);
    const y = (v) => m.t + ph - (Math.max(0, v) / max) * ph;

    let grid = '';
    for (let v = 0; v <= max + 1; v += step) {
      const yy = Math.round(y(v)) + 0.5;
      grid += `<line class="${v === 0 ? 'axis' : 'grid'}" x1="${m.l}" x2="${W - m.r}" y1="${yy}" y2="${yy}"/>`;
      grid += `<text class="tick" x="${m.l - 10}" y="${yy + 4}" text-anchor="end">${esc(moneyShort(v))}</text>`;
    }
    const ticks = [0, Math.floor((n - 1) / 2), n - 1].filter((v, i, a) => a.indexOf(v) === i);
    let xl = '';
    for (const i of ticks) {
      xl += `<text class="tick" x="${x(i)}" y="${H - 8}" text-anchor="${i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle'}">${esc(dateLabel(daily[i].date))}</text>`;
    }

    let line = '';
    let area = '';
    if (past.length) {
      const pts = past.map((d, i) => `${x(i).toFixed(1)},${y(d.total).toFixed(1)}`);
      line = `<path class="line s2" d="M${pts.join('L')}"/>`;
      area = `<path class="area s2" d="M${x(0)},${y(0)}L${pts.join('L')}L${x(past.length - 1)},${y(0)}Z"/>`;
    }
    const pace = budget > 0 ? `<line class="pace" x1="${x(0)}" y1="${y(0)}" x2="${x(n - 1)}" y2="${y(budget)}"/>
      <text class="pace-label" x="${x(n - 1) - 2}" y="${y(budget) - 8}" text-anchor="end">Budget ${esc(moneyShort(budget))}</text>` : '';
    const endI = past.length - 1;
    const dot = endI >= 0 ? `<circle class="dot s2" cx="${x(endI)}" cy="${y(lastTotal)}" r="4.5"/>` : '';

    el.innerHTML = `<svg class="chart" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="Spending so far this month against an even budget pace">
      <g>${grid}</g>${pace}${area}${line}
      <line class="crosshair" x1="0" x2="0" y1="${m.t}" y2="${m.t + ph}" opacity="0"/>
      <circle class="dot s2 hover-dot" r="4.5" cx="-20" cy="-20"/>
      ${dot}<g>${xl}</g>
      <rect class="hit" x="${m.l}" y="${m.t}" width="${pw}" height="${ph}" tabindex="0" aria-label="Spending by day. Use the arrow keys."/></svg>`;

    const svg = el.querySelector('svg');
    const hit = el.querySelector('.hit');
    const ch = el.querySelector('.crosshair');
    const hd = el.querySelector('.hover-dot');
    let cur = endI >= 0 ? endI : 0;
    const show = (i) => {
      cur = Math.max(0, Math.min(n - 1, i));
      const d = daily[cur];
      const xx = x(cur);
      ch.setAttribute('x1', xx);
      ch.setAttribute('x2', xx);
      ch.setAttribute('opacity', '1');
      const rows = [];
      if (!d.future) {
        hd.setAttribute('cx', xx);
        hd.setAttribute('cy', y(d.total));
        rows.push({ label: 'spent so far', value: money(d.total, { cents: false }), color: 'var(--series-2)' });
        rows.push({ label: 'spent this day', value: money(d.day, { cents: false }) });
      } else {
        hd.setAttribute('cx', -20);
        rows.push({ label: 'not yet', value: 'Still to come' });
      }
      if (budget > 0) rows.push({ label: 'even pace', value: money(Math.round((budget * (cur + 1)) / n), { cents: false }) });
      showTip(el, xx, m.t, dateLabel(d.date, { weekday: true }), rows);
    };
    const hide = () => {
      ch.setAttribute('opacity', '0');
      hd.setAttribute('cx', -20);
      hideTip(el);
    };
    hit.addEventListener('pointermove', (e) => {
      const r = svg.getBoundingClientRect();
      const px = e.clientX - r.left;
      show(Math.round(((px - m.l) / pw) * (n - 1)));
    });
    hit.addEventListener('pointerleave', hide);
    hit.addEventListener('focus', () => show(cur));
    hit.addEventListener('blur', hide);
    hit.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        e.preventDefault();
        show(cur + (e.key === 'ArrowLeft' ? -1 : 1));
      }
    });
  });
}

// ---------------------------------------------------------------- small figures

/** Progress ring for goals. pct 0..1 */
export function ring(pct, { size = 64, stroke = 7, label = '' } = {}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const off = c * (1 - Math.max(0, Math.min(1, pct)));
  return `<svg class="ring" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" role="img" aria-label="${esc(label || percent(pct, 1))}">
    <circle class="ring-track" cx="${size / 2}" cy="${size / 2}" r="${r}" stroke-width="${stroke}"/>
    <circle class="ring-fill" cx="${size / 2}" cy="${size / 2}" r="${r}" stroke-width="${stroke}"
      stroke-dasharray="${c.toFixed(2)}" stroke-dashoffset="${off.toFixed(2)}" transform="rotate(-90 ${size / 2} ${size / 2})"/>
  </svg>`;
}

/**
 * Thin segmented bar (no text): the list beside it carries the names and amounts.
 * parts: [{value, color, label}], total: the whole (unfilled remainder shows as track).
 */
export function segBar(parts, total, { className = '' } = {}) {
  const sum = parts.reduce((a, p) => a + Math.max(0, p.value), 0);
  const whole = Math.max(total, sum, 1);
  const segs = parts
    .filter((p) => p.value > 0)
    .map((p) => `<span class="seg" style="flex-basis:${((p.value / whole) * 100).toFixed(3)}%;background:${p.color}" title="${esc(`${p.label}: ${money(p.value)}`)}"></span>`)
    .join('');
  return `<div class="segbar ${className}" role="img" aria-label="${esc(parts.map((p) => `${p.label} ${money(p.value)}`).join(', '))}">${segs}</div>`;
}

/** Meter: fill against a limit. Severity colours carry state and always come with a label. */
export function meter(value, limit, { tone = null } = {}) {
  const pct = limit > 0 ? Math.min(1, Math.max(0, value / limit)) : value > 0 ? 1 : 0;
  const st = budgetState(value, limit);
  const state = tone || (st === 'unplanned' ? 'over' : st === 'full' ? 'ok' : st);
  return `<div class="meter meter-${state}"><span style="width:${(pct * 100).toFixed(2)}%"></span></div>`;
}
