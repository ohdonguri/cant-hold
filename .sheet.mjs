// ChatGPT 에 붙일 참조 시트. 왼쪽은 원본(256), 오른쪽은 게임에서 실제로 보이는 크기.
import { chromium } from 'playwright';
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 700, height: 1720 }, deviceScaleFactor: 2 });
await p.goto('http://127.0.0.1:8731/index.html');
await p.evaluate(() => { const e = document.getElementById('ebIntro'); if (e) e.remove(); }).catch(() => {});
await p.waitForTimeout(1200);
const png = await p.evaluate(async () => {
  const load = s => new Promise(r => { const i = new Image(); i.onload = () => r(i); i.onerror = () => r(null); i.src = s; });
  const E = [['grunt','보병 grunt',.26],['armored','중갑 armored',.28],['warded','마갑 warded',.26],
             ['swift','질주 swift',.20],['regen','재생 regen',.26],['immune','면역 immune',.28],
             ['swarm','군집 swarm',.15],['elite','정예 elite',.42]];
  const T = ['shredder','eroder','frost','mortar','marksman','arc','mint'];
  const TN = {shredder:'파쇄자',eroder:'침식자',frost:'서리탑',mortar:'박격포',marksman:'관측소',arc:'마력로',mint:'조폐소'};
  const c = document.createElement('canvas');
  c.width = 700; c.height = 1720;
  const g = c.getContext('2d');
  g.fillStyle = '#0d1117'; g.fillRect(0, 0, 700, 1720);
  g.textBaseline = 'top';

  g.fillStyle = '#e6edf3'; g.font = '700 20px system-ui';
  g.fillText('cant-hold — 현재 스프라이트', 24, 20);
  g.fillStyle = '#8b949e'; g.font = '13px system-ui';
  g.fillText('왼쪽: 원본 PNG (256x256).   오른쪽 빨간 칸: 게임에서 실제로 보이는 크기 (31~49px).', 24, 48);
  g.fillText('원본은 세밀한데 화면에서는 저 크기다 — 이 간극이 문제다.', 24, 68);

  let y = 100;
  const row = async (label, path, px) => {
    const im = await load(path);
    if (!im) return;
    g.fillStyle = '#c9d1d9'; g.font = '700 14px system-ui';
    g.fillText(label, 24, y + 34);
    g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
    g.drawImage(im, 150, y, 96, 96);                       // 원본 축소본
    g.imageSmoothingEnabled = false;
    g.drawImage(im, 300, y + 48 - px / 2, px, px);         // 게임 크기 (지금 방식)
    g.imageSmoothingEnabled = true;
    g.drawImage(im, 380, y + 48 - px / 2, px, px);         // 게임 크기 (스무딩)
    g.drawImage(im, 460, y + 48 - 48, 96, 96);            // 게임 크기를 96px 로 확대
    g.strokeStyle = '#f85149'; g.lineWidth = 1;
    g.strokeRect(295.5, y + 48 - px / 2 - 4.5, px + 9, px + 9);
    g.fillStyle = '#6e7681'; g.font = '11px system-ui';
    g.fillText(px + 'px', 300, y + 48 + px / 2 + 8);
    y += 104;
  };
  g.fillStyle = '#58a6ff'; g.font = '700 14px system-ui';
  g.fillText('원본 96px', 150, 84); g.fillText('실제', 300, 84); g.fillText('스무딩', 380, 84); g.fillText('실제 크기를 96px 로 확대', 460, 84);
  y = 104;
  for (const [k, nm, r] of E) await row(nm, 'assets/sprites/enemies/' + k + '.png', Math.round(r * 2.3 * 52));
  y += 16;
  g.fillStyle = '#e6edf3'; g.font = '700 16px system-ui';
  g.fillText('타워 7종 (보드 칸 52px, 5성부터 2x2 = 104px)', 24, y); y += 28;
  for (const k of T) await row(TN[k], 'assets/sprites/towers/' + k + '.png', 52);
  return c.toDataURL('image/png');
});
const fs = await import('node:fs');
fs.writeFileSync(process.argv[2], Buffer.from(png.split(',')[1], 'base64'));
console.log('찍음 ' + process.argv[2]);
await b.close();
