import { defineConfig } from 'vite';

export default defineConfig({
  // 미니앱은 토스 CDN 하위 경로에 올라간다. 절대경로로 박으면 자원을 못 찾는다.
  base: './',
  build: {
    outDir: 'dist',
    // .ait 는 압축 해제 기준 100MB 이하를 권장한다. 지금은 한참 밑이지만 경고 한도를
    // 낮게 둬서 에셋이 불어나는 걸 빌드 때 바로 알아챈다.
    chunkSizeWarningLimit: 1024,
  },
  server: {
    host: 'localhost',
    port: 5173,
  },
});
