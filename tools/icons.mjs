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
try {
  for (const [svgName, size, outName] of PLAN) {
    const svg = readFileSync(join(DIR, svgName), 'utf8')
      // 루트 태그의 width/height 만 바꾼다. 안쪽 rect 의 width 는 건드리면 안 되므로
      // 첫 한 번만 갈아 끼운다.
      .replace(/width="512" height="512"/, `width="${size}" height="${size}"`);
    const page = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 });
    // 외부 요청은 애초에 없지만, 생기면 그건 아이콘이 네트워크에 기대게 됐다는 뜻이다.
    await page.route('**/*', (route) => route.abort());
    await page.setContent(
      `<style>html,body{margin:0;padding:0;background:transparent}svg{display:block}</style>${svg}`);
    await page.screenshot({ path: join(DIR, outName), omitBackground: true });
    await page.close();
    console.log(`icons/${outName}  ${size}x${size}  ← ${svgName}`);
  }
} finally {
  await browser.close();
}
