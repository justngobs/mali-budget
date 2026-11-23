import { esc, icon } from '../ui.js';
import { relativeTime, NUMBER_STYLES, monthLabel, ordinal } from '../format.js';
import { store } from '../store.js';

export const installState = { prompt: null, installed: false };

export function renderSettings({ state: s, period }) {
  const st = s.settings;
  const isLocal = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
  const backupAge = st.lastBackupAt ? relativeTime(st.lastBackupAt) : 'never';
  const html = `
    <section class="settings">
      <article class="card">
        <header class="card-head"><div><h2>Your data</h2><p class="sub">Private by design: no account, no cloud, no tracking.</p></div></header>
        <ul class="status-list">
          <li>${icon.check}<span><strong>Saved in this browser</strong><span class="muted"> · last change ${esc(relativeTime(s.savedAt))}</span></span></li>
          <li>${store.fileSync ? icon.check : icon.info}<span>${
            store.fileSync
              ? `<strong>Also saved to a file on this computer</strong><span class="muted"> · data\\budget.json in the app folder, with daily copies in data\\backups</span>`
              : isLocal
                ? `<strong>Browser copy only</strong><span class="muted"> · start Mali with “Start Budget” on your computer to also keep a file copy</span>`
                : `<strong>Kept in this browser on this device only</strong><span class="muted"> · nothing is sent to the website. Install the app and download a full backup now and then.</span>`
          }</span></li>
          <li>${icon.lock}<span><strong>Nothing leaves this device</strong><span class="muted"> · exports go to your Downloads folder</span></span></li>
          ${store.ephemeral ? `<li>${icon.alert}<span><strong>Sample data preview</strong><span class="muted"> · nothing here is saved</span></span></li>` : ''}
          ${store.lastError ? `<li class="warn">${icon.alert}<span>${esc(store.lastError)}</span></li>` : ''}
        </ul>
      </article>

      <article class="card">
        <header class="card-head"><div><h2>Export</h2><p class="sub">CSV opens in Google Sheets, LibreOffice and Excel. Last full backup: ${esc(backupAge)}.</p></div></header>
        <div class="action-grid">
          <button type="button" class="action-tile" data-export="all">${icon.file}<strong>All transactions</strong><span>CSV, every month</span></button>
          <button type="button" class="action-tile" data-export="month">${icon.calendar}<strong>${esc(monthLabel(period))}</strong><span>CSV, this month’s transactions</span></button>
          <button type="button" class="action-tile" data-export="budget">${icon.table}<strong>Budget summary</strong><span>CSV, planned vs actual for ${esc(monthLabel(period, { short: true }))}</span></button>
          <button type="button" class="action-tile tile-strong" data-export="json">${icon.shield}<strong>Full backup</strong><span>JSON, everything (restore later)</span></button>
        </div>
      </article>

      <article class="card">
        <header class="card-head"><div><h2>Import</h2><p class="sub">Bring in your old spreadsheet or a bank statement.</p></div></header>
        <div class="action-grid">
          <button type="button" class="action-tile" data-import="csv">${icon.upload}<strong>Transactions from CSV</strong><span>Needs Date and Amount columns. Category, Note and Type are used if present. Duplicates are skipped.</span></button>
          <button type="button" class="action-tile" data-import="json">${icon.upload}<strong>Restore a backup</strong><span>Replaces everything with a JSON backup</span></button>
        </div>
        <p class="hint">${icon.info}<span>From Excel: open your .xlsx in Google Sheets or LibreOffice, then File › Download/Save as › CSV.</span></p>
      </article>

      <article class="card">
        <header class="card-head"><div><h2>Preferences</h2></div></header>
        <div class="pref-list">
          <label class="pref"><span><strong>Appearance</strong><span class="muted">Follow your device, or pick one</span></span>
            <select data-setting="theme">
              ${[['system', 'Automatic'], ['light', 'Light'], ['dark', 'Dark']].map(([v, l]) => `<option value="${v}" ${st.theme === v ? 'selected' : ''}>${l}</option>`).join('')}
            </select></label>
          <label class="pref"><span><strong>How rand amounts look</strong><span class="muted">Display only. Exports always use 1234.56</span></span>
            <select data-setting="numberStyle">
              ${Object.entries(NUMBER_STYLES).map(([v, l]) => `<option value="${v}" ${st.numberStyle === v ? 'selected' : ''}>${esc(l)}</option>`).join('')}
            </select></label>
          <label class="pref"><span><strong>Budget month starts</strong><span class="muted">Pick your payday if you budget from payday to payday</span></span>
            <select data-setting="startDay">
              <option value="1" ${Number(st.startDay) <= 1 ? 'selected' : ''}>On the 1st (calendar month)</option>
              ${Array.from({ length: 30 }, (_, i) => i + 2)
                .map((d) => `<option value="${d}" ${Number(st.startDay) === d ? 'selected' : ''}>On the ${ordinal(d)} (payday)</option>`)
                .join('')}
            </select></label>
        </div>
      </article>

      <article class="card">
        <header class="card-head"><div><h2>Install</h2><p class="sub">Use Mali like a normal app, even offline.</p></div></header>
        ${
          installState.installed
            ? `<p class="status status-ok">${icon.check}Installed on this device.</p>`
            : installState.prompt
              ? `<button type="button" class="btn btn-primary" data-install>${icon.install}<span>Install Mali</span></button>`
              : `<ul class="howto">
                  <li><strong>Chrome or Edge on this computer:</strong> click the install icon at the right of the address bar.</li>
                  <li><strong>Android phone:</strong> open Mali in Chrome, tap ⋮, then <em>Add to Home screen</em> (needs an https web address, see the README).</li>
                  <li><strong>iPhone:</strong> open it in Safari, tap Share, then <em>Add to Home Screen</em>.</li>
                </ul>`
        }
      </article>

      <article class="card danger-card">
        <header class="card-head"><div><h2>Start over</h2><p class="sub">Download a full backup first. This cannot be undone.</p></div></header>
        <div class="row-actions">
          ${s.demo ? `<button type="button" class="btn btn-primary" data-start-fresh>Clear sample data and start my own</button>` : ''}
          <button type="button" class="btn btn-danger" data-erase>${icon.trash}<span>Erase everything</span></button>
        </div>
      </article>

      <p class="about muted small">Mali Budget 1.0 · runs on your computer · keyboard: <kbd>N</kbd> add, <kbd>←</kbd> <kbd>→</kbd> change month, <kbd>/</kbd> search</p>
    </section>`;
  return { html };
}
