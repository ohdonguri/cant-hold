// Real Chromium AudioContext lifecycle + OfflineAudioContext signal checks.
// Optional output directory receives a WAV sampler made from the production score.
// node tools/bgm-browser-check.js /tmp/cant-hold-bgm
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.route('https://**/*', route => route.abort());
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(pathToFileURL(path.join(__dirname, '../index.html')).href);
    assert.equal(await page.evaluate(() => actx), null, 'audio stays locked before gesture');
    await page.evaluate(() => {
      document.getElementById('ebIntro')?.remove();
      loadStage(0); state.phase = 'build';
    });
    await page.locator('canvas').click({ position: { x: 5, y: 5 } });
    await page.waitForFunction(() => actx?.state === 'running' && bgmVoices.size > 0);
    assert.equal(await page.evaluate(() => bgmFailed), false);
    await page.evaluate(() => togglePause());
    await page.waitForFunction(() => bgmVoices.size === 0 && bgmBus === null);
    await page.evaluate(() => togglePause());
    await page.waitForFunction(() => bgmVoices.size > 0);
    await page.evaluate(() => setSoundEnabled(false));
    assert.equal(await page.evaluate(() => bgmVoices.size), 0);
    await page.evaluate(() => setSoundEnabled(true));
    await page.waitForFunction(() => bgmVoices.size > 0);
    await page.evaluate(() => {
      window.dispatchEvent(new Event('pagehide'));
      cancelAnimationFrame(rafId); rafId = null;
    });
    assert.equal(await page.evaluate(() => bgmVoices.size), 0);
    await page.evaluate(() => window.dispatchEvent(new Event('pageshow')));
    await page.waitForFunction(() => bgmVoices.size > 0);
    await page.evaluate(() => { state.phase = 'clear'; });
    await page.waitForFunction(() => bgmVoices.size === 0);
    console.log('PASS real browser: gesture unlock, pause/resume, mute, pagehide/pageshow, clear');
    await page.evaluate(async () => {
      cancelAnimationFrame(rafId); rafId = null; bgmStop(); await actx.close();
    });
    const signals = await page.evaluate(async () => {
      const summaries = [], preview = [];
      const sr = 22050;
      for (const [family, theme] of Object.entries(BGM_THEMES)) {
        const tick = 60 / theme.bpm / theme.division;
        const cycle = theme.steps * 32;
        actx = new OfflineAudioContext(1, Math.ceil((cycle * tick + 5) * sr), sr);
        comp = actx.createDynamicsCompressor(); comp.connect(actx.destination);
        bgmBus = actx.createGain(); bgmBus.gain.value = BGM_LEVEL; bgmBus.connect(comp);
        bgmNoise = null;
        for (let step = 0; step < cycle; step++) {
          const intensity = step < theme.steps * 8 ? 0 : step < theme.steps * 16 ? 1 : 2;
          for (const note of bgmPattern(theme, step, Math.floor(step / (theme.steps * 12)) % 3, intensity))
            bgmVoice(note, theme, step * tick, tick);
        }
        const buffer = await actx.startRendering(), data = buffer.getChannelData(0);
        let sum = 0, peak = 0;
        for (const x of data) { peak = Math.max(peak, Math.abs(x)); sum += x * x; }
        summaries.push({ family, peak, rms: Math.sqrt(sum / data.length), voices: bgmVoices.size });
        // Eight seconds of the fully developed arrangement, gently faded at both edges.
        const from = Math.floor(theme.steps * 16 * tick * sr), length = 8 * sr;
        for (let i = 0; i < length; i++) {
          const fade = Math.min(1, i / (sr * .06), (length - 1 - i) / (sr * .12));
          preview.push(Math.round(data[from + i] * fade * 32767));
        }
      }
      const wav = new ArrayBuffer(44 + preview.length * 2), view = new DataView(wav);
      const text = (at, str) => [...str].forEach((c, i) => view.setUint8(at + i, c.charCodeAt(0)));
      text(0, 'RIFF'); view.setUint32(4, wav.byteLength - 8, true); text(8, 'WAVE');
      text(12, 'fmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true);
      view.setUint16(22, 1, true); view.setUint32(24, sr, true); view.setUint32(28, sr * 2, true);
      view.setUint16(32, 2, true); view.setUint16(34, 16, true); text(36, 'data');
      view.setUint32(40, preview.length * 2, true);
      preview.forEach((n, i) => view.setInt16(44 + i * 2, n, true));
      let binary = ''; const bytes = new Uint8Array(wav);
      for (let i = 0; i < bytes.length; i += 8192)
        binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
      return { summaries, wav: btoa(binary) };
    });
    for (const s of signals.summaries) {
      assert.ok(Number.isFinite(s.rms) && s.rms > .001, `${s.family}: audible finite signal`);
      assert.ok(s.peak < .9, `${s.family}: no clipping`);
      assert.equal(s.voices, 0, `${s.family}: completed nodes released`);
      console.log(`PASS ${s.family}: peak ${s.peak.toFixed(3)}, RMS ${s.rms.toFixed(3)}, voices ${s.voices}`);
    }
    assert.deepEqual(errors, []);
    if (process.argv[2]) {
      fs.mkdirSync(process.argv[2], { recursive: true });
      const output = path.resolve(process.argv[2], 'theme-bgm-sampler.wav');
      fs.writeFileSync(output, Buffer.from(signals.wav, 'base64'));
      console.log(output);
    }
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
