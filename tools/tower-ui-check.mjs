// Real-canvas verification and review images for grade / tech indicators.
// node tools/tower-ui-check.mjs
import { chromium } from 'playwright';
import { existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import assert from 'node:assert/strict';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, '.shots', 'tower-ui');
mkdirSync(out, { recursive: true });
const browser = await chromium.launch();
try {
 for (const width of [318, 390]) {
  const page = await browser.newPage({ viewport: { width, height: 844 }, deviceScaleFactor: 2 });
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  await page.route('**/*', route => route.request().url().startsWith('file:') ? route.continue() : route.abort());
  await page.goto(pathToFileURL(join(root, 'index.html')).href);
  const urls = await page.evaluate(() => [...spriteAssets.values()].map(im => im.src));
  const required = urls.filter(url => existsSync(fileURLToPath(url)));
  await page.evaluate(async urls => {
   await Promise.all([...spriteAssets.values()].filter(im => urls.includes(im.src)).map(im => im.decode()));
   document.getElementById('ebIntro')?.remove();
   restart(); pickStage(0);
   ['shredder', 'frost', 'marksman'].forEach(toggleDeckPick);
   startRun(); tuteMerged = true; window.update = () => {};
   state.openRows = CFG.BOARD_H; state.gold = 500; state.timer = 8;
   state.towers = [];
   // Valid board positions, large footprints first; all seven grades represented.
   const specs = [[7,'B','B2','execute'],[6,'A','A2',null],[5,'A','A1',null],
     [4,'B',null,null],[3,'A',null,null],[3,'B',null,null],[2,null,null,null],[1,null,null,null]];
   for (const [star,b3,b5,t7] of specs) {
    const size = star >= 5 ? 2 : 1;
    let spot;
    for (let gy=0; gy<CFG.BOARD_H && !spot; gy++) for (let gx=0; gx<CFG.BOARD_W; gx++) {
     if (canPlace(gx,gy,size,occupancy())) { spot={gx,gy}; break; }
    }
    if (!spot) throw Error('No space for grade '+star);
    state.towers.push({id:9000+state.towers.length,...spot,kind:'shredder',star,b3,b5,t7,cd:0,angle:0,flash:0,streak:0,lastTarget:null,arcKills:0});
   }
   state.selected = null;
  }, required);
  const checks = await page.evaluate(() => {
   // Rendering must neither change tech selection nor persist new game data.
   const identity = () => JSON.stringify(state.towers.map(({id,kind,star,b3,b5,t7}) => ({id,kind,star,b3,b5,t7})));
   const before = identity();
   render();
   if (identity() !== before) throw Error('Renderer changed towers');
   const calls=[]; const original=ctx.fillText;
   ctx.fillText=function(text,...args){calls.push(String(text));return original.call(this,text,...args);};
   try {
    for (const t of state.towers) drawTower(t);
    if (!calls.includes('★1') || !calls.includes('★7') || !calls.includes('1') || !calls.includes('2') || !calls.includes('처')) throw Error('Missing visible tier / subbranch / trait labels');
    const low = {...state.towers[0],star:1};
    calls.length=0; drawTower(low);
    if (calls.includes('2') || calls.includes('처') || calls.includes('?')) throw Error('Low tier leaked tech badge');
   } finally { ctx.fillText=original; }
   return {stars:[...new Set(state.towers.map(t=>t.star))].sort(), colors:STAR_COLOR.slice(1)};
  });
  assert.deepEqual(checks.stars,[1,2,3,4,5,6,7]);
  await page.waitForTimeout(80);
  await page.screenshot({path:join(out,`board-${width}.png`)});
  // Show branch selection with the same glyphs used on the board.
  await page.evaluate(() => {
   const t=state.towers.find(t=>t.star===3);
   state.choice={towerId:t.id,tier:3,options:['A','B']};
  });
  await page.waitForTimeout(80);
  await page.screenshot({path:join(out,`choice-${width}.png`)});
  await page.evaluate(() => {
   clearChoices();
   const a=state.towers.find(t=>t.star===3 && t.b3==='A');
   const b=state.towers.find(t=>t.star===3 && t.b3==='B');
   const merged=mergeTowers(a,b);
   if (!merged || state.choice?.mode !== 'inherit') throw Error('Missing inheritance choice');
   render(); applyChoice(1);
   if (merged.star !== 4 || merged.b3 !== 'B') throw Error('Incorrect inherited branch');
   const five=state.towers.find(t=>t.star===5);
   state.choice={towerId:five.id,tier:5,options:['A1','A2']};
   render(); applyChoice('A2');
   if (five.b5 !== 'A2') throw Error('Incorrect fifth-tier branch');
   const seven=state.towers.find(t=>t.star===7);
   state.choice={towerId:seven.id,tier:7,options:['execute','engrave','stalwart']};
   render(); applyChoice('stalwart');
   if (seven.t7 !== 'stalwart') throw Error('Incorrect seventh-tier trait');
   render();
  });
  assert.deepEqual(errors,[]);
  console.log(`PASS ${width}px: grades 1–7, branches, trait labels, unchanged tower tech, no page errors`);
  await page.close();
 }
} finally { await browser.close(); }

