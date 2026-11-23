import { store } from './store.js';
import { esc, icon, toast, openSheet, confirmDialog, download, pickFile, captureFocus, restoreFocus, $, $$ } from './ui.js';
import * as F from './format.js';
import * as M from './model.js';
import * as A from './actions.js';
import { openTxEditor, openCategoryEditor, openRecurringEditor, openGoalEditor } from './editors.js';
import { transactionsCsv, budgetCsv, backupJson, planImport, applyImport, validateBackup } from './csv.js';
import { sampleState } from './sample.js';
import { renderDashboard } from './views/dashboard.js';
import { renderTransactions, txFilters } from './views/transactions.js';
import { renderBudget } from './views/budget.js';
import { renderRecurring, SUGGESTIONS } from './views/recurring.js';
import { renderGoals } from './views/goals.js';
import { renderSettings, installState } from './views/settings.js';
import { renderOnboarding, mountOnboarding } from './views/onboarding.js';

const ROUTES = {
  dashboard: { title: 'Overview', icon: 'home', render: renderDashboard },
  transactions: { title: 'Transactions', icon: 'list', render: renderTransactions },
  budget: { title: 'Budget', icon: 'wallet', render: renderBudget },
  recurring: { title: 'Recurring', icon: 'repeat', render: renderRecurring, noPeriod: true },
  goals: { title: 'Goals', icon: 'target', render: renderGoals, noPeriod: true },
  settings: { title: 'Settings', icon: 'settings', render: renderSettings },
};
const SIDE_NAV = ['dashboard', 'transactions', 'budget', 'recurring', 'goals', 'settings'];
const BOTTOM_NAV = ['dashboard', 'transactions', 'budget', 'goals'];

const ui = { period: null, route: 'dashboard', shellBuilt: false };
const params = new URLSearchParams(location.search);

function parseHash() {
  const h = location.hash.replace(/^#\/?/, '');
  const [route, query] = h.split('?');
  return { route: ROUTES[route] ? route : 'dashboard', query: new URLSearchParams(query || '') };
}

const sd = () => M.startDayOf(store.state);
const currentKey = () => M.currentPeriod(store.state);

// ---------------------------------------------------------------- theme

function applyTheme() {
  const t = store.state?.settings?.theme || 'system';
  if (t === 'light' || t === 'dark') document.documentElement.setAttribute('data-theme', t);
  else document.documentElement.removeAttribute('data-theme');
}
function isDark() {
  const t = document.documentElement.getAttribute('data-theme');
  return t ? t === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
}

// ---------------------------------------------------------------- shell

function navLink(key, cls) {
  const r = ROUTES[key];
  return `<a href="#/${key}" class="${cls}" data-route="${key}">${icon[r.icon]}<span>${esc(r.title)}</span></a>`;
}

function buildShell() {
  const app = document.getElementById('app');
  app.className = 'app';
  app.removeAttribute('aria-busy');
  app.innerHTML = `
    <aside class="sidebar">
      <a class="brand" href="#/dashboard"><img src="icons/icon.svg" alt="" width="34" height="34"><span>Mali</span></a>
      <button type="button" class="btn btn-primary btn-block" data-add title="Add transaction (N)">${icon.plus}<span>Add transaction</span></button>
      <nav class="side-nav" aria-label="Main">${SIDE_NAV.map((k) => navLink(k, 'side-link')).join('')}</nav>
      <div class="side-foot">
        <div class="save-state" data-save-state></div>
        <div class="privacy">${icon.lock}<span>Private. Stays on this device.</span></div>
      </div>
    </aside>
    <div class="main-wrap">
      <header class="topbar">
        <div class="title-block"><h1 data-title></h1><p class="subtitle" data-subtitle></p></div>
        <div class="top-tools">
          <div class="period-switch" data-period-switch>
            <button type="button" class="ps-btn" data-period="-1" aria-label="Previous month">${icon.chevronLeft}</button>
            <button type="button" class="ps-label" data-period="0" title="Back to this month"></button>
            <button type="button" class="ps-btn" data-period="1" aria-label="Next month">${icon.chevronRight}</button>
          </div>
          <button type="button" class="icon-btn hide-sm" data-theme-toggle aria-label="Switch light or dark"></button>
        </div>
      </header>
      <div data-banner></div>
      <main class="view" id="view" tabindex="-1"></main>
    </div>
    <nav class="bottom-nav" aria-label="Main">
      ${BOTTOM_NAV.map((k) => navLink(k, 'bn-link')).join('')}
      <button type="button" class="bn-link" data-more>${icon.more}<span>More</span></button>
    </nav>
    <button type="button" class="fab" data-add aria-label="Add transaction">${icon.plus}</button>`;
  ui.shellBuilt = true;
}

function subtitleFor(route) {
  const { start, end } = M.periodRange(ui.period, sd());
  const range = `${F.dateLabel(start, { year: false })} – ${F.dateLabel(end, { year: true })}`;
  const status = M.periodStatus(ui.period, sd());
  if (route === 'recurring') return 'Bills, debit orders, subscriptions and salary';
  if (route === 'goals') return 'What you are saving for';
  if (route === 'settings') return 'Your data, exports and preferences';
  if (status === 'current') {
    const left = F.daysBetween(F.todayIso(), end) + 1;
    return `${range} · ${left} day${left === 1 ? '' : 's'} left`;
  }
  return `${range} · ${status === 'past' ? 'closed' : 'coming up'}`;
}

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}

function banner() {
  const s = store.state;
  if (store.ephemeral) return `<div class="banner">${icon.info}<span>You are looking at sample data. Nothing is saved.</span><a class="btn btn-sm btn-light" href="./">Open my budget</a></div>`;
  if (s.demo) return `<div class="banner">${icon.sparkle}<span>This is sample data so you can look around.</span><button type="button" class="btn btn-sm btn-light" data-start-fresh>Start my own budget</button></div>`;
  return '';
}

// ---------------------------------------------------------------- render

let renderQueued = false;
function render() {
  if (renderQueued) return;
  renderQueued = true;
  queueMicrotask(() => {
    renderQueued = false;
    renderNow();
  });
}

function renderNow() {
  const s = store.state;
  applyTheme();
  if (!s) {
    ui.shellBuilt = false;
    const app = document.getElementById('app');
    app.className = 'app-welcome';
    app.removeAttribute('aria-busy');
    app.innerHTML = renderOnboarding();
    mountOnboarding(app, { onDone: () => (ui.period = null) });
    return;
  }
  F.setNumberStyle(s.settings.numberStyle);
  if (!ui.shellBuilt) buildShell();
  if (!ui.period) ui.period = currentKey();

  const { route } = parseHash();
  const changedRoute = route !== ui.route;
  ui.route = route;
  const def = ROUTES[route];

  $$('[data-route]').forEach((a) => a.classList.toggle('active', a.dataset.route === route));
  $$('[data-route]').forEach((a) => (a.dataset.route === route ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current')));
  $('[data-title]').textContent = route === 'dashboard' ? greeting() : def.title;
  $('[data-subtitle]').textContent = subtitleFor(route);
  const ps = $('[data-period-switch]');
  ps.hidden = Boolean(def.noPeriod);
  const isCurrent = ui.period === currentKey();
  const label = $('.ps-label', ps);
  label.textContent = F.monthLabel(ui.period, { short: window.innerWidth < 520 });
  label.classList.toggle('is-current', isCurrent);
  $('[data-theme-toggle]').innerHTML = isDark() ? icon.sun : icon.moon;
  $('[data-banner]').innerHTML = banner();
  updateSaveState();

  const focus = captureFocus();
  const view = $('#view');
  const scroll = changedRoute ? 0 : window.scrollY;
  const out = def.render({ state: s, period: ui.period, ui });
  view.innerHTML = out.html;
  view.dataset.route = route;
  if (out.mount) out.mount(view);
  restoreFocus(focus);
  if (changedRoute) {
    window.scrollTo(0, 0);
    view.classList.remove('enter');
    void view.offsetWidth;
    view.classList.add('enter');
  } else window.scrollTo(0, scroll);
}

function updateSaveState() {
  const el = $('[data-save-state]');
  if (!el || !store.state) return;
  if (store.ephemeral) {
    el.innerHTML = `${icon.info}<span>Sample preview, not saved</span>`;
    return;
  }
  el.innerHTML = `<span class="dot-ok"></span><span>Saved ${esc(F.relativeTime(store.state.savedAt))}${store.fileSync ? ' · file copy on' : ''}</span>`;
}
setInterval(updateSaveState, 30000);

function setPeriod(key) {
  ui.period = key;
  if (key > currentKey()) A.prepareMonth(key);
  render();
}

function defaultDate() {
  const status = M.periodStatus(ui.period, sd());
  const { start, end } = M.periodRange(ui.period, sd());
  return status === 'current' ? F.todayIso() : status === 'past' ? end : start;
}

// ---------------------------------------------------------------- exports & imports

function stamp() {
  return F.todayIso();
}

function doExport(kind) {
  const s = store.state;
  if (kind === 'all') {
    download(`mali-transactions-all-${stamp()}.csv`, transactionsCsv(s), 'text/csv;charset=utf-8');
  } else if (kind === 'month') {
    const { start, end } = M.periodRange(ui.period, sd());
    download(`mali-transactions-${ui.period}.csv`, transactionsCsv(s, { start, end }), 'text/csv;charset=utf-8');
  } else if (kind === 'budget') {
    download(`mali-budget-${ui.period}.csv`, budgetCsv(s, ui.period), 'text/csv;charset=utf-8');
  } else if (kind === 'json') {
    download(`mali-backup-${stamp()}.json`, backupJson(s), 'application/json');
    if (!store.ephemeral) store.update((st) => (st.settings.lastBackupAt = new Date().toISOString()), 'backup');
  }
  toast('Saved to your Downloads folder');
}

async function importCsv() {
  const file = await pickFile('.csv,text/csv,.txt');
  if (!file) return;
  const text = await file.text();
  const plan = planImport(store.state, text);
  if (!plan.transactions.length) {
    toast(plan.problems[0] || (plan.duplicates ? `Nothing new: ${plan.duplicates} rows were already here.` : 'No transactions found in that file.'), { tone: 'error', timeout: 6000 });
    return;
  }
  const counts = { expense: 0, income: 0, savings: 0 };
  for (const t of plan.transactions) counts[t.type]++;
  const { el, close } = openSheet({
    title: 'Import transactions',
    body: `<div class="import-summary">
        <p class="big-number">${plan.transactions.length}</p><p>transactions from <strong>${esc(F.dateLabel(plan.range.start, { year: true }))}</strong> to <strong>${esc(F.dateLabel(plan.range.end, { year: true }))}</strong></p>
        <ul class="status-list">
          <li>${icon.check}<span>${counts.expense} spending, ${counts.income} income${counts.savings ? `, ${counts.savings} to goals` : ''}</span></li>
          ${plan.newCategories.length ? `<li>${icon.plus}<span>New categories: ${esc(plan.newCategories.map((c) => c.name).join(', '))}</span></li>` : ''}
          ${plan.newGoals.length ? `<li>${icon.plus}<span>New goals: ${esc(plan.newGoals.map((g) => g.name).join(', '))}</span></li>` : ''}
          ${plan.duplicates ? `<li>${icon.info}<span>${plan.duplicates} already in Mali, skipped</span></li>` : ''}
          ${plan.skipped ? `<li>${icon.alert}<span>${plan.skipped} rows without a readable date or amount, skipped</span></li>` : ''}
        </ul></div>`,
    footer: `<button type="button" class="btn btn-ghost" data-close>Cancel</button><button type="button" class="btn btn-primary" data-go>Import</button>`,
  });
  $('[data-go]', el).addEventListener('click', () => {
    store.update((s) => applyImport(s, plan), 'import');
    close();
    ui.period = M.periodOf(plan.range.end, sd());
    render();
    toast(`Imported ${plan.transactions.length} transactions`);
  });
}

async function importJson() {
  const file = await pickFile('.json,application/json');
  if (!file) return;
  let obj;
  try {
    obj = JSON.parse(await file.text());
  } catch {
    return toast('That file is not a Mali backup.', { tone: 'error' });
  }
  const err = validateBackup(obj);
  if (err) return toast(err, { tone: 'error' });
  const when = obj.exportedAt || obj.savedAt;
  const ok = await confirmDialog(
    `Replace everything in Mali with this backup${when ? ` from ${F.dateLabel(String(when).slice(0, 10), { year: true })}` : ''}? It has ${obj.transactions.length} transactions.`,
    { title: 'Restore backup', confirmLabel: 'Replace my data', detail: 'Your current data is kept in this browser as a safety copy until the next restore.' }
  );
  if (!ok) return;
  try {
    localStorage.setItem('mali-budget/v1-before-restore', JSON.stringify(store.state));
  } catch {}
  store.replace(obj, { reason: 'restore' });
  ui.period = currentKey();
  render();
  toast('Backup restored');
}

function openWithdraw(goalId) {
  const g = M.goal(store.state, goalId);
  if (!g) return;
  const { el, close } = openSheet({
    title: `Take money out of ${g.name}`,
    body: `<form class="form" novalidate>
      <div class="amount-field" data-field="amount"><span class="amount-cur">R</span><input name="amount" inputmode="decimal" placeholder="0.00" autofocus aria-label="Amount"></div>
      <div class="row-2"><label class="field"><span class="label">Date</span><input type="date" name="date" value="${esc(F.todayIso())}"></label>
      <label class="field"><span class="label">Note</span><input name="note" maxlength="140" placeholder="What it was for (optional)"></label></div>
      <button type="submit" hidden></button></form>`,
    footer: `<span class="spacer"></span><button type="button" class="btn btn-primary" data-go>Take out</button>`,
  });
  const form = $('form', el);
  const go = () => {
    const amt = F.parseMoney(form.amount.value);
    if (!Number.isFinite(amt) || amt <= 0) {
      $('[data-field="amount"]', el).classList.add('invalid', 'shake');
      return;
    }
    A.saveTransaction({ type: 'savings', amount: -amt, goalId, categoryId: null, date: F.isIsoDate(form.date.value) ? form.date.value : F.todayIso(), note: form.note.value.trim() || 'Withdrawal' });
    close();
    toast(`Took ${F.money(amt)} out of ${g.name}`);
  };
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    go();
  });
  $('[data-go]', el).addEventListener('click', go);
}

function openMore() {
  const { el, close } = openSheet({
    title: 'More',
    body: `<nav class="more-list">
      <a href="#/recurring">${icon.repeat}<span>Recurring</span></a>
      <a href="#/settings">${icon.settings}<span>Settings, export and import</span></a>
      <button type="button" data-theme-toggle-more>${isDark() ? icon.sun : icon.moon}<span>${isDark() ? 'Light' : 'Dark'} mode</span></button>
    </nav>`,
  });
  $$('a', el).forEach((a) => a.addEventListener('click', () => close()));
  $('[data-theme-toggle-more]', el).addEventListener('click', () => {
    toggleTheme();
    close();
  });
}

function toggleTheme() {
  A.setSetting('theme', isDark() ? 'light' : 'dark');
}

async function startFresh() {
  const ok = await confirmDialog('Clear the sample data and set up your own budget?', { title: 'Start my own budget', confirmLabel: 'Clear sample data' });
  if (!ok) return;
  await store.eraseAll();
  ui.period = null;
  location.hash = '#/dashboard';
}

async function eraseAll() {
  const ok = await confirmDialog('Erase every transaction, category, goal and setting from this browser and the data file?', {
    title: 'Erase everything',
    confirmLabel: 'Erase everything',
    detail: 'Download a full backup first if you might want it back. This cannot be undone.',
  });
  if (!ok) return;
  await store.eraseAll();
  ui.period = null;
  location.hash = '#/dashboard';
}

// ---------------------------------------------------------------- events

document.addEventListener('click', async (e) => {
  const t = e.target.closest('button, a, [data-edit-tx]');
  if (!t) return;
  const d = t.dataset;
  const s = store.state;
  if (!s) return;

  if ('add' in d) return openTxEditor({ date: defaultDate() });
  if (d.editTx) {
    const tx = s.transactions.find((x) => x.id === d.editTx);
    if (tx) openTxEditor({ tx });
    return;
  }
  if (d.period != null) {
    const n = Number(d.period);
    return setPeriod(n === 0 ? currentKey() : M.shiftPeriod(ui.period, n));
  }
  if ('themeToggle' in d) return toggleTheme();
  if ('more' in d) return openMore();
  if (d.toggleTable) {
    const card = t.closest('.card');
    const table = $(`[data-table="${d.toggleTable}"]`, card);
    const chart = $(`[data-chart="${d.toggleTable}"]`, card);
    const showTable = table.hidden;
    table.hidden = !showTable;
    chart.hidden = showTable;
    t.setAttribute('aria-pressed', String(showTable));
    t.innerHTML = showTable ? icon.chart : icon.table;
    t.title = showTable ? 'Show as chart' : 'Show as table';
    return;
  }
  if (d.editCat) {
    const cat = M.category(s, d.editCat);
    if (cat) openCategoryEditor({ cat, periodKey: ui.period });
    return;
  }
  if (d.newCat) return openCategoryEditor({ type: d.newCat, periodKey: ui.period });
  if ('copyPlan' in d) return A.copyPlanFromPrevious(ui.period);
  if (d.export) return doExport(d.export);
  if (d.import === 'csv') return importCsv();
  if (d.import === 'json') return importJson();
  if ('newRule' in d) return openRecurringEditor();
  if (d.editRule) {
    const rule = s.recurring.find((r) => r.id === d.editRule);
    if (rule) openRecurringEditor({ rule });
    return;
  }
  if (d.toggleRule) return A.toggleRecurring(d.toggleRule);
  if (d.suggest != null) {
    const sug = SUGGESTIONS[Number(d.suggest)];
    const cat = s.categories.find((c) => c.name === sug.cat && c.type === sug.type);
    return openRecurringEditor({ preset: { name: sug.name, type: sug.type, amount: sug.amount, categoryId: cat?.id || null, startDate: F.todayIso() } });
  }
  if ('newGoal' in d) return openGoalEditor();
  if (d.editGoal) {
    const g = M.goal(s, d.editGoal);
    if (g) openGoalEditor({ g });
    return;
  }
  if (d.contribute) return openTxEditor({ type: 'savings', goalId: d.contribute, date: F.todayIso() });
  if (d.withdraw) return openWithdraw(d.withdraw);
  if ('startFresh' in d) return startFresh();
  if ('erase' in d) return eraseAll();
  if ('install' in d && installState.prompt) {
    installState.prompt.prompt();
    const choice = await installState.prompt.userChoice;
    if (choice.outcome === 'accepted') installState.installed = true;
    installState.prompt = null;
    return render();
  }
  if ('clearFilters' in d) {
    Object.assign(txFilters, { q: '', type: 'all', cat: '' });
    return render();
  }
});

document.addEventListener('change', (e) => {
  const el = e.target;
  if (!store.state) return;
  if (el.dataset.plan) {
    const cents = F.parseMoney(el.value || '0');
    if (!Number.isFinite(cents)) {
      toast('That amount could not be read. Try 1500 or 1 500.00', { tone: 'error' });
      return render();
    }
    return A.setPlanned(ui.period, el.dataset.plan, cents);
  }
  if (el.dataset.filter === 'type') {
    txFilters.type = el.value;
    return render();
  }
  if (el.dataset.filter === 'cat') {
    txFilters.cat = el.value;
    return render();
  }
  if (el.dataset.setting) {
    const key = el.dataset.setting;
    const value = key === 'startDay' ? Number(el.value) : el.value;
    A.setSetting(key, value);
    if (key === 'startDay') {
      ui.period = currentKey();
      store.update((s) => M.materializeThrough(s), 'materialize');
    }
  }
});

let searchTimer;
document.addEventListener('input', (e) => {
  if (e.target.dataset.filter === 'q') {
    clearTimeout(searchTimer);
    const v = e.target.value;
    searchTimer = setTimeout(() => {
      txFilters.q = v.trim();
      render();
    }, 160);
  }
});

// Planned amounts: plain number while editing, pretty rand when not.
document.addEventListener('focusin', (e) => {
  const el = e.target;
  if (!el.dataset || !el.dataset.plan) return;
  const cents = F.parseMoney(el.value || '0');
  el.value = Number.isFinite(cents) && cents ? F.amountInput(cents) : '';
  requestAnimationFrame(() => el.select());
});
document.addEventListener('keydown', (e) => {
  const el = e.target;
  if (el.dataset && el.dataset.plan && e.key === 'Enter') {
    e.preventDefault();
    const inputs = $$('[data-plan]');
    const next = inputs[inputs.indexOf(el) + (e.shiftKey ? -1 : 1)];
    if (next) next.focus();
    else el.blur();
    return;
  }
  if (document.body.classList.contains('has-sheet') || !store.state) return;
  const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) || el.isContentEditable;
  if (typing || e.ctrlKey || e.metaKey || e.altKey) return;
  if (e.key === 'n' || e.key === 'N' || e.key === '+') {
    e.preventDefault();
    openTxEditor({ date: defaultDate() });
  } else if (e.key === '/') {
    e.preventDefault();
    if (ui.route !== 'transactions') location.hash = '#/transactions';
    setTimeout(() => $('[data-filter="q"]')?.focus(), 50);
  } else if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && !ROUTES[ui.route].noPeriod && !el.closest('.chart-box')) {
    setPeriod(M.shiftPeriod(ui.period, e.key === 'ArrowLeft' ? -1 : 1));
  }
});

window.addEventListener('hashchange', () => {
  const { route, query } = parseHash();
  if (route === 'transactions' && query.get('add') === '1' && store.state) {
    history.replaceState(null, '', '#/transactions');
    openTxEditor({ date: F.todayIso() });
  }
  render();
});

let lastW = window.innerWidth;
window.addEventListener('resize', () => {
  if ((lastW < 520) !== (window.innerWidth < 520)) render();
  lastW = window.innerWidth;
});

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  installState.prompt = e;
  if (ui.route === 'settings') render();
});
window.addEventListener('appinstalled', () => {
  installState.installed = true;
  installState.prompt = null;
  toast('Mali is installed');
});
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => render());

// ---------------------------------------------------------------- start

async function boot() {
  const demo = params.get('demo') === '1';
  if (demo && params.get('today') && F.isIsoDate(params.get('today'))) F.setToday(params.get('today'));
  await store.load({ demo: demo ? sampleState() : null });
  store.subscribe((reason) => {
    if (reason === 'erase') ui.period = null;
    render();
  });
  render();
  const { route, query } = parseHash();
  if (route === 'transactions' && query.get('add') === '1' && store.state) openTxEditor({ date: F.todayIso() });
  if ('serviceWorker' in navigator && params.get('shot') !== '1') {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}

boot();
