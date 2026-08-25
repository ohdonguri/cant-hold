// icons/icon.svg 하나에서 앱 아이콘 일곱 장(마스커블 SVG + PNG 여섯)을 뽑는다.
//
//   node tools/icons.mjs
//
// **PNG 를 손으로 만들지 않는 이유.** 손으로 만든 PNG 만 리포에 있으면 다음 사람이
// 색 하나 바꾸려 할 때 재현이 안 된다 — 어떤 도구로 어떤 크기에서 어떻게 뽑았는지가
// 아무 데도 안 남기 때문이다. 원본 SVG 와 이 스크립트가 같이 있어야 다시 뽑힌다.
//
// 새 의존성은 안 쓴다. playwright 는 tools/shot.js·tools/verify-build.mjs 가 이미
// 쓰고 있고, SVG 를 띄워 찍으면 그게 곧 PNG 다. resvg·sharp 같은 걸 새로 들이면
// 이 리포의 「의존성 하나」 원칙이 아이콘 때문에 깨진다.
//
// 마스커블 SVG 도 여기서 만든다. fruit-smash 는 icon.svg 를 손으로 복제해
// icon-maskable.svg 를 두는데, 그러면 그림을 고칠 때마다 두 곳을 맞춰야 하고
// 한쪽만 고친 사고가 조용히 지나간다. 여기서는 원본을 BLEED/ART 로 갈라서
// **ART 만 중앙 80% 로 줄인** 파일을 기계가 쓴다.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// 생성물에 원본의 지문을 찍는다. build.mjs 가 이걸 다시 계산해 대조해서,
// **icon.svg 만 고치고 이 스크립트를 안 돌린 채 배포하는 것**을 막는다.
// 그 사고는 아무 에러도 안 낸다 — 옛 그림이 그대로 나갈 뿐이다.
export const stamp = (src) => createHash('sha256').update(src).digest('hex').slice(0, 16);

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIR = join(ROOT, 'icons');
const SRC = join(DIR, 'icon.svg');
// 안드로이드 런처 아이콘이 들어가는 자리. Capacitor 가 만든 프로젝트 안이다.
const RES = join(ROOT, 'android', 'app', 'src', 'main', 'res');

// ── 마스커블 원본 만들기 ────────────────────────────────────────
// 안드로이드는 아이콘을 원형·물방울·둥근사각 중 아무 모양으로나 잘라낸다. 잘려도
// 살아남아야 하는 부분은 중앙 80% 안에 있어야 하고, 배경은 반대로 끝까지 차 있어야
// 한다 — 여백이 있으면 어떤 모양으로 잘리든 그 여백이 그대로 보인다.
function splitSource(svg) {
  const cut = (tag) => {
    const a = svg.indexOf(`<!--${tag}-->`);
    const b = svg.indexOf(`<!--/${tag}-->`);
    if (a < 0 || b < 0) throw new Error(`icon.svg 에서 ${tag} 표시를 못 찾았다. 마스커블을 만들 수 없다.`);
    return svg.slice(a + tag.length + 7, b);
  };
  const head = svg.slice(0, svg.indexOf('<!--BLEED-->'));
  return { head, bleed: cut('BLEED'), art: cut('ART') };
}

function makeMaskable(svg) {
  const { head, bleed, art } = splitSource(svg);
  return `${head}<!-- 이 파일은 icons/icon.svg 에서 생성된다 — \`node tools/icons.mjs\`.
       손으로 고치지 마라. 다음 실행에서 통째로 덮인다.
       src-sha: ${stamp(svg)} -->
  ${bleed.trim()}

  <!-- 안전 영역: 중앙 80%. 512 * 0.8 = 409.6 이고 (512-409.6)/2 = 51.2 만큼 민다 -->
  <g transform="translate(51.2 51.2) scale(0.8)">
  ${art.trim()}
  </g>
</svg>
`;
}

// ── 안드로이드 적응형 아이콘 ────────────────────────────────────
// 안드로이드는 런처 아이콘을 **두 겹**으로 받는다(API 26+). 배경은 화면 끝까지 깔리고,
// 앞판은 그 위에 떠서 런처가 정한 모양(원·물방울·둥근사각)으로 같이 잘린다. 게다가
// 런처에 따라 두 겹이 서로 몇 dp 어긋나게 움직인다(패럴랙스) — 그래서 잘려도 되는
// 여백이 바깥에 필요하다.
//
// 그림은 **새로 그리지 않는다.** icon.svg 의 BLEED/ART 를 그대로 갈라서
//   배경 ← BLEED (마스커블과 같다. 여백이 있으면 어떤 모양으로 잘리든 그게 보인다)
//   앞판 ← ART  (안전 원 안으로 줄이고 나머지는 투명)
// 로 쓴다. 웹 마스커블과 **줄이는 비율만 다르다** — 웹은 중앙 80%, 안드로이드는 더 좁다.

// ART 의 바깥점은 원본 좌표에서 중심으로부터 245px 다. icon.svg 의 관문 주석에
// 「0.8 로 줄이면 바깥점이 중심에서 196px」이라 적혀 있고, 196 / 0.8 = 245 다.
const ART_R = 245;
// 안드로이드 안전 원은 108dp 캔버스의 **중앙 66dp 지름**이다(반지름 33dp). 바깥
// 18dp 씩은 마스킹 몫이고, 72dp 가 아니라 66dp 인 이유가 위의 패럴랙스다.
// 512 캔버스로 환산: 33 / 108 * 512 = 156.4
const SAFE_R = 33 / 108 * 512;
const ART_SCALE = SAFE_R / ART_R;                       // 0.638
const ART_SHIFT = (512 - 512 * ART_SCALE) / 2;

const wrap = (head, body) => `${head}${body}\n</svg>\n`;

// 앞판. 배경을 안 깐다 — 깔면 그 사각형 모서리가 배경 겹 위에 그대로 보인다.
function makeAdaptiveForeground(svg) {
  const { head, art } = splitSource(svg);
  return wrap(head, `  <g transform="translate(${ART_SHIFT.toFixed(2)} ${ART_SHIFT.toFixed(2)}) `
    + `scale(${ART_SCALE.toFixed(4)})">\n  ${art.trim()}\n  </g>`);
}

// 배경. BLEED 만이고 캔버스를 끝까지 채운다.
function makeAdaptiveBackground(svg) {
  const { head, bleed } = splitSource(svg);
  return wrap(head, `  ${bleed.trim()}`);
}

// 밀도별 배수. 적응형 두 겹은 108dp, 옛 런처 아이콘은 48dp 다.
const DPI = [['mdpi', 1], ['hdpi', 1.5], ['xhdpi', 2], ['xxhdpi', 3], ['xxxhdpi', 4]];

const ADAPTIVE_XML = (sha) => `<?xml version="1.0" encoding="utf-8"?>
<!-- tools/icons.mjs 가 icons/icon.svg 에서 만든다. 손으로 고치지 마라.
     src-sha: ${sha} -->
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@mipmap/ic_launcher_background"/>
    <foreground android:drawable="@mipmap/ic_launcher_foreground"/>
</adaptive-icon>
`;

// ── PNG 뽑기 ───────────────────────────────────────────────────
// viewBox 가 있는 SVG 라 어느 크기로 띄워도 벡터가 다시 그려진다. 512 를 찍어
// 축소하는 게 아니다 — 그러면 32px 짜리가 뭉갠 그림이 된다.
const PLAN = [
  ['icon.svg',          512, 'icon-512.png'],
  ['icon.svg',          192, 'icon-192.png'],
  ['icon.svg',          180, 'apple-touch-icon.png'],   // iOS 홈 화면. 이쪽은 애플이 스스로 둥글린다
  ['icon.svg',           32, 'favicon-32.png'],
  ['icon-maskable.svg', 512, 'icon-maskable-512.png'],
  ['icon-maskable.svg', 192, 'icon-maskable-192.png'],
];

let chromium;
try { ({ chromium } = await import('playwright')); }
catch {
  console.error('playwright 를 못 불러왔다 — 아이콘을 뽑을 수 없다.\n  npm i -D playwright && npx playwright install chromium');
  process.exit(1);
}

mkdirSync(DIR, { recursive: true });
const src = readFileSync(SRC, 'utf8');
writeFileSync(join(DIR, 'icon-maskable.svg'), makeMaskable(src));
console.log('icons/icon-maskable.svg  ← icon.svg 에서 생성');

const browser = await chromium.launch();

// SVG 한 장을 size 픽셀 정사각 PNG 로 찍는다.
async function shoot(svgText, size, outPath) {
  const svg = svgText
    // 루트 태그의 width/height 만 바꾼다. 안쪽 rect 의 width 는 건드리면 안 되므로
    // 첫 한 번만 갈아 끼운다.
    .replace(/width="512" height="512"/, `width="${size}" height="${size}"`);
  const page = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 });
  // 외부 요청은 애초에 없지만, 생기면 그건 아이콘이 네트워크에 기대게 됐다는 뜻이다.
  await page.route('**/*', (route) => route.abort());
  await page.setContent(
    `<style>html,body{margin:0;padding:0;background:transparent}svg{display:block}</style>${svg}`);
  await page.screenshot({ path: outPath, omitBackground: true });
  await page.close();
}

try {
  for (const [svgName, size, outName] of PLAN) {
    await shoot(readFileSync(join(DIR, svgName), 'utf8'), size, join(DIR, outName));
    console.log(`icons/${outName}  ${size}x${size}  ← ${svgName}`);
  }

  // ── 안드로이드 런처 아이콘 ──────────────────────────────────
  // **여기서 같이 뽑는 이유.** 따로 두면 icon.svg 를 고치고 한쪽만 돌리게 되고, 그
  // 사고는 아무 에러도 안 낸다 — 웹 아이콘만 새것이고 앱 아이콘은 옛 그림이 나간다.
  // build.mjs 의 src-sha 대조가 「이 스크립트를 돌렸는가」를 잠그므로, 같은 실행에
  // 묶어 두면 그 한 줄이 안드로이드 쪽까지 덮는다.
  const fore = makeAdaptiveForeground(src);
  const back = makeAdaptiveBackground(src);
  const maskable = readFileSync(join(DIR, 'icon-maskable.svg'), 'utf8');
  for (const [dpi, k] of DPI) {
    const out = join(RES, `mipmap-${dpi}`);
    mkdirSync(out, { recursive: true });
    await shoot(fore, 108 * k, join(out, 'ic_launcher_foreground.png'));
    await shoot(back, 108 * k, join(out, 'ic_launcher_background.png'));
    // 옛 런처(API 24·25)와 적응형을 못 쓰는 자리에 쓰이는 한 겹짜리.
    // 네모는 원본 그대로, 동그라미는 **마스커블**이다 — 원본은 관문 선이 아래쪽
    // 끝까지 가서 원으로 자르면 잘린다.
    await shoot(src, 48 * k, join(out, 'ic_launcher.png'));
    await shoot(maskable, 48 * k, join(out, 'ic_launcher_round.png'));
    console.log(`android mipmap-${dpi}  적응형 ${108 * k} · 옛것 ${48 * k}`);
  }
  const xml = ADAPTIVE_XML(stamp(src));
  mkdirSync(join(RES, 'mipmap-anydpi-v26'), { recursive: true });
  for (const name of ['ic_launcher.xml', 'ic_launcher_round.xml'])
    writeFileSync(join(RES, 'mipmap-anydpi-v26', name), xml);
  console.log('android mipmap-anydpi-v26/ic_launcher{,_round}.xml');
} finally {
  await browser.close();
}
