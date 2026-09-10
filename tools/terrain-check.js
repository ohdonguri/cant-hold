const assert = require('node:assert/strict');
const fs = require('node:fs');
const g = require('./sim.js').load();
const families = ['grassland','canyon','grassland','wetland','alpine','wetland','grassland','ruins','ruins','wetland','fortress','canyon','alpine','wetland','wasteland','canyon','wasteland','fortress','grassland','canyon'];
const images = Object.fromEntries([...new Set(families)].map(k=>[k,g.images.load(`assets/terrain/${k}.png`)]));
g.images.load('assets/terrain/earth-road.png');
for (let i=0;i<20;i++) {
  g.loadStage(i); g.state.phase='build';
  const terrain=g.paintedTerrain();
  assert.ok(terrain,`Stage ${i+1} still uses prototype terrain`);
  assert.equal(terrain.ground,images[families[i]],`Wrong family for stage ${i+1}`);
  g.draws.reset();g.render();
  assert.ok(g.draws.images.some(a=>a[0]===images[families[i]]),`Stage ${i+1} does not render its background`);
  const asset=`assets/terrain/${families[i]}.png`;
  g.images.fail(asset);
  assert.equal(g.paintedTerrain(),null,'Failed background must use safe fallback');
  g.draws.reset();g.render();
  assert.ok(!g.draws.images.some(a=>a[0]===images[families[i]]),'Failed image submitted to canvas');
  g.images.load(asset);
}
for(const k of new Set(families)) assert.ok(fs.existsSync(`assets/terrain/${k}.png`),`Missing ${k} asset`);
console.log('PASS: all 20 stages render their assigned painted biome');
