const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { load } = require('./sim');
const html = fs.readFileSync(require('node:path').join(__dirname, '../index.html'), 'utf8');

function setup() {
  const nodes = [];
  const param = () => ({ value: 0, setValueAtTime(v) { this.value = v; },
    linearRampToValueAtTime(v) { this.value = v; }, exponentialRampToValueAtTime(v) { this.value = v; },
    cancelScheduledValues() {} });
  const node = () => {
    const n = { gain: param(), frequency: param(), Q: param(), connect() {},
      disconnect() { this.disconnected = true; }, start(t) { this.started = t; },
      stop(t) { this.stopped = t; } };
    nodes.push(n); return n;
  };
  const actx = { currentTime: 0, state: 'running', sampleRate: 8000,
    createGain: node, createOscillator: node, createBufferSource: node, createBiquadFilter: node,
    createBuffer: (_, length) => ({ getChannelData: () => new Float32Array(length) }) };
  const c = vm.createContext({ actx, comp: node(), soundEnabled: true,
    document: { hidden: false }, state: { stage: 0, wave: 1, phase: 'wave', paused: false, speed: 1 },
    STAGES: load().STAGES });
  const themeStart = html.indexOf('const STAGE_THEMES =');
  vm.runInContext(html.slice(themeStart, html.indexOf('// A separate animation clock', themeStart)), c);
  const start = html.indexOf('// ── 테마별 BGM');
  if (start >= 0) vm.runInContext(html.slice(start, html.indexOf('function update(dt)', start)), c);
  const run = s => vm.runInContext(s, c);
  assert.equal(run('typeof bgmTick'), 'function', 'production BGM scheduler must exist');
  return { c, run, nodes, actx };
}

test('all 20 stages map to seven themes, with three arrangements and distinct scores', () => {
  const { run } = setup();
  assert.equal(run('new Set(STAGES.map((_, i) => bgmProfile(i).family)).size'), 7);
  assert.equal(run('new Set(STAGES.map((_, i) => bgmProfile(i).variant)).size'), 3);
  assert.equal(run('new Set(Object.values(BGM_THEMES).map(t => JSON.stringify(t.notes))).size'), 7);
  assert.equal(run('bgmProfile(0).family === bgmProfile(2).family'), true);
  assert.notEqual(run('bgmProfile(0).variant'), run('bgmProfile(2).variant'));
});

test('late waves add layers; arrangements alter the actual note sequence', () => {
  const { run } = setup();
  run('var score = (v, n) => Array.from({length: 128}, (_, s) => bgmPattern(BGM_THEMES.grassland, s, v, n)).flat()');
  assert.ok(run('score(0, 2).length > score(0, 0).length'));
  assert.notEqual(run('JSON.stringify(score(0, 2))'), run('JSON.stringify(score(1, 2))'));
  assert.notEqual(run('JSON.stringify(score(1, 2))'), run('JSON.stringify(score(2, 2))'));
});

test('every arrangement retains seven different percussion grooves and instrument palettes', () => {
  const { run } = setup();
  // Ignore pitch: changing notes must not disguise an identical beat.
  for (let variant = 0; variant < 3; variant++) {
    const signatures = run(`Object.values(BGM_THEMES).map(theme => {
      const events = Array.from({length: theme.steps || 16}, (_, step) =>
        bgmPattern(theme, step, ${variant}, 2).filter(n =>
          !['pad', 'lead', 'bass', 'pulse', 'flute', 'pluck', 'dub', 'strings',
            'bell', 'brass', 'acid', 'chime', 'drone'].includes(n.kind))
          .map(n => [step / (theme.steps || 16), n.kind])).flat();
      return JSON.stringify(events);
    })`);
    assert.equal(new Set(signatures).size, 7, `arrangement ${variant}: unique percussion`);
  }
  assert.ok(run('new Set(Object.values(BGM_THEMES).map(t => t.steps)).size') >= 3,
    'themes need different phrase meters, not just different pitches');
});

test('all themes stay distinct in quiet sections and intensify without abandoning their instruments', () => {
  const { run } = setup();
  const scores = run(`Object.values(BGM_THEMES).map(t => [0, 1, 2].map(level =>
    Array.from({length: (t.steps || 16) * 8}, (_, step) => bgmPattern(t, step, 0, level)).flat()))`);
  assert.equal(new Set(scores.map(s => [...new Set(s[0].map(n => n.kind))].sort().join(','))).size, 7);
  for (const score of scores) assert.ok(score[2].length > score[0].length);
});

test('audio clock preserves tempo at every game speed and catches up without bursts', () => {
  const schedules = [1, 2, 4].map(speed => {
    const { run, c, actx } = setup(); c.state.speed = speed;
    run('bgmTick()');
    for (let i = 1; i <= 50; i++) { actx.currentTime = i / 50; run('bgmTick()'); }
    const step = run('bgmStep');
    actx.currentTime = 300; run('bgmTick()');
    assert.ok(run('bgmStep') - step <= 2, 'no replay of missed minutes');
    return step;
  });
  assert.deepEqual(schedules, [schedules[0], schedules[0], schedules[0]]);
});

test('mute, pause, hidden page, end screens and suspended audio release scheduled voices', () => {
  for (const stop of ['soundEnabled = false', 'state.paused = true', 'document.hidden = true',
    "state.phase = 'stage'", "state.phase = 'deck'", "state.phase = 'over'",
    "state.phase = 'clear'", "actx.state = 'suspended'"]) {
    const { run, nodes } = setup();
    run('bgmTick()');
    assert.ok(run('bgmVoices.size') > 0);
    run(stop + '; bgmTick()');
    assert.equal(run('bgmVoices.size'), 0, stop);
    const count = nodes.length; run('bgmTick()'); assert.equal(nodes.length, count);
  }
});

test('pause resumes the phrase; retry rotates its starting section; stage switch releases old voices', () => {
  const { run, actx } = setup();
  run('bgmTick()'); const step = run('bgmStep');
  run('state.paused = true; bgmTick(); state.paused = false');
  actx.currentTime = 1; run('bgmTick()');
  assert.ok(run('bgmStep') - step <= 2);
  run("state.phase = 'over'; bgmTick(); state.phase = 'wave'; bgmTick()");
  assert.ok(run('bgmStep') >= run('bgmProfile(0).theme.steps * 8'));
  run('var oldVoices = [...bgmVoices]; state.stage = 1; bgmTick()');
  assert.equal(run('oldVoices.every(v => !bgmVoices.has(v))'), true);
});

test('long sessions reap voices even if onended is delayed, and absent audio stays harmless', () => {
  const { run, actx } = setup();
  const stages = run('STAGES.map((_, i) => i).filter((i, _, all) => all.find(j => bgmProfile(j).family === bgmProfile(i).family) === i)');
  let time = 0;
  for (const stage of stages) {
    run(`state.stage = ${stage}; state.wave = STAGES[state.stage].waves`);
    for (let i = 0; i < 1500; i++) {
      actx.currentTime = time; time += .05; run('bgmTick()');
      assert.equal(run('bgmFailed'), false, `stage ${stage}: all instruments supported`);
      assert.ok(run('bgmVoices.size') < 40, `stage ${stage}: bounded active nodes`);
    }
  }
  run('bgmStop(); actx = null; bgmTick()');
  assert.equal(run('bgmVoices.size'), 0);
});
