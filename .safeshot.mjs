import { chromium } from 'playwright';
const b = await chromium.launch();
for (const [inset, out] of [[0, process.argv[2]], [47, process.argv[3]]]) {
  const p = await b.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  if (inset) await p.addInitScript(`(() => {
    const st = document.createElement('style');
    st.textContent = 'div[style*="safe-area-inset-top"]{height:${inset}px !important}';
    document.addEventListener('DOMContentLoaded', () => document.head.appendChild(st));
  })()`);
  await p.goto('http://127.0.0.1:8731/index.html');
  await p.evaluate(() => { const e = document.getElementById('ebIntro'); if (e) e.remove(); }).catch(() => {});
  await p.waitForTimeout(1000);
  await p.evaluate(() => {
    restart(); pickStage(0);
    ['shredder','frost','marksman'].forEach(k => toggleDeckPick(k));
    startRun(); tuteMerged = true;
    state.gold = 99999;
    for (let i = 0; i < 8; i++) summon(state.deck[i % 3]);
    state.wave = 13; state.phase = 'wave';
    resize(); render();
  });
  await p.waitForTimeout(300);
  if (inset) await p.evaluate(i => {
    const d = document.createElement('div');
    d.style.cssText = `position:fixed;top:0;left:0;right:0;height:${i}px;background:rgba(248,81,73,.35);z-index:99;pointer-events:none;color:#fff;font:12px system-ui`;
    d.textContent = ' 상태표시줄 영역';
    document.body.appendChild(d);
  }, inset);
  await p.waitForTimeout(100);
  await p.screenshot({ path: out, clip: { x: 0, y: 0, width: 390, height: 260 } });
  await p.close();
}
console.log('찍음');
await b.close();
