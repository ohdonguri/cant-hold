// Deterministic visual fixture: actual renderer, frozen at mid-flight.
const {chromium} = require('playwright');
const path = require('node:path');
(async () => {
  const browser = await chromium.launch({headless:true});
  try {
    const page = await browser.newPage({viewport:{width:390,height:844}});
    const errors=[]; page.on('pageerror',e=>errors.push(String(e)));
    await page.goto('file://'+path.resolve(__dirname,'../index.html'));
    await page.waitForTimeout(3000);
    await page.evaluate(() => {
      loadStage(0); state.phase='wave'; state.spawnQueue=[];
      state.towers=[]; state.enemies=[]; state.beams=[];
      spawnEnemy('armored'); const e=state.enemies[0];
      e.x=2;e.y=3;e.dist=8;e.hp=e.maxHp=10000;
      const t={id:1,kind:'marksman',gx:5,gy:4,star:1,cd:0};
      state.towers=[t]; fireTower(t,1/30);
      state.beams.forEach(b=>b.t=0.16);
      update=()=>{}; decayEffects=()=>{};
      render();
    });
    await page.screenshot({path:'/tmp/canthold-crossbow-flight.png'});
    if(errors.length) throw Error(errors.join('\n'));
    console.log('PASS: mid-flight screenshot /tmp/canthold-crossbow-flight.png');
  } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
