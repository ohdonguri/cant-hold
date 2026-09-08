// 같은 적을 스무딩 끄고/켜고 나란히 그린다. 왼쪽이 지금(최근접), 오른쪽이 스무딩.
import { chromium } from 'playwright';
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 760, height: 300 }, deviceScaleFactor: 3 });
await p.goto('http://127.0.0.1:8731/index.html');
await p.evaluate(() => { const e = document.getElementById('ebIntro'); if (e) e.remove(); }).catch(() => {});
await p.waitForTimeout(1200);
const png = await p.evaluate(async () => {
  const load = src => new Promise(r => { const i = new Image(); i.onload = () => r(i); i.src = src; });
  const KINDS = ['grunt', 'armored', 'elite', 'regen', 'immune'];
  const imgs = {};
  for (const k of KINDS) imgs[k] = await load('assets/sprites/enemies/' + k + '.png');
  const c = document.createElement('canvas');
  c.width = 760; c.height = 300;
  const g = c.getContext('2d');
  g.fillStyle = '#0d1117'; g.fillRect(0, 0, 760, 300);
  g.fillStyle = '#8b949e'; g.font = '13px system-ui';
  g.fillText('지금 — imageSmoothingEnabled = false (최근접)', 16, 24);
  g.fillText('스무딩 켬 — 같은 그림, 같은 크기', 16, 164);
  // 게임에서 실제로 쓰는 크기: r * 2.3 * cell(52)
  const R = { grunt: .26, armored: .28, elite: .42, regen: .26, immune: .28 };
  KINDS.forEach((k, i) => {
    const s = Math.round(R[k] * 2.3 * 52);
    for (const [row, smooth] of [[46, false], [186, true]]) {
      g.imageSmoothingEnabled = smooth;
      g.imageSmoothingQuality = 'high';
      g.drawImage(imgs[k], 16 + i * 150, row, s, s);
      // 옆에 3배 확대해서 가장자리를 보여 준다
      g.drawImage(imgs[k], 16 + i * 150 + s + 8, row, s * 2, s * 2);
    }
  });
  return c.toDataURL('image/png');
});
const fs = await import('node:fs');
fs.writeFileSync(process.argv[2], Buffer.from(png.split(',')[1], 'base64'));
console.log('찍음 ' + process.argv[2]);
await b.close();
