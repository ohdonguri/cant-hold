// Review all real stage renders in one contact sheet, without touching player saves.
const {chromium}=require('playwright');
const path=require('node:path');
(async()=>{
 const browser=await chromium.launch({headless:true});
 try {
  const page=await browser.newPage({viewport:{width:390,height:844}});
  const errors=[];page.on('pageerror',e=>errors.push(String(e)));
  await page.goto('file://'+path.resolve(__dirname,'../index.html'));
  await page.waitForTimeout(3000);
  const cards=[];
  for(let i=0;i<20;i++) {
   const title=await page.evaluate(i=>{
    loadStage(i); state.phase='wave';state.spawnQueue=[];state.openRows=CFG.BOARD_H;
    state.towers=[];state.enemies=[];update=()=>{};decayEffects=()=>{};
    render();return STAGES[i].name;
   },i);
   const bytes=await page.screenshot({path:`/tmp/canthold-map-${i+1}.png`});
   cards.push(`<figure><figcaption>${i+1}. ${title}</figcaption><img src="data:image/png;base64,${bytes.toString('base64')}"></figure>`);
  }
  await page.setViewportSize({width:1200,height:2700});
  await page.setContent(`<style>body{margin:0;background:#141a1c;color:white;font:16px sans-serif;display:grid;grid-template-columns:repeat(5,1fr)}figure{margin:6px}img{width:100%}figcaption{height:24px}</style>${cards.join('')}`);
  await page.screenshot({path:'/tmp/canthold-all-maps.png',fullPage:true});
  if(errors.length)throw Error(errors.join('\n'));
  console.log('PASS: 20 stages captured, no page errors; /tmp/canthold-all-maps.png');
 } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
