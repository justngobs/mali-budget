import { esc, icon, $, toast, pickFile } from '../ui.js';
import { parseMoney, ordinal, todayIso, pad, daysInMonth } from '../format.js';
import { emptyState, seedCategories, periodOf, periodRange, uid, ensureOwnPlan } from '../model.js';
import { sampleState } from '../sample.js';
import { validateBackup } from '../csv.js';
import { store } from '../store.js';

export function renderOnboarding() {
  return `
  <main class="welcome">
    <div class="welcome-card">
      <div class="welcome-brand"><img src="icons/icon.svg" alt="" width="56" height="56"><div><h1>Mali</h1><p>Your budget, in rand</p></div></div>
      <p class="welcome-lead">Plan your month, track what goes in and out, and always know what is safe to spend.</p>
      <ul class="welcome-points">
        <li>${icon.lock}<span><strong>Private.</strong> No account, no cloud. Everything stays on this device.</span></li>
        <li>${icon.repeat}<span><strong>Set and forget.</strong> Rent, debit orders and subscriptions fill themselves in.</span></li>
        <li>${icon.download}<span><strong>Yours to keep.</strong> Export to CSV for Google Sheets or LibreOffice any time.</span></li>
      </ul>
      <form class="form welcome-form" novalidate>
        <div class="row-2">
          <label class="field"><span class="label">Monthly take-home pay (optional)</span>
            <div class="input-money"><span>R</span><input name="pay" inputmode="decimal" placeholder="0.00" autocomplete="off"></div></label>
          <label class="field"><span class="label">Payday</span>
            <select name="payday">${Array.from({ length: 31 }, (_, i) => i + 1)
              .map((d) => `<option value="${d}" ${d === 25 ? 'selected' : ''}>${ordinal(d)} of the month</option>`)
              .join('')}</select></label>
        </div>
        <fieldset class="field"><legend class="label">My budget month runs</legend>
          <div class="seg-control">
            <label><input type="radio" name="mode" value="calendar" checked><span>1st to month-end</span></label>
            <label><input type="radio" name="mode" value="payday"><span>Payday to payday</span></label>
          </div>
        </fieldset>
        <div class="welcome-actions">
          <button type="submit" class="btn btn-primary btn-lg">Start my budget</button>
          <button type="button" class="btn btn-ghost btn-lg" data-sample>Look around with sample data</button>
        </div>
        <button type="button" class="link-btn center" data-restore>${icon.upload} Restore from a backup file</button>
      </form>
    </div>
  </main>`;
}

export function mountOnboarding(root, { onDone }) {
  const form = $('form', root);
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const s = seedCategories(emptyState());
    const payday = Number(form.payday.value) || 25;
    const mode = form.querySelector('input[name="mode"]:checked').value;
    s.settings.startDay = mode === 'payday' ? payday : 1;
    const today = todayIso();
    const key = periodOf(today, s.settings.startDay);
    const pay = parseMoney(form.pay.value || '0');
    const plan = ensureOwnPlan(s, key);
    for (const c of s.categories) plan[c.id] = 0;
    if (Number.isFinite(pay) && pay > 0) {
      const salary = s.categories.find((c) => c.name === 'Salary');
      plan[salary.id] = pay;
      // The salary inside this budget month: the period start when budgeting payday to payday.
      let startDate;
      if (mode === 'payday') startDate = periodRange(key, s.settings.startDay).start;
      else {
        const [y, m] = key.split('-').map(Number);
        startDate = `${key}-${pad(Math.min(payday, daysInMonth(y, m)))}`;
      }
      s.recurring.push({
        id: uid(),
        name: 'Salary',
        type: 'income',
        amount: pay,
        categoryId: salary.id,
        goalId: null,
        frequency: 'monthly',
        startDate,
        endDate: null,
        active: true,
        skips: [],
        generatedThrough: null,
      });
    }
    store.replace(s, { reason: 'onboarding' });
    location.hash = '#/budget';
    onDone();
    toast('Now fill in your planned amounts. Click any amount to change it.', { timeout: 7000 });
  });
  $('[data-sample]', root).addEventListener('click', () => {
    store.replace(sampleState(), { reason: 'sample' });
    location.hash = '#/dashboard';
    onDone();
    toast('This is sample data. Clear it in Settings when you are ready.', { timeout: 6000 });
  });
  $('[data-restore]', root).addEventListener('click', async () => {
    const file = await pickFile('.json,application/json');
    if (!file) return;
    try {
      const obj = JSON.parse(await file.text());
      const err = validateBackup(obj);
      if (err) return toast(err, { tone: 'error' });
      store.replace(obj, { reason: 'restore' });
      location.hash = '#/dashboard';
      onDone();
      toast('Backup restored');
    } catch {
      toast('That file could not be read as a backup.', { tone: 'error' });
    }
  });
}
