// 방향 그림 파생기 — 정면(down) 한 장에서 옆모습(side)과 뒷모습(up)을 만든다.
//
//   node tools/sprite-derive.mjs                 assets/sprites/enemies/ 에 -side · -up 을 쓴다
//   node tools/sprite-derive.mjs --sheet 경로    쓰지 않고 검토용 시트(PNG)만 낸다
//
// ── 왜 이런 게 있나 ──────────────────────────────────────────
// 방향 그림은 원래 디자이너(코덱스)가 그리는 것이다(docs/sprite-request.md). 그런데
// 그림을 뽑을 수단이 끊겼고(2026-08-30, 토큰 없음), 코드는 #93 부터 방향 파일만
// 기다리고 있었다 — 파일이 0장이라 적이 어느 쪽으로 걷든 정면이었다.
//
// 그림을 새로 그리는 대신 **기존 픽셀을 재료로 쓴다.** 팔레트·외곽선·음영이 원본
// 그대로라 다른 캐릭터로 안 보이고, 화면에서 적은 40px 남짓이라 실루엣과 눈 위치가
// 방향의 전부다. 진짜 그림이 오면 **같은 이름으로 덮어쓰면 끝**이다 — 이 도구는 그때
// 지운다. 출력 파일을 손으로 고치지 마라. 다시 돌리면 덮인다.
//
// ── 무엇을 하나 ─────────────────────────────────────────────
//   side   가로로 SQUASH 만큼 눌러 좁히고(3/4 턴의 실루엣), 발광부(눈·코어)를 보는 쪽
//          (왼쪽)으로 EYE_SHIFT 만큼 옮긴다. 비는 자리는 주변 몸통색으로 메운다.
//          왼쪽을 보는 것이 원본이고 오른쪽은 게임이 뒤집는다(ENEMY_FACE_CHAIN).
//   up     얼굴(위쪽 FACE_BAND)의 발광부를 몸통색으로 메운다. 로봇 갑옷은 앞뒤 실루엣이
//          같으므로 눈만 없으면 등이다. 가슴 코어는 남긴다 — 그게 그 적의 색 정체성이다.
//
// 발광부는 「밝고 채도 높은 픽셀」이다. 금속 하이라이트는 밝지만 채도가 낮아서 안
// 걸리고, 몸통 고유색은 채도가 높지만 밝지 않아서 안 걸린다. 종류마다 문턱이 조금
// 다르다(PLAN). 얼굴 없는 대칭꼴(swarm·immune·warded)은 뒷모습이 정면과 같으므로
// up 을 안 만든다 — 파일이 없으면 게임이 정면으로 대신한다.
import { chromium } from 'playwright';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIR = join(ROOT, 'assets', 'sprites', 'enemies');

const SQUASH = 0.62;      // side 의 가로 비율. 0.5 는 판지처럼 얇고 0.75 는 정면과 구별이 안 된다
const EYE_SHIFT = 0.14;   // side 에서 발광부를 옮기는 거리(눌린 폭 기준)
const FACE_BAND = 0.55;   // up 에서 메우는 발광부의 세로 범위(위에서부터 비율)

// 종류별 계획. glow 는 [최소 밝기 L, 최소 채도 S] (HSL, 0~1).
const PLAN = {
  grunt:   { up: true,  glow: [0.62, 0.30] },
  armored: { up: true,  glow: [0.55, 0.70] },  // 몸통이 연한 파랑이라 채도로만 가른다
  swift:   { up: true,  glow: [0.70, 0.50] },
  regen:   { up: true,  glow: [0.62, 0.45] },
  elite:   { up: true,  glow: [0.70, 0.50] },  // 빨강 하이라이트(L≈0.6)는 넘긴다
  swarm:   { up: false, glow: [0.66, 0.45] },
  immune:  { up: false, glow: [0.62, 0.55] },
  warded:  { up: false, glow: [0.66, 0.40] },
};

const argv = process.argv.slice(2);
const sheetAt = argv.includes('--sheet') ? argv[argv.indexOf('--sheet') + 1] : null;

// 브라우저 안에서 도는 부분. 캔버스 하나로 픽셀을 만진다.
const derive = ({ src, glow, up, SQUASH, EYE_SHIFT, FACE_BAND }) => new Promise(resolve => {
  const img = new Image();
  img.onload = () => {
    const W = img.naturalWidth, H = img.naturalHeight;
    const cv = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
    const hsl = (r, g, b) => {
      r /= 255; g /= 255; b /= 255;
      const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2;
      const s = mx === mn ? 0 : (mx - mn) / (1 - Math.abs(2 * l - 1));
      return [l, s];
    };
    const isGlow = (d, i) => {
      if (d[i + 3] < 128) return false;
      const [l, s] = hsl(d[i], d[i + 1], d[i + 2]);
      return l >= glow[0] && s >= glow[1];
    };
    // 비는 자리를 주변의 「발광 아닌 몸통」 색 평균으로 메운다. 반지름을 넓혀 가며 찾는다.
    const fill = (d, w, h, x, y, isHole) => {
      for (let r = 2; r <= 10; r++) {
        let R = 0, G = 0, B = 0, n = 0;
        for (let yy = y - r; yy <= y + r; yy++) for (let xx = x - r; xx <= x + r; xx++) {
          if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
          const j = (yy * w + xx) * 4;
          if (d[j + 3] < 128 || isHole(xx, yy)) continue;
          R += d[j]; G += d[j + 1]; B += d[j + 2]; n++;
        }
        if (n >= 3) return [R / n, G / n, B / n];
      }
      return null;
    };

    // ── side ──
    const sw = Math.round(W * SQUASH), ox = Math.round((W - sw) / 2);
    const sc = cv(W, H), sx = sc.getContext('2d');
    sx.imageSmoothingEnabled = false;
    sx.drawImage(img, ox, 0, sw, H);
    const sd = sx.getImageData(0, 0, W, H), s = sd.data;
    const glowMask = new Uint8Array(W * H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) glowMask[y * W + x] = isGlow(s, (y * W + x) * 4) ? 1 : 0;
    const dx = -Math.round(sw * EYE_SHIFT);
    const moved = new Map();   // 목적지 → 색
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      if (!glowMask[y * W + x]) continue;
      const tx = x + dx;
      if (tx < 0) continue;
      const j = (y * W + tx) * 4;
      if (s[j + 3] < 128) continue;              // 실루엣 밖으로는 안 나간다
      const i = (y * W + x) * 4;
      moved.set(y * W + tx, [s[i], s[i + 1], s[i + 2]]);
    }
    const out = new Uint8ClampedArray(s);
    const isHole = (x, y) => glowMask[y * W + x] === 1;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const k = y * W + x;
      if (glowMask[k] && !moved.has(k)) {
        const c = fill(s, W, H, x, y, isHole);
        if (c) { out[k * 4] = c[0]; out[k * 4 + 1] = c[1]; out[k * 4 + 2] = c[2]; }
      }
    }
    for (const [k, c] of moved) { out[k * 4] = c[0]; out[k * 4 + 1] = c[1]; out[k * 4 + 2] = c[2]; }
    sx.putImageData(new ImageData(out, W, H), 0, 0);
    const side = sc.toDataURL('image/png');

    // ── up ──
    let upUrl = null;
    if (up) {
      const uc = cv(W, H), ux = uc.getContext('2d');
      ux.drawImage(img, 0, 0);
      const ud = ux.getImageData(0, 0, W, H), u = ud.data;
      const band = Math.round(H * FACE_BAND);
      const mask = new Uint8Array(W * H);
      for (let y = 0; y < band; y++) for (let x = 0; x < W; x++) mask[y * W + x] = isGlow(u, (y * W + x) * 4) ? 1 : 0;
      const o2 = new Uint8ClampedArray(u);
      const hole = (x, y) => mask[y * W + x] === 1;
      for (let y = 0; y < band; y++) for (let x = 0; x < W; x++) {
        if (!mask[y * W + x]) continue;
        const c = fill(u, W, H, x, y, hole);
        const k = (y * W + x) * 4;
        if (c) { o2[k] = c[0]; o2[k + 1] = c[1]; o2[k + 2] = c[2]; }
      }
      ux.putImageData(new ImageData(o2, W, H), 0, 0);
      upUrl = uc.toDataURL('image/png');
    }
    let glowCount = 0; for (const v of glowMask) glowCount += v;
    resolve({ side, up: upUrl, glowCount });
  };
  img.src = src;
});

const browser = await chromium.launch();
const page = await browser.newPage();
await page.setContent('<html><body></body></html>');
const results = {};
for (const [kind, plan] of Object.entries(PLAN)) {
  const src = 'data:image/png;base64,' + readFileSync(join(DIR, kind + '.png')).toString('base64');
  const r = await page.evaluate(derive, { src, glow: plan.glow, up: plan.up, SQUASH, EYE_SHIFT, FACE_BAND });
  results[kind] = r;
  console.log(`  ${kind.padEnd(8)} 발광 ${String(r.glowCount).padStart(5)}px   side ${plan.up ? '· up' : '      (up 없음 — 대칭꼴)'}`);
}

const toBuf = url => Buffer.from(url.split(',')[1], 'base64');
if (sheetAt) {
  // 검토용 시트: 종류마다 down | side | side(뒤집힘) | up. 게임 크기(약 40px)로도 한 줄.
  const cell = 96, small = 40, cols = 4;
  const sheet = await page.evaluate(async ({ results, DIR_SRC, cell, small, cols }) => {
    const load = src => new Promise(res => { const im = new Image(); im.onload = () => res(im); im.src = src; });
    const kinds = Object.keys(results);
    const c = document.createElement('canvas');
    c.width = cell * cols + small * cols + 16; c.height = cell * kinds.length;
    const x = c.getContext('2d');
    x.fillStyle = '#0d1117'; x.fillRect(0, 0, c.width, c.height);
    x.imageSmoothingEnabled = false;
    for (let i = 0; i < kinds.length; i++) {
      const k = kinds[i];
      const down = await load(DIR_SRC[k]);
      const side = await load(results[k].side);
      const up = results[k].up ? await load(results[k].up) : down;
      const row = [down, side, 'flip', up];
      for (let j = 0; j < cols; j++) {
        const im = row[j] === 'flip' ? side : row[j];
        for (const [sz, ox] of [[cell, j * cell], [small, cell * cols + 16 + j * small]]) {
          x.save();
          const cx = ox + sz / 2, cy = i * cell + (cell - sz) / 2 + sz / 2;
          x.translate(cx, cy);
          if (row[j] === 'flip') x.scale(-1, 1);
          x.drawImage(im, -sz / 2, -sz / 2, sz, sz);
          x.restore();
        }
      }
    }
    return c.toDataURL('image/png');
  }, { results, DIR_SRC: Object.fromEntries(Object.keys(PLAN).map(k => [k, 'data:image/png;base64,' + readFileSync(join(DIR, k + '.png')).toString('base64')])), cell, small, cols });
  writeFileSync(sheetAt, toBuf(sheet));
  console.log(`시트 → ${sheetAt}`);
} else {
  let n = 0;
  for (const [kind, r] of Object.entries(results)) {
    writeFileSync(join(DIR, kind + '-side.png'), toBuf(r.side)); n++;
    if (r.up) { writeFileSync(join(DIR, kind + '-up.png'), toBuf(r.up)); n++; }
  }
  console.log(`${n}장 → ${DIR}`);
}
await browser.close();
