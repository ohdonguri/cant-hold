const assert = require('node:assert/strict');
const g = require('./sim.js').load();
g.loadStage(0);
g.state.towers = [];
// A source-to-target stroke would turn the bolt back into a laser.
for (const [x2,y2] of [[5,1],[1,5],[-3,1],[1,-3],[1,1]]) {
  g.state.beams = [{kind:'marksman',x1:1,y1:1,x2,y2,t:0.09}];
  const before = JSON.stringify(g.state.beams);
  g.draws.reset(); g.drawEffects(true);
  const segments = g.draws.segments();
  assert.ok(segments.length >= 3, 'Bolt shaft and fletching must be visible');
  assert.ok(segments.every(s => Math.hypot(s.x2-s.x1,s.y2-s.y1) < g.view.cell), 'Crossbow still draws a full-length beam');
  assert.equal(JSON.stringify(g.state.beams),before,'Rendering changed hit state');
  assert.ok(g.draws.geom.every(p=>p.a.every(Number.isFinite)), 'Invalid bolt geometry');
}
// An actual travelling bolt must move between visible frames, not sit under its target.
g.state.beams = [{kind:'marksman',x1:1,y1:1,x2:5,y2:1,t:0.24}];
g.draws.reset(); g.drawEffects(true);
const start = g.draws.segments()[0];
g.state.beams[0].t = 0.14;
g.draws.reset(); g.drawEffects(true);
const middle = g.draws.segments()[0];
assert.ok(middle.x1 > start.x1 + g.view.cell, 'Bolt does not travel toward target');
console.log('PASS: short crossbow bolts in every direction, no beam or combat mutation');
