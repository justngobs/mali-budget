// Saving and loading. Every change is saved at once in this browser
// (localStorage). When the local server is running it also keeps a copy in
// data/budget.json, so clearing the browser never loses your budget.
import { migrate, materializeThrough } from './model.js';

const KEY = 'mali-budget/v1';
const listeners = new Set();

let state = null;
let ephemeral = false; // sample data opened with ?demo=1 is never saved
let fileSync = false; // true when served by serve.mjs with /api/data
let pushTimer = null;
let pushing = false;
let lastPushOk = null;
let lastError = null;

export const store = {
  get state() {
    return state;
  },
  get ephemeral() {
    return ephemeral;
  },
  get fileSync() {
    return fileSync;
  },
  get lastPushOk() {
    return lastPushOk;
  },
  get lastError() {
    return lastError;
  },

  subscribe(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },

  /** Load from this browser and the data file, whichever is newer. */
  async load({ demo = null } = {}) {
    if (demo) {
      ephemeral = true;
      state = migrate(demo);
      return state;
    }
    const local = readLocal();
    const remote = await readRemote();
    let chosen = local;
    if (remote && (!local || (remote.savedAt || '') > (local.savedAt || ''))) chosen = remote;
    state = chosen ? migrate(chosen) : null;
    if (state) {
      writeLocal(state);
      if (fileSync && remote !== chosen) schedulePush(0);
      materializeAndSave();
    }
    askPersistent();
    watchOtherCopies();
    return state;
  },

  /** Replace everything (onboarding, restore from backup, sample data). */
  replace(next, { reason = 'replace' } = {}) {
    state = migrate(next);
    materializeThrough(state);
    commit(reason);
  },

  /** Change the state in place, then save and redraw. */
  update(fn, reason = 'update') {
    if (!state) return;
    fn(state);
    commit(reason);
  },

  /** Wipe this browser's copy and the data file. */
  async eraseAll() {
    state = null;
    try {
      localStorage.removeItem(KEY);
    } catch {}
    if (fileSync) {
      try {
        await fetch('api/data', { method: 'DELETE' });
      } catch {}
    }
    emit('erase');
  },

  flush() {
    if (pushTimer) {
      clearTimeout(pushTimer);
      pushTimer = null;
      push();
    }
  },
};

function commit(reason) {
  state.savedAt = new Date().toISOString();
  if (!ephemeral) {
    writeLocal(state);
    schedulePush();
  }
  emit(reason);
}

function emit(reason) {
  for (const fn of listeners) {
    try {
      fn(reason);
    } catch (e) {
      console.error(e);
    }
  }
}

function materializeAndSave() {
  const added = materializeThrough(state);
  if (added) {
    state.savedAt = new Date().toISOString();
    writeLocal(state);
    schedulePush();
  }
}

function readLocal() {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    console.warn('Could not read saved data', e);
    return null;
  }
}

function writeLocal(s) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
    lastError = null;
  } catch (e) {
    lastError = 'This browser would not save (storage full or blocked). Export a backup now.';
    console.error(e);
  }
}

async function readRemote() {
  try {
    const res = await fetch('api/data', { cache: 'no-store', signal: AbortSignal.timeout(2500) });
    if (res.status === 204) {
      fileSync = true;
      return null;
    }
    if (res.ok && (res.headers.get('content-type') || '').includes('json')) {
      fileSync = true;
      return await res.json();
    }
  } catch {
    /* offline, or hosted without the local server */
  }
  fileSync = false;
  return null;
}

function schedulePush(delay = 700) {
  if (!fileSync || ephemeral) return;
  clearTimeout(pushTimer);
  pushTimer = setTimeout(() => {
    pushTimer = null;
    push();
  }, delay);
}

async function push() {
  if (!state || ephemeral || !fileSync) return;
  if (pushing) {
    schedulePush(400);
    return;
  }
  pushing = true;
  try {
    const res = await fetch('api/data', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(state),
      keepalive: JSON.stringify(state).length < 60000,
    });
    lastPushOk = res.ok ? new Date().toISOString() : lastPushOk;
  } catch {
    // The server is not running right now. The browser copy is safe; try again later.
  } finally {
    pushing = false;
  }
}

async function askPersistent() {
  try {
    if (navigator.storage && navigator.storage.persist) await navigator.storage.persist();
  } catch {}
}

function watchOtherCopies() {
  // Another tab in this browser saved something.
  window.addEventListener('storage', (e) => {
    if (e.key !== KEY || !e.newValue) return;
    try {
      const other = JSON.parse(e.newValue);
      if ((other.savedAt || '') > (state?.savedAt || '')) {
        state = migrate(other);
        emit('external');
      }
    } catch {}
  });
  // Another browser on this computer saved to the data file.
  document.addEventListener('visibilitychange', async () => {
    if (document.visibilityState === 'hidden') {
      store.flush();
      return;
    }
    if (!fileSync || pushTimer || pushing) return;
    const remote = await readRemote();
    if (remote && (remote.savedAt || '') > (state?.savedAt || '')) {
      state = migrate(remote);
      writeLocal(state);
      emit('external');
    }
  });
  window.addEventListener('pagehide', () => store.flush());
}
