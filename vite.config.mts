import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { inlineApp } from './build/inline-app.mts';

/* 배포 산출물은 dist/ 의 두 파일뿐이다 — index.html(로직·스타일 전부 인라인) + og.jpg(public/에서 복사).
 * index.html 이 "파일 하나로 완결"돼야 하는 이유는 .claude/rules/app.md 참고
 * (카카오톡으로 받은 HTML 파일을 내려받아 그대로 열어도 돌아야 한다). */
export default defineConfig({
  /* CSS를 고치지 않고 그대로 내보낸다. Vite 8 기본값(LightningCSS)은 압축하면서
   * `color-scheme:light dark` 옆에 `--lightningcss-light/dark` 보조 변수를 끼워 넣는다 —
   * 화면 불변이 원칙인 전환에서 도구가 스타일을 다시 쓰게 두지 않는다. 이 둘을 끄면
   * 원본 CSS가 한 글자도 바뀌지 않고 나온다(2026-09-25 확인). */
  css: { transformer: 'postcss' },
  plugins: [react(), inlineApp()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    modulePreload: false,
    cssMinify: false,
    // 번들을 원래 자리에 클래식 <script> 로 넣으므로 IIFE 한 덩어리로 낸다(build/inline-app.mts).
    // JS 는 압축한다 — React 가 들어가 압축하지 않으면 파일 하나가 750KB, 압축하면 360KB 다.
    // 이 파일은 카카오톡으로 오가고 내려받아 열리는 파일 하나라 크기가 곧 사용자 경험이다.
    // (CSS 는 인라인 <style> 그대로라 압축 대상이 아니다 — 위 cssMinify.)
    minify: true,
    rollupOptions: { output: { format: 'iife' } },
  },
});
