// 참조용 깔끔한 몽타주 (주석 없음). 적 8 + 타워 7.
import { chromium } from 'playwright';
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1024, height: 560 }, deviceScaleFactor: 1 });
await p.goto('http://127.0.0.1:8731/index.html');
await p.evaluate(() => { const e = document.getElementById('ebIntro'); if (e) e.remove(); }).catch(() => {});
await p.waitForTimeout(1200);
const png = await p.evaluate(async () => {
  const load = s => new Promise(r => { const i = new Image(); i.onload = () => r(i); i.onerror = () => r(null); i.src = s; });
  const E = ['grunt','armored','warded','swift','regen','immune','swarm','elite'];
  const T = ['shredder','eroder','frost','mortar','marksman','arc','mint'];
  const c = document.createElement('canvas');
  c.width = 1024; c.height = 560;
  const g = c.getContext('2d');
  g.fillStyle = '#0d1117'; g.fillRect(0, 0, 1024, 560);
  g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
  for (let i = 0; i < E.length; i++) {
    const im = await load('assets/sprites/enemies/' + E[i] + '.png');
    if (im) g.drawImage(im, (i % 4) * 256, Math.floor(i / 4) * 128, 128, 128);
  }
  for (let i = 0; i < T.length; i++) {
    const im = await load('assets/sprites/towers/' + T[i] + '.png');
    if (im) g.drawImage(im, (i % 4) * 256 + 128, Math.floor(i / 4) * 128 + 288, 128, 128);
  }
  return c.toDataURL('image/png');
});
const fs = await import('node:fs');
fs.writeFileSync(process.argv[2], Buffer.from(png.split(',')[1], 'base64'));
console.log('ok ' + process.argv[2]);
await b.close();
