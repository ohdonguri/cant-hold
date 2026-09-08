// 클리어 화면에서 탭이 먹는가 — 실제 브라우저에서 재현한다.
import { chromium } from 'playwright';
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 390, height: 844 } });
p.on('pageerror', e => console.log('[pageerror]', e.message));
await p.goto('http://127.0.0.1:8731/index.html');
await p.evaluate(() => { const e = document.getElementById('ebIntro'); if (e) e.remove(); }).catch(() => {});
await p.waitForTimeout(1000);

const scenes = [
  ['평범하게 클리어', () => {}],
  ['소환 창을 열어 둔 채 클리어', () => { state.picker = { gx: 2, gy: 8, kind: null }; }],
  ['분기 모달이 뜬 채 클리어', () => { openChoice(state.towers[0], 3); }],
];
for (const [name, setup] of scenes) {
  const r = await p.evaluate(({ src }) => {
    restart(); pickStage(0);
    ['shredder','frost','marksman'].forEach(k => toggleDeckPick(k));
    startRun(); tuteMerged = true;
    state.gold = 99999;
    for (let i = 0; i < 4; i++) summon(state.deck[i % 3]);
    state.phase = 'clear';
    eval(src);
    render();
    const before = state.phase;
    const hasChoice = !!state.choice, hasPicker = !!state.picker;
    return { before, hasChoice, hasPicker };
  }, { src: '(' + setup.toString() + ')()' });
  // 화면 한복판을 실제로 탭한다
  await p.mouse.click(195, 400);
  await p.waitForTimeout(120);
  const after = await p.evaluate(() => state.phase);
  console.log(
    (r.before === 'clear' ? '' : '[준비실패] ') +
    name.padEnd(24) +
    ' 탭 뒤 phase = ' + after +
    (after === 'stage' ? '  ✅ 목록으로 갔다' : '  ❌ 안 갔다') +
    (r.hasChoice ? '  (모달 있었음)' : '') + (r.hasPicker ? '  (소환창 있었음)' : '')
  );
}
await b.close();
