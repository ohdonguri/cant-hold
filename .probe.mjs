// 256x256 PNG 가 진짜 256 해상도인지, 32x32 도트를 8배로 키운 것인지 본다.
import { chromium } from 'playwright';
const b = await chromium.launch();
const p = await b.newPage();
await p.goto('http://127.0.0.1:8731/index.html');
  await p.evaluate(() => { const e = document.getElementById('ebIntro'); if (e) e.remove(); }).catch(() => {});
await p.waitForTimeout(1200);
const out = await p.evaluate(async () => {
  const load = src => new Promise(r => { const i = new Image(); i.onload = () => r(i); i.onerror = () => r(null); i.src = src; });
  const files = ['enemies/grunt.png', 'enemies/elite.png', 'towers/marksman.png'];
  const res = [];
  for (const f of files) {
    const im = await load('assets/sprites/' + f);
    if (!im) { res.push(f + ' — 못 읽음'); continue; }
    const c = document.createElement('canvas');
    c.width = im.naturalWidth; c.height = im.naturalHeight;
    const g = c.getContext('2d');
    g.drawImage(im, 0, 0);
    const d = g.getImageData(0, 0, c.width, c.height).data;
    const at = (x, y) => { const i = (y * c.width + x) * 4; return d[i] + ',' + d[i+1] + ',' + d[i+2] + ',' + d[i+3]; };
    // 블록 크기를 찾는다: 가로로 색이 바뀌는 x 좌표들의 최대공약수
    const gcd = (a, b) => b ? gcd(b, a % b) : a;
    let bs = 0;
    for (let y = 0; y < c.height; y += 7) {
      let prev = at(0, y);
      for (let x = 1; x < c.width; x++) {
        const cur = at(x, y);
        if (cur !== prev) { bs = gcd(bs, x); prev = cur; }
      }
    }
    // 실제로 칠해진 픽셀 수
    let opaque = 0;
    for (let i = 3; i < d.length; i += 4) if (d[i] > 8) opaque++;
    res.push(`${f}  ${c.width}x${c.height}  블록 ${bs}px  →  실질 해상도 ${c.width / (bs || 1)}px  · 불투명 ${(opaque / (c.width * c.height) * 100).toFixed(1)}%`);
  }
  return res;
});
console.log(out.join('\n'));
await b.close();
