import {chromium} from 'playwright';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {dirname,join} from 'node:path';
import assert from 'node:assert/strict';
const root=join(dirname(fileURLToPath(import.meta.url)),'..');
const browser=await chromium.launch();
try {
 const page=await browser.newPage({viewport:{width:390,height:844}});
 const errors=[];page.on('pageerror',e=>errors.push(String(e)));
 await page.route('**/*',r=>r.request().url().startsWith('file:')?r.continue():r.abort());
 await page.goto(pathToFileURL(join(root,'index.html')).href);
 for(const rightBranch of ['A','B']) for(const kind of ['shredder','frost','marksman','eroder','mortar','arc','mint']) {
  const pos=await page.evaluate(({kind,rightBranch})=>{
   document.getElementById('ebIntro')?.remove();restart();pickStage(0);
   [kind,...KIND_KEYS.filter(k=>k!==kind).slice(0,2)].forEach(toggleDeckPick);startRun();
   state.openRows=CFG.BOARD_H;state.gold=1000;tuteMerged=true;window.update=()=>{};
   summon(kind,1,5);summon(kind,2,5);
   state.towers[0].star=4;state.towers[0].b3='A';
   state.towers[1].star=4;state.towers[1].b3=rightBranch;
   return state.towers.map(t=>{const p=cellToPx(t.gx,t.gy);return{x:p.x+view.cell/2,y:p.y+view.cell/2+view.top};});
  },{kind,rightBranch});
  await page.mouse.move(pos[0].x,pos[0].y);await page.mouse.down();await page.mouse.move(pos[1].x,pos[1].y,{steps:6});await page.mouse.up();
  await page.waitForTimeout(80);
  assert.deepEqual(errors,[],kind+' drag error');
  if(kind !== 'mint') {
  const action=await page.evaluate(()=>{if(!mergePlaceOpen())throw Error('No placement screen');const a=pickerLayout().actions.find(a=>a.act==='place');return{x:a.x+a.w/2,y:a.y+a.h/2+view.top};});
  await page.mouse.click(action.x,action.y);await page.waitForTimeout(80);
  assert.deepEqual(errors,[],kind+' placement error');
  }
  for(let i=0;i<(rightBranch==='B'?2:1);i++){
   const r=await page.evaluate(()=>{const r=choiceRects()[0];if(!r)throw Error('No choice');return{x:r.x+r.w/2,y:r.y+r.h/2+view.top};});
   await page.mouse.click(r.x,r.y);await page.waitForTimeout(80);
   assert.deepEqual(errors,[],kind+' choice error');
  }
  const result=await page.evaluate(()=>({count:state.towers.length,star:state.towers[0].star,b5:state.towers[0].b5,choice:state.choice,picker:state.picker}));
  assert.equal(result.count,1);assert.equal(result.star,5);assert.equal(result.b5,'A1');assert.equal(result.choice,null);assert.equal(result.picker,null);
  console.log('PASS',kind,'4+4',rightBranch==='A'?'same branch':'different branch');
 }
}finally{await browser.close();}
