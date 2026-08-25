// 릴리스 APK 를 만든다. `npm run android:apk` 가 부른다 (앞에 android:sync 가 붙는다).
//
//   node tools/android-build.mjs
//
// 하는 일은 셋이다: 굽고 · APK 안을 열어 보고 · 서명 지문을 찍는다.
// 셋을 한 명령으로 묶어 두는 이유는 **뒤 둘을 사람이 기억해야 하는 순간 안 하게
// 되기 때문**이다. 서명이 빠진 APK 도, 로그인 줄이 켜진 APK 도 아무 에러 없이 나온다.
//
// ── JDK 를 여기서 고르는 이유 ────────────────────────────────
// Capacitor 8 이 깔아 주는 Gradle 8.14 는 **JDK 25 에서 못 돈다** — settings.gradle 을
// 읽다가 "Unsupported class file major version 69" 로 죽는다. 이 기계의 기본 java 가
// 25 라(homebrew) 아무것도 안 하면 그 메시지를 그대로 받게 되는데, 그걸 보고
// 「JDK 를 낮춰야 한다」로 읽는 사람은 없다. 그래서 21 을 찾아서 넘긴다.
// (Gradle 을 9 로 올려 25 를 쓰는 길도 있지만, 형제 리포와 툴체인이 갈린다.)
import { execFileSync } from 'node:child_process';
import { existsSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const APK = join(ROOT, 'android', 'app', 'build', 'outputs', 'apk', 'release', 'app-release.apk');

const run = (cmd, args, opts = {}) =>
  (execFileSync(cmd, args, { stdio: 'pipe', maxBuffer: 64 * 1024 * 1024, ...opts }) || '').toString();

// JDK 21. 맥은 java_home 이 골라 주고, 그게 없으면(리눅스 등) 환경의 JAVA_HOME 을 믿는다.
function jdk21() {
  try { return run('/usr/libexec/java_home', ['-v', '21']).trim(); }
  catch { /* 맥이 아니거나 21 이 없다 */ }
  if (process.env.JAVA_HOME) return process.env.JAVA_HOME;
  throw new Error('JDK 21 을 못 찾았다. 설치하거나 JAVA_HOME 을 21 로 맞춰라 (Gradle 8.14 는 JDK 25 에서 안 돈다).');
}

// ── keystore 가 있어야 릴리스가 **서명된다** ──────────────────
// 없으면 build.gradle 이 signingConfig 를 아예 안 만들고, gradle 은 그래도
// **성공한다** — 서명 안 된 app-release-unsigned.apk 가 나올 뿐이다.
// 그 APK 는 설치도 업로드도 안 되는데 빌드 로그만 보면 초록불이다.
if (!existsSync(join(ROOT, 'android', 'key.properties'))) {
  throw new Error(
    'android/key.properties 가 없다 — 서명 없이 구우면 설치도 업로드도 안 되는 APK 가 나온다.\n'
    + '  형제 리포(fruit-smash)의 android/key.properties 를 그대로 복사해라. 같은 키를 공용으로 쓴다.');
}

const JAVA_HOME = jdk21();
console.log(`  JDK  ${JAVA_HOME}`);
run('./gradlew', ['assembleRelease'], {
  cwd: join(ROOT, 'android'),
  stdio: 'inherit',
  env: { ...process.env, JAVA_HOME },
});
if (!existsSync(APK)) throw new Error(`APK 가 안 나왔다: ${APK}`);

// 안이 맞는지 본다. 게임이 온전한가 · 로그인 줄이 꺼졌는가 (tools/android-sync.mjs).
run(process.execPath, [join(ROOT, 'tools', 'android-sync.mjs'), '--apk', APK], { stdio: 'inherit' });

// ── 서명 지문 ────────────────────────────────────────────────
// **형제 리포(fruit-smash)와 같은 키여야 한다.** 지문은 공개 정보라 적어도 된다.
// apksigner 는 build-tools 안에 있고 PATH 에는 보통 없다.
const btDir = join(process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT
  || join(process.env.HOME, 'Library', 'Android', 'sdk'), 'build-tools');
let apksigner = null;
if (existsSync(btDir)) {
  const { readdirSync } = await import('node:fs');
  for (const v of readdirSync(btDir).sort().reverse()) {
    const p = join(btDir, v, 'apksigner');
    if (existsSync(p)) { apksigner = p; break; }
  }
}
const mb = (statSync(APK).size / 1024 / 1024).toFixed(1);
console.log(`\n  APK  ${APK}  ${mb}MB`);
if (!apksigner) {
  console.log('  apksigner 를 못 찾아 서명 지문을 못 찍었다 (build-tools 를 확인해라)');
} else {
  const out = run(apksigner, ['verify', '--print-certs', APK], { env: { ...process.env, JAVA_HOME } });
  for (const line of out.split('\n')) if (/SHA-(1|256) digest|Signer #1 certificate DN/.test(line)) console.log('  ' + line.trim());
}
