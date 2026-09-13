const { chromium } = require('playwright');
const assert = require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({headless:true});
 for(const [width,height,topReserve,bottomReserve] of [[320,568,0,0],[390,844,0,0],[320,568,48,60],[390,844,48,60]]){
  const page=await browser.newPage({viewport:{width,height}});page.setDefaultTimeout(8000);const errors=[];page.on('pageerror',e=>errors.push(String(e)));
  await page.route(/^https?:/,r=>r.abort());
  await page.goto(require('node:url').pathToFileURL(require('node:path').join(__dirname,'../index.html')).href,{waitUntil:'domcontentloaded'});
  await page.evaluate(({topReserve,bottomReserve})=>{document.querySelector('#ebIntro')?.remove();window.__topReserve=topReserve;window.__bottomReserve=bottomReserve;resize();state.phase='stage';},{topReserve,bottomReserve});
  await page.waitForTimeout(100);await page.mouse.click(width-60,52+await page.evaluate(()=>view.top));
  await page.locator('dialog[open]').waitFor();
  const checkSafeArea = async () => {
   const bounds = await page.locator('dialog').boundingBox();
   const close = await page.locator('.guide-close').boundingBox();
   const top = await page.evaluate(()=>view.top);
   const bottom = await page.evaluate(()=>innerHeight-(window.__bottomReserve||0));
   assert(bounds.y >= top + 17, `guide overlaps reserved top: ${bounds.y} < ${top+17}`);
   assert(bounds.y+bounds.height <= bottom-17, 'guide overlaps bottom reserve');
   assert(close.y >= top, 'close button overlaps Toss controls');
   assert(await page.locator('.guide-scroll').evaluate(e=>e.clientHeight>60));
  };
  await checkSafeArea();
  await page.setViewportSize({width,height:height-30});
  await checkSafeArea();
  await page.setViewportSize({width,height});
  assert.equal(await page.locator('.guide-tab').count(),7);
  for(const kind of ['shredder','eroder','frost','mortar','marksman','arc','mint']){
   await page.locator(`[data-kind="${kind}"]`).click();
   assert.equal(await page.locator('.guide-path').count(),2);assert.equal(await page.locator('.guide-child').count(),4);assert.equal(await page.locator('.guide-trait').count(),7);
  }
  await page.locator('[data-kind="frost"]').click();
  assert(await page.locator('.guide-scroll').evaluate(e=>e.scrollWidth<=e.clientWidth));
  await page.screenshot({path:`/tmp/tower-guide-${width}-${topReserve}.png`});
  await page.locator('.guide-scroll').evaluate(e=>e.scrollTop=e.scrollHeight);
  await page.screenshot({path:`/tmp/tower-guide-seven-${width}-${topReserve}.png`});
  await page.keyboard.press('Escape');assert.equal(await page.evaluate(()=>towerGuideOpen),false);
  assert.equal(await page.evaluate(()=>state.paused),false);
  await page.evaluate(()=>{state.phase='deck';state.deckPick=KIND_KEYS.slice(0,CFG.DECK_SIZE);});
  const deckBefore = await page.evaluate(()=>state.deckPick.slice());
  await page.waitForTimeout(100);
  await page.mouse.click(width-60,52+await page.evaluate(()=>view.top));
  await page.locator('dialog[open]').waitFor();
  await page.locator('.guide-close').click();
  assert.deepEqual(await page.evaluate(()=>state.deckPick),deckBefore);
  await page.evaluate(()=>{startRun();state.life=29;});
  await page.waitForTimeout(100);await page.screenshot({path:`/tmp/hearts-${width}-${topReserve}.png`});
  await page.evaluate(()=>{state.paused=true;});
  await page.waitForTimeout(100);
  const pauseGuide = await page.evaluate(()=>({x:guideEntryRect.x+45,y:guideEntryRect.y+18+view.top}));
  await page.mouse.click(pauseGuide.x,pauseGuide.y);
  await page.locator('dialog[open]').waitFor();
  await page.locator('.guide-close').click();assert.equal(await page.evaluate(()=>state.paused),true);
  await page.evaluate(()=>openTowerGuide('frost'));await page.evaluate(()=>history.back());await page.waitForTimeout(150);assert.equal(await page.evaluate(()=>towerGuideOpen),false);assert.equal(await page.evaluate(()=>state.paused),true);assert.deepEqual(errors,[]);await page.close();
 }
 await browser.close();console.log('PASS: 320/390 mobile guide, all tower paths, scrolling, Escape, pause restoration, hearts render');
})().catch(e=>{console.error(e);process.exit(1)});
