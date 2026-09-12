const { test } = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./sim');
function setup(b5 = 'B1', t7 = null) {
  const g = load();
  const tower = { id: 1, kind: 'frost', star: 3, gx: 1, gy: 4, b3: 'B', b5, t7, cd: 0 };
  g.state.towers = [tower];
  function enemy(kind, x = 1, y = 4) {
    g.spawnEnemy(kind);
    const e = g.state.enemies.at(-1);
    Object.assign(e, { x, y, hp: 1e9, maxHp: 1e9 });
    return e;
  }
  return { g, tower, enemy };
}

test('elite rejects direct freeze and thaw vulnerability, even with stalwart', () => {
  for (const branch of ['B1', 'B2']) for (const trait of [null, 'stalwart']) {
    const { g, tower, enemy } = setup(branch, trait);
    const elite = enemy('elite');
    g.freeze(elite, 1, tower);
    assert.equal(elite.frozen, 0);
    assert.equal(elite.pendingVuln, false);
  }
});

test('chain freeze skips resistant targets without consuming either eligible slot', () => {
  const { g, tower, enemy } = setup();
  const trigger = enemy('grunt');
  const elite = enemy('elite'), immune = enemy('immune');
  const a = enemy('grunt'), b = enemy('swift'), third = enemy('regen');
  g.freeze(trigger, 1, tower);
  assert.equal(trigger.frozen, 1);
  assert.equal(elite.frozen, 0);
  assert.equal(immune.frozen, 0);
  assert.equal(a.frozen, .5);
  assert.equal(b.frozen, .5);
  assert.equal(third.frozen, 0);
});

test('stalwart does not bypass elite chain immunity; failed initial freeze does not chain', () => {
  const { g, tower, enemy } = setup('B1', 'stalwart');
  const elite = enemy('elite'), grunt = enemy('grunt');
  g.freeze(elite, 1, tower);
  assert.equal(grunt.frozen, 0);
  g.freeze(grunt, 1, tower);
  assert.equal(elite.frozen, 0);
});

test('elite still takes frost damage and slow, but never accumulates freeze in its aura', () => {
  const { g, tower, enemy } = setup('B2');
  const elite = enemy('elite');
  for (let i = 0; i < 200; i++) g.fireTower(tower, .02);
  assert.equal(elite.frozen, 0);
  assert.equal(elite.frostStacks, 0);
  assert.equal(elite.pendingVuln, false);
  assert.equal(elite.slowNext, .55);
  assert.ok(elite.hp < elite.maxHp);
  assert.equal(g.debuffScale(elite, tower), 1);
});

test('ordinary enemies still freeze; generic immunity retains its existing stalwart exception', () => {
  const { g, tower, enemy } = setup('B2');
  const grunt = enemy('grunt'), immune = enemy('immune');
  g.freeze(grunt, 1, tower); g.freeze(immune, 1, tower);
  assert.equal(grunt.frozen, 1); assert.equal(grunt.pendingVuln, true);
  assert.equal(immune.frozen, 0);
  g.freeze(immune, 1, { ...tower, t7: 'stalwart' });
  assert.equal(immune.frozen, 1);
});
