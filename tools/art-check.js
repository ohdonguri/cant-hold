// Targeted art regression checks. --compare-head additionally proves combat parity
// with the last commit without overwriting the working tree.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { createRequire } = require('node:module');
const sim = require('./sim.js');
function seeded(fn) {
  const original = Math.random;
  let s = 12345, calls = 0;
  Math.random = () => { calls++; return (s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32; };
  try { return { result: fn(), calls }; } finally { Math.random = original; }
}
const g = sim.load();
assert.equal(typeof g.enemyMotion, 'function', 'Monster body animation is missing');
for (const kind of Object.keys(g.ENEMY)) {
  const e = {kind,id:17,dist:1,mvx:1,mvy:0};
  const before = JSON.stringify(e);
  const poses = [0,0.13,0.27,0.51].map(d => g.enemyMotion({...e,dist:e.dist+d}));
  assert.ok(new Set(poses.map(p=>JSON.stringify(p))).size>1, `${kind} has no body movement`);
  assert.ok(poses.every(p=>Object.values(p).every(Number.isFinite)), `${kind} invalid pose`);
  assert.equal(JSON.stringify(e), before, 'Animation modified combat state');
  assert.deepEqual(g.enemyMotion({...e,frozen:2}),g.enemyMotion(e), 'Freezing snaps the pose');
  assert.deepEqual(g.enemyMotion({...e,stun:2}),g.enemyMotion(e), 'Stun snaps the pose');
  assert.deepEqual(g.enemyMotion({...e,slowAmt:0.5}),g.enemyMotion(e), 'Slow snaps the pose');
}
assert.notDeepEqual(g.enemyMotion({kind:'swarm',id:1,dist:2}),g.enemyMotion({kind:'swarm',id:2,dist:2}), 'Swarm moves in lockstep');
console.log('PASS: eight moving bodies, independent phases and continuous freeze/slow poses');
g.loadStage(0); g.state.phase='wave'; g.state.wave=1; g.state.spawnQueue=[];
g.spawnEnemy('swift');
const moving = g.state.enemies[0];
moving.dist=1; moving.x=1; moving.y=0;
g.draws.reset(); g.render(); const frameA=JSON.stringify(g.draws.xform);
moving.dist+=0.13;
g.draws.reset(); g.render();
assert.notEqual(JSON.stringify(g.draws.xform),frameA,'Renderer does not apply body animation');
const poseAt = () => g.enemyMotion(moving);
moving.frozen=2; const frozenPose=poseAt(); g.update(0.1);
assert.deepEqual(poseAt(),frozenPose,'Frozen monster kept animating');
moving.frozen=0; g.state.paused=true; const pausedPose=poseAt(); g.update(0.1);
assert.deepEqual(poseAt(),pausedPose,'Paused monster kept animating');
g.state.paused=false; g.update(0.1);
assert.notDeepEqual(poseAt(),pausedPose,'Unpaused monster did not resume animation');
g.state.enemies=[];
console.log('PASS: real renderer applies poses; update freezes and resumes them');
// Reintroducing legacy direction files must never change the new monster identity.
for (const kind of Object.keys(g.ENEMY)) {
  assert.ok(g.SPR_ASSET_PATH[kind].includes('/fantasy/'), `Legacy monster still connected: ${kind}`);
  const png = fs.readFileSync(path.resolve(__dirname, '..', g.SPR_ASSET_PATH[kind]));
  assert.equal(png.readUInt32BE(16), 256, `${kind}: wrong sprite width`);
  assert.equal(png[25], 6, `${kind}: missing RGBA transparency`);
  for (const dir of g.ENEMY_DIR_FILES) {
    const p = g.dirPath(kind,dir);
    assert.ok(fs.existsSync(path.resolve(__dirname,'..',p)), `Missing new ${kind} ${dir} view`);
    const bytes = fs.readFileSync(path.resolve(__dirname,'..',p));
    assert.equal(bytes.readUInt32BE(16),256);
    assert.equal(bytes[25],6,`${kind} ${dir} lacks alpha`);
    g.images.load(p);
  }
  const base = g.images.load(g.SPR_ASSET_PATH[kind]);
  assert.ok(base, `Missing fantasy monster ${kind}`);
  for (const [direction, suffix, flip] of [['down',null,false],['up','up',false],['left','side',false],['right','side',true]]) {
    const expected = suffix ? g.images.get(g.dirPath(kind,suffix)) : base;
    const face = g.facingAsset(kind,direction);
    assert.equal(face.image, expected, `${kind} wrong view for ${direction}`);
    assert.equal(face.flip, flip, `${kind} wrong flip for ${direction}`);
  }
  g.images.fail(g.dirPath(kind,'up'));
  assert.equal(g.facingAsset(kind,'up').image,base,'Missing rear view should fall back to the new base');
}
console.log('PASS: all monster directions stay in the approved fantasy set');
// Missing PNGs must fall back safely; loading them must replace the procedural board.
g.loadStage(0); g.state.phase = 'build';
const grass = g.images.load('assets/terrain/grassland.png');
const road = g.images.load('assets/terrain/earth-road.png');
assert.ok(grass && road, 'Painted terrain was not registered');
g.draws.reset(); g.render();
assert.ok(g.draws.images.some(a => a[0] === grass), 'Grassland not rendered');
assert.ok(g.draws.images.some(a => a[0] === road), 'Road texture not rendered');
g.loadStage(1); g.draws.reset(); g.render();
assert.ok(!g.draws.images.some(a => a[0] === grass), 'Prototype leaked into another stage');
g.loadStage(0); g.images.fail('assets/terrain/grassland.png');
g.draws.reset(); g.render();
assert.ok(!g.draws.images.some(a => a[0] === grass), 'Failed image submitted to canvas');
assert.ok(g.draws.count('fillRect') > 0, 'Fallback board is empty');
console.log('PASS: painted terrain, stage isolation and failed-image fallback');
assert.equal(g.STAGES.length, Object.keys(g.STAGE_THEMES).length);
assert.equal(new Set(Object.values(g.STAGE_THEMES).map(x => x.join('|'))).size, g.STAGES.length);
for (let i = 0; i < g.STAGES.length; i++) {
  g.loadStage(i); g.state.phase = 'build'; g.state.gold = 99999;
  assert.ok(g.STAGE_THEMES[g.STAGES[i].name]);
  g.state.deck = g.KIND_KEYS.slice();
  for (const kind of g.KIND_KEYS) g.summon(kind);
  const before = JSON.stringify(g.snapshotRun());
  const rendered = seeded(() => { g.render(); g.render(); });
  assert.equal(rendered.calls, 0, 'Rendering consumed combat RNG');
  assert.equal(JSON.stringify(g.snapshotRun()), before, 'Rendering changed saved game');
  assert.ok(!g.draws.images.some(a => a.slice(1).some(v => typeof v === 'number' && !Number.isFinite(v))));
  g.state.towers.length = 0;
}
console.log('PASS: all 20 stage themes render without changing saved state or combat RNG');
g.loadStage(0);g.state.phase='build';g.state.gold=99999;g.state.deck=g.KIND_KEYS.slice();
g.summon('frost');
g.draws.reset();g.drawAuraFields();const single=g.draws.count('fillRect');
g.state.towers.push({...g.state.towers[0],id:9999});
g.draws.reset();g.drawAuraFields();assert.equal(g.draws.count('fillRect'),single);
console.log('PASS: overlapping identical auras do not paint twice');
for(const kind of g.KIND_KEYS) {
  const im=g.images.load(g.SPR_ASSET_PATH[kind]);assert.ok(im);
  const t={id:99,kind,star:1,angle:0,artKick:0.12,artCoin:0.8};
  g.draws.reset();assert.ok(g.drawAnimatedTower(t,100,100,40));
  assert.equal(g.draws.images.length,2,'Expected fixed plinth and moving upper sprite');
  assert.ok(g.draws.images.every(a=>a.slice(1).every(Number.isFinite)));
}
console.log('PASS: all 7 loaded towers draw fixed plinth and animated upper layer');
if(process.argv.includes('--compare-head')) {
  const root=path.resolve(__dirname,'..');
  const headHtml=execFileSync('git',['show','HEAD:index.html'],{cwd:root,encoding:'utf8',maxBuffer:8e6});
  const headSim=execFileSync('git',['show','HEAD:tools/sim.js'],{cwd:root,encoding:'utf8',maxBuffer:8e6});
  const baseModule={exports:{}};
  const localRequire=createRequire(__filename);
  const requireBase=id=>id==='fs'?{...fs,readFileSync:(file,...args)=>path.resolve(String(file))===path.join(root,'index.html')?headHtml:fs.readFileSync(file,...args)}:localRequire(id);
  new Function('require','module','exports','__dirname','__filename',headSim)(requireBase,baseModule,baseModule.exports,__dirname,path.join(__dirname,'sim.js'));
  const base=baseModule.exports;
  for(let stage=0;stage<g.STAGES.length;stage++) {
    const before=seeded(()=>base.greedy(base.load(),{stage}));
    const after=seeded(()=>sim.greedy(sim.load(),{stage}));
    assert.deepEqual(after,before,`Combat changed in stage ${stage+1}`);
  }
  console.log('PASS: all 20 seeded battles match HEAD, including RNG call counts');
}
