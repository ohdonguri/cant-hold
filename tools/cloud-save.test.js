// Execute the production save/auth section; only Firestore and browser storage are fake.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { load } = require('./sim');
const html = fs.readFileSync(require('node:path').join(__dirname, '../index.html'), 'utf8');
const source = html.slice(html.indexOf("const SAVE_KEY ="), html.indexOf('// ── 스테이지 선택'));
const stages = load().STAGES;

test('cloud error text fits below login on short and tall screens', () => {
  const g = load();
  g.state.phase = 'stage';
  g.cloud.msg = '저장 거부됨 — 서버 규칙을 확인해야 한다';
  g.cloud.ok = false;
  for (const height of [568, 658, 844]) {
    g.view.h = height;
    g.draws.reset();
    g.render();
    const text = g.draws.geom.find(e => e.m === 'fillText' && e.a[0] === g.cloud.msg);
    assert.ok(text, 'error must be drawn');
    assert.ok(text.a[2] + 14 <= height, `error bottom ${text.a[2] + 14} exceeds ${height}`);
  }
});
const copy = x => structuredClone(x);
const bundle = (unlocked = 1) => ({ v: 3, unlocked, best: [unlocked === 1 ? 0 : 30],
  cleared: [unlocked > 1], run: null });
function deferred() {
  let resolve;
  const promise = new Promise(r => { resolve = r; });
  return { promise, resolve };
}
function server(initial = bundle(6)) {
  const docs = new Map([['alice', copy(initial)]]);
  let gate = null, error = null;
  return {
    docs,
    pause() { gate = deferred(); return gate; },
    fail(value) { error = value; },
    sdk: {
      db: {}, doc: (_, path, uid) => { assert.equal(path, 'games/canthold/saves'); return uid; },
      serverTimestamp: () => 123,
      async getDoc(uid) {
        if (gate) await gate.promise;
        if (error) throw error;
        const value = copy(docs.get(uid));
        return { exists: () => !!value, data: () => value };
      },
      async setDoc(uid, value) { docs.set(uid, copy(value)); },
      async runTransaction(_, fn) {
        // Emulate optimistic retries if a second client commits after our read.
        for (;;) {
          let readUid, before, pending;
          const result = await fn({
            get: async uid => {
              const snap = await this.getDoc(uid);
              readUid = uid; before = JSON.stringify(snap.data()); return snap;
            },
            set: (uid, value) => { pending = [uid, copy(value)]; },
          });
          if (JSON.stringify(docs.get(readUid)) !== before) continue;
          if (pending) docs.set(...pending);
          return result;
        }
      },
    },
  };
}
function client(db, local = bundle()) {
  const storage = new Map();
  const context = vm.createContext({ STAGES: stages, state: { phase: 'stage' },
    localStorage: { getItem: k => storage.get(k), setItem: (k, v) => storage.set(k, v) },
  });
  vm.runInContext(source, context);
  context.sdk = db.sdk;
  context.initial = local;
  vm.runInContext("fb = sdk; cloud.user = { uid: 'alice' }; cloud.ready = true; applyBundle(initial);", context);
  return {
    eval: s => vm.runInContext(s, context),
    local: () => JSON.parse(storage.get('cant-hold-progress')),
  };
}

test('saving while login read is pending cannot erase existing server progress', async () => {
  const db = server(), g = client(db), gate = db.pause();
  const pull = g.eval('cloudPull()');
  const save = g.eval('cloudSave()');
  await new Promise(setImmediate);
  assert.equal(db.docs.get('alice').unlocked, 6);
  gate.resolve();
  await Promise.all([pull, save]);
  assert.equal(db.docs.get('alice').unlocked, 6);
  assert.equal(g.local().unlocked, 6);
});

test('failed server reads never fall back to destructive writes; next save retries', async () => {
  const db = server(), g = client(db);
  db.fail(new Error('unavailable'));
  await g.eval('cloudPull()');
  await g.eval('cloudSave()');
  assert.equal(db.docs.get('alice').unlocked, 6);
  assert.equal(g.eval('cloud.ok'), false);
  db.fail(null);
  await g.eval('cloudSave()');
  assert.equal(g.local().unlocked, 6);
  assert.equal(g.eval('cloud.ok'), true);
});

test('a stale second device preserves newer clears and best waves', async () => {
  const db = server(bundle()), a = client(db), b = client(db);
  await Promise.all([a.eval('cloudPull()'), b.eval('cloudPull()')]);
  a.eval('unlocked = 7; best[5] = 30; cleared[5] = true');
  b.eval('best[0] = 12');
  await Promise.all([a.eval('cloudSave()'), b.eval('cloudSave()')]);
  assert.equal(db.docs.get('alice').unlocked, 7);
  assert.equal(db.docs.get('alice').best[5], 30);
  assert.equal(db.docs.get('alice').cleared[5], true);
});

test('an old account response cannot modify local progress or the new account', async () => {
  const db = server(), g = client(db), gate = db.pause();
  const pending = g.eval('cloudPull()');
  await new Promise(setImmediate);
  g.eval("cloud.user = { uid: 'bob' }");
  gate.resolve();
  await pending;
  assert.equal(g.eval('saveBundle().unlocked'), 1);
  assert.equal(db.docs.has('bob'), false);
});

test('login restores a remote run, but later saves can clear the completed run', async () => {
  const initial = bundle(3); initial.run = { stage: 1, wave: 8 };
  const db = server(initial), g = client(db);
  await g.eval('cloudPull()');
  assert.equal(g.local().run.wave, 8);
  g.eval('savedRun = null');
  await g.eval('cloudSave()');
  assert.equal(db.docs.get('alice').run, null);
});

test('a late login response does not replace a run started while it was loading', async () => {
  const initial = bundle(3); initial.run = { stage: 1, wave: 8 };
  const db = server(initial), g = client(db), gate = db.pause();
  const pending = g.eval('cloudPull()');
  await new Promise(setImmediate);
  g.eval("state.phase = 'build'; savedRun = { stage: 0, wave: 2 }");
  gate.resolve();
  await pending;
  assert.equal(g.eval('saveBundle().run.wave'), 2);
  assert.equal(g.eval('saveBundle().unlocked'), 3);
});

test('queued saves retain progress earned while an earlier write is in flight', async () => {
  const db = server(bundle()), g = client(db), gate = db.pause();
  const first = g.eval('cloudSave()');
  await new Promise(setImmediate);
  g.eval("unlocked = 8; best[6] = 30; cleared[6] = true; savedRun = { stage: 7, wave: 2 }; state.phase = 'build'");
  const second = g.eval('cloudSave()');
  gate.resolve();
  await Promise.all([first, second]);
  assert.equal(db.docs.get('alice').unlocked, 8);
  assert.equal(db.docs.get('alice').run.stage, 7);
  assert.equal(g.local().unlocked, 8);
  assert.equal(g.local().run.stage, 7);
});

test('failed commits preserve local records and do not claim cloud success', async () => {
  const db = server(), g = client(db, bundle(8));
  db.sdk.runTransaction = async () => { throw new Error('permission-denied'); };
  g.eval('saveLocal()');
  await g.eval('cloudSave()');
  assert.equal(db.docs.get('alice').unlocked, 6);
  assert.equal(g.local().unlocked, 8);
  assert.equal(g.eval('cloud.ok'), false);
});

test('choosing a deck before login finishes does not delete the remote resume', async () => {
  const initial = bundle(3); initial.run = { stage: 1, wave: 8 };
  const db = server(initial), g = client(db);
  g.eval("state.phase = 'deck'");
  await g.eval('cloudPull()');
  assert.equal(db.docs.get('alice').run?.wave, 8);
  assert.equal(g.local().run?.wave, 8);
});

test('signing out during login sync releases the busy state', async () => {
  const db = server(), g = client(db), gate = db.pause();
  const pending = g.eval('cloudPull()');
  await new Promise(setImmediate);
  // Exercise the registered auth handler, without importing Firebase in Node.
  const callback = html.match(/fb\.onAuthStateChanged\(fb.auth, (async u => \{[\s\S]*?\n  \})\);/);
  assert.ok(callback, 'auth callback must be exercised');
  await g.eval(`(${callback[1]})(null)`);
  gate.resolve();
  await pending;
  assert.equal(g.eval('cloud.busy'), false);
});
