// index.html 을 압축해 dist/games/canthold/index.html 을 만든다.
//
//   node build.mjs
//
// 원본은 주석을 그대로 둔다. 밸런스를 왜 그 값으로 잡았는지가 주석에 길게 들어
// 있어서, 압축 안 하고 올리면 그 내용이 개발자도구에서 다 읽히고 전송량도 매번 나간다.
//
// 압축은 주석·공백만 걷어내는 선까지 한다. 식별자 축약이나 태그 생략 같은 건 안 한다 —
// 얻는 바이트보다 깨질 위험이 크다.
//
// 의존성은 두지 않는다. 이 리포는 npm 패키지가 하나도 없는 게 원칙이다.
import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(fileURLToPath(import.meta.url));
const SRC = join(ROOT, 'index.html');
// 대문과 같은 오리진의 경로로 서빙한다 (eastbirdstudio.com/games/canthold/).
// 서브도메인을 따로 두면 Firebase Auth 세션이 갈린다 —
// eastbird-studio/docs/sso-migration.md 의 A안이다.
const GAME_ID = 'canthold';
const OUT_DIR = join(ROOT, 'dist', 'games', GAME_ID);
const OUT = join(OUT_DIR, 'index.html');

// ── JS 주석 제거 ──────────────────────────────────────────────
// 문자열·템플릿·정규식 안의 // 나 /* 를 주석으로 착각하면 안 되므로 한 글자씩 훑는다.
// 정규식 리터럴은 앞 토큰으로 판별한다 — 나눗셈과 구분해야 한다.
function stripJsComments(src) {
  let out = '';
  let i = 0;
  let prev = '';                                  // 직전 의미 있는 문자
  const canBeRegex = () => prev === '' || '(,=:[!&|?{};+-*%~^<>'.includes(prev);

  while (i < src.length) {
    const c = src[i], d = src[i + 1];

    if (c === '/' && d === '/') {                 // 한 줄 주석
      while (i < src.length && src[i] !== '\n') i++;
      continue;
    }
    if (c === '/' && d === '*') {                 // 블록 주석
      i += 2;
      while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) i++;
      i += 2;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') {    // 문자열·템플릿
      const q = c;
      out += c; i++;
      while (i < src.length) {
        if (src[i] === '\\') { out += src[i] + src[i + 1]; i += 2; continue; }
        out += src[i];
        if (src[i] === q) { i++; break; }
        i++;
      }
      prev = q;
      continue;
    }
    if (c === '/' && canBeRegex()) {              // 정규식 리터럴
      let j = i + 1, inClass = false, ok = false;
      while (j < src.length) {
        const e = src[j];
        if (e === '\\') { j += 2; continue; }
        if (e === '[') inClass = true;
        else if (e === ']') inClass = false;
        else if (e === '/' && !inClass) { ok = true; break; }
        else if (e === '\n') break;
        j++;
      }
      if (ok) {
        while (j + 1 < src.length && /[a-z]/.test(src[j + 1])) j++;
        out += src.slice(i, j + 1);
        prev = '/';
        i = j + 1;
        continue;
      }
    }

    out += c;
    if (!/\s/.test(c)) prev = c;
    i++;
  }
  return out;
}

// 줄 앞뒤 공백을 걷고 빈 줄을 없앤다. 줄바꿈은 남긴다 —
// 세미콜론 없이 끝나는 줄이 있어서 전부 한 줄로 붙이면 위험하다.
const squeezeLines = s => s.split('\n').map(l => l.trim()).filter(Boolean).join('\n');

function build() {
  const html = readFileSync(SRC, 'utf8');

  const scriptStart = html.indexOf('<script>');
  const scriptEnd = html.indexOf('</' + 'script>');
  if (scriptStart < 0 || scriptEnd < 0) throw new Error('script 블록을 못 찾았다');
  const js = html.slice(scriptStart + '<script>'.length, scriptEnd);

  const styleStart = html.indexOf('<style>');
  const styleEnd = html.indexOf('</style>');
  if (styleStart < 0 || styleEnd < 0) throw new Error('style 블록을 못 찾았다');
  const css = html.slice(styleStart + '<style>'.length, styleEnd);

  const minJs = squeezeLines(stripJsComments(js));
  const minCss = squeezeLines(css.replace(/\/\*[\s\S]*?\*\//g, ''))
    .replace(/\s*([{}:;,])\s*/g, '$1');

  let out = html.slice(0, styleStart + '<style>'.length) + minCss + html.slice(styleEnd);
  const s2 = out.indexOf('<script>'), e2 = out.indexOf('</' + 'script>');
  out = out.slice(0, s2 + '<script>'.length) + minJs + out.slice(e2);
  out = out.replace(/<!--[\s\S]*?-->/g, '').split('\n').map(l => l.trimEnd()).join('\n');

  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(OUT, out);
  return { html, out, minJs };
}

// ── 검사 ──────────────────────────────────────────────────────
// 압축본이 문법으로 성립하는지, 그리고 게임이 성립하는 데 필요한 값이
// 살아남았는지 확인한다. 압축이 조용히 무언가를 먹으면 여기서 걸려야 한다.
function verify({ html, out, minJs }) {
  // 검사용 임시 파일은 자산 폴더에 남기면 그대로 배포된다
  const tmp = join(OUT_DIR, '.check.mjs');
  writeFileSync(tmp, minJs);
  try { execFileSync(process.execPath, ['--check', tmp], { stdio: 'pipe' }); }
  finally { rmSync(tmp, { force: true }); }

  const must = [
    'STAGES', 'SPR', 'loadStage', 'mergeTowers', 'summon', 'canPlace',
    'requestAnimationFrame(frame)', '이번 웨이브는 못 막습니다', 'cant-hold-progress',
    // 동적 import 주소는 문자열 안에 // 가 들어 있다. 주석 제거가 이걸 먹으면
    // 로그인이 통째로 죽는데 화면에는 아무 표시도 안 난다.
    'https://www.gstatic.com/firebasejs/', 'eastbirdstudio-abfb5', 'games/canthold/saves',
    'snapshotRun', 'restoreRun', 'mergeBundle',
  ];
  const missing = must.filter(k => !out.includes(k));
  if (missing.length) throw new Error('압축본에서 사라진 것: ' + missing.join(', '));

  // 도트가 통째로 날아가면 게임이 아니라 회색 사각형이 된다
  const dots = (out.match(/'[.01234]{32}'/g) || []).length;
  if (dots < 480) throw new Error('도트 줄이 모자란다: ' + dots);

  const before = Buffer.byteLength(html), after = Buffer.byteLength(out);
  return { before, after, cut: (1 - after / before) * 100 };
}

const built = build();
const r = verify(built);
console.log(
  `dist/games/${GAME_ID}/index.html  ${(r.before / 1024).toFixed(1)}KB → ${(r.after / 1024).toFixed(1)}KB` +
  `  (${r.cut.toFixed(1)}% 감소)`);
