// Takes the README screenshots with headless Chrome (no extra packages).
// Start the app first (npm run serve), then: node tools/screenshots.mjs
// Also checks that offline mode (the service worker) works in real Chrome.
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(here, '..', 'docs', 'screenshots');
const BASE = process.env.BASE || 'http://localhost:4848';
const PORT = 9333;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const { existsSync } = await import('node:fs');
  const chrome = [process.env.CHROME, 'C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', '/usr/bin/google-chrome'].find((p) => p && existsSync(p));
  if (!chrome) throw new Error('Chrome or Edge not found. Set CHROME=path');
  await fs.mkdir(OUT, { recursive: true });
  const profile = await fs.mkdtemp(path.join(os.tmpdir(), 'mali-shots-'));
  const proc = spawn(chrome, [`--headless=new`, `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check', '--hide-scrollbars', '--force-color-profile=srgb', 'about:blank'], { stdio: 'ignore' });
  try {
    let version;
    for (let i = 0; i < 50 && !version; i++) {
      try {
        version = await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json();
      } catch {
        await sleep(200);
      }
    }
    const target = await (await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: 'PUT' })).json();
    const cdp = await connect(target.webSocketDebuggerUrl);
    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');

    const shot = async (name, url, { width = 1440, height = 900, mobile = false, scale = 1, dark = false, full = true, wait = 1400, before = null } = {}) => {
      await cdp.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: scale, mobile });
      await cdp.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: dark ? 'dark' : 'light' }] });
      await cdp.send('Page.navigate', { url: 'about:blank' });
      await sleep(150);
      await cdp.send('Page.navigate', { url });
      await sleep(wait);
      if (before) {
        await cdp.send('Runtime.evaluate', { expression: before, awaitPromise: true });
        await sleep(500);
      }
      let clip;
      if (full) {
        const { cssContentSize } = await cdp.send('Page.getLayoutMetrics');
        const h = Math.ceil(cssContentSize.height);
        await cdp.send('Emulation.setDeviceMetricsOverride', { width, height: h, deviceScaleFactor: scale, mobile });
        await sleep(400);
        clip = { x: 0, y: 0, width, height: h, scale: 1 };
      }
      const { data } = await cdp.send('Page.captureScreenshot', { format: 'png', ...(clip ? { clip, captureBeyondViewport: true } : {}) });
      const file = path.join(OUT, `${name}.png`);
      await fs.writeFile(file, Buffer.from(data, 'base64'));
      console.log('saved', path.relative(process.cwd(), file));
    };

    const only = process.argv.slice(2);
    const want = (n) => !only.length || only.includes(n);
    const demo = `${BASE}/?demo=1&shot=1`;
    if (want('dashboard')) await shot('dashboard', `${demo}#/dashboard`);
    if (want('dashboard-dark')) await shot('dashboard-dark', `${demo}#/dashboard`, { dark: true });
    if (want('budget')) await shot('budget', `${demo}#/budget`, { height: 900 });
    if (want('transactions')) await shot('transactions', `${demo}#/transactions`, { full: false });
    if (want('goals')) await shot('goals', `${demo}#/goals`);
    if (want('recurring')) await shot('recurring', `${demo}#/recurring`);
    if (want('add')) await shot('add-transaction', `${demo}#/transactions?add=1`, { full: false });
    if (want('phone')) await shot('phone-dashboard', `${demo}#/dashboard`, { width: 390, height: 844, mobile: true, scale: 2, full: false });
    if (want('phone-dark')) await shot('phone-dashboard-dark', `${demo}#/dashboard`, { width: 390, height: 844, mobile: true, scale: 2, full: false, dark: true });
    if (want('phone-add')) await shot('phone-add', `${demo}#/transactions?add=1`, { width: 390, height: 844, mobile: true, scale: 2, full: false });
    if (want('phone-budget')) await shot('phone-budget', `${demo}#/budget`, { width: 390, height: 844, mobile: true, scale: 2, full: false });
    if (want('mine')) await shot('my-data-dashboard', `${BASE}/?shot=1#/dashboard`);

    if (want('offline')) {
      // Real-Chrome check that the app opens with no network once it has been visited.
      await cdp.send('Emulation.clearDeviceMetricsOverride');
      await cdp.send('Page.navigate', { url: `${BASE}/#/dashboard` });
      await sleep(2500);
      const sw = await cdp.send('Runtime.evaluate', {
        expression: `navigator.serviceWorker.ready.then(r => r.active && r.active.state)`,
        awaitPromise: true,
        returnByValue: true,
      });
      await cdp.send('Network.enable');
      await cdp.send('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
      await cdp.send('Page.reload', { ignoreCache: false });
      await sleep(2500);
      const ok = await cdp.send('Runtime.evaluate', {
        expression: `JSON.stringify({ title: document.title, hasShell: !!document.querySelector('.sidebar') || !!document.querySelector('.welcome'), online: navigator.onLine })`,
        returnByValue: true,
      });
      await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
      const inst = await cdp.send('Page.getInstallabilityErrors');
      const manifest = await cdp.send('Page.getAppManifest');
      console.log('service worker:', sw.result.value, '| offline reload:', ok.result.value);
      console.log('installable:', inst.installabilityErrors.length ? JSON.stringify(inst.installabilityErrors) : 'yes', '| manifest:', manifest.url, manifest.errors.length ? JSON.stringify(manifest.errors) : 'no errors');
    }
    cdp.close();
  } finally {
    proc.kill();
    await sleep(500);
    await fs.rm(profile, { recursive: true, force: true }).catch(() => {});
  }
}

function connect(url) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    let id = 0;
    const pending = new Map();
    ws.onmessage = (e) => {
      const msg = JSON.parse(e.data);
      if (msg.id && pending.has(msg.id)) {
        const { res, rej } = pending.get(msg.id);
        pending.delete(msg.id);
        msg.error ? rej(new Error(msg.error.message)) : res(msg.result);
      }
    };
    ws.onerror = reject;
    ws.onopen = () =>
      resolve({
        send(method, params = {}) {
          return new Promise((res, rej) => {
            pending.set(++id, { res, rej });
            ws.send(JSON.stringify({ id, method, params }));
          });
        },
        close: () => ws.close(),
      });
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
