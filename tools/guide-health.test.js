const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { load } = require('./sim');
function api() {
  const g = load();
  const html = fs.readFileSync(require('node:path').join(__dirname, '../index.html'), 'utf8');
  const start = html.indexOf('// ── 도감과 체력 데이터');
  const source = start < 0 ? '' : html.slice(start, html.indexOf('// ── 도감 화면', start));
  const c = vm.createContext({ CFG: g.CFG, KINDS: g.KINDS, BRANCH: g.BRANCH, TRAITS: g.TRAITS, TRAIT_KEYS: g.TRAIT_KEYS });
  vm.runInContext(source, c);
  assert.equal(vm.runInContext('typeof towerGuideData', c), 'function');
  return { g, run: s => vm.runInContext(s, c) };
}
test('every tower exposes both 3-star paths and only their own 5-star descendants', () => {
  const { g, run } = api();
  for (const kind of g.KIND_KEYS) {
    const data = run(`towerGuideData('${kind}')`);
    assert.equal(data.paths.length, 2);
    for (const [i, path] of data.paths.entries()) {
      const branch = i === 0 ? 'A' : 'B';
      assert.equal(path.name, g.BRANCH[kind][branch].name);
      assert.deepEqual(Array.from(path.children, x => x.name), [g.BRANCH[kind][branch+'1'].name, g.BRANCH[kind][branch+'2'].name]);
    }
    assert.equal(data.maxStar, g.CFG.STAR_MAX);
    assert.deepEqual(Array.from(data.traits, x => x.name), g.TRAIT_KEYS.map(k => g.TRAITS[k].name));
  }
});
test('guide descriptions reflect the live game data rather than a copied list', () => {
  const { g, run } = api();
  g.BRANCH.frost.B1.desc = 'updated description';
  assert.equal(run("towerGuideData('frost').paths[1].children[0].desc"), 'updated description');
});
test('15 two-point hearts accurately represent every life total, with at most one half heart', () => {
  const { run } = api();
  for (let life = 0; life <= 30; life++) {
    const hearts = run(`lifeHearts(${life}, 30)`);
    assert.equal(hearts.length, 15);
    assert.equal(hearts.reduce((s, x) => s + x * 2, 0), life);
    assert.equal(hearts.filter(x => x === .5).length, life % 2);
  }
  assert.equal(run('lifeHearts(-5,30).every(x => x === 0)'), true);
  assert.equal(run('lifeHearts(35,30).every(x => x === 1)'), true);
});
