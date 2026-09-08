// 백그라운드 갔다 오면 되살아나는가 — 실제 브라우저에서 본다.
import { chromium } from 'playwright';
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
const p = await ctx.newPage();
p.on('pageerror', e => console.log('[pageerror]', e.message));
await p.goto('http://127.0.0.1:8731/index.html');
await p.evaluate(() => { const e = document.getElementById('ebIntro'); if (e) e.remove(); }).catch(() => {});
await p.waitForTimeout(900);
await p.evaluate(() => {
  restart(); pickStage(0);
  ['shredder','frost','marksman'].forEach(k => toggleDeckPick(k));
  startRun(); tuteMerged = true;
  state.gold = 99999;
  for (let i = 0; i < 4; i++) summon(state.deck[i % 3]);
  state.phase = 'clear';
  openChoice(state.towers[0], 3);          // 모달이 뜬 채로 끝난 상황
  render();
});

// ① 루프가 죽은 것을 흉내낸다 (iOS 가 백그라운드에서 rAF 를 안 돌려주는 상태)
await p.evaluate(() => { if (rafId !== null) { cancelAnimationFrame(rafId); rafId = null; } });
const beforeRaf = await p.evaluate(() => rafId);

// ② 화면을 벗어났다 돌아온다
const p2 = await ctx.newPage();          // 다른 탭으로 → 원래 탭이 hidden
await p2.goto('about:blank');
await p.waitForTimeout(200);
await p.bringToFront();                  // 돌아온다 → visibilitychange
await p.waitForTimeout(300);
console.log('   (bringToFront 뒤 rafId=' + await p.evaluate(() => rafId) + ', hidden=' + await p.evaluate(() => document.hidden) + ')');
// 헤드리스가 visibilitychange 를 안 쏘는 경우가 있어 직접도 쏴 본다
await p.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
await p.waitForTimeout(200);

const afterRaf = await p.evaluate(() => rafId);
console.log('루프  죽인 뒤 rafId=' + beforeRaf + '  →  돌아온 뒤 rafId=' + (afterRaf === null ? 'null ❌ 안 살아남' : '살아남 ✅'));

// ③ 그 상태에서 클리어 화면을 탭한다
await p.mouse.click(195, 400);
await p.waitForTimeout(150);
const phase = await p.evaluate(() => state.phase);
console.log('탭   모달 뜬 클리어 화면 → phase=' + phase + (phase === 'stage' ? '  ✅' : '  ❌'));

// ④ 화면이 실제로 다시 그려지는가 (검은 화면이 아닌가)
const painted = await p.evaluate(() => {
  const c = document.getElementById('c');
  const g = c.getContext('2d');
  const d = g.getImageData(0, 0, c.width, Math.min(400, c.height)).data;
  let nonBg = 0;
  for (let i = 0; i < d.length; i += 4)
    if (d[i] > 30 || d[i+1] > 30 || d[i+2] > 40) nonBg++;
  return nonBg;
});
console.log('그림 배경 아닌 픽셀 ' + painted + (painted > 1000 ? '  ✅ 그려짐' : '  ❌ 검은 화면'));
await b.close();
