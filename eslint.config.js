import js from '@eslint/js';
import globals from 'globals';

/* 앱 소스(src/·build/·vite.config.mts)는 TypeScript 라 `npm run typecheck`(tsc, strict·미사용 검사)가
 * 맡는다. ESLint 는 나머지 JS — 배포 전 검사(scripts/)·테스트(tests/)·전환 대조 도구(scripts/verify/)를 본다.
 * 스타일 강제보다 실수(안 쓰는 변수, 정의 안 된 이름) 검출이 목적이다. */
export default [
  { ignores: ['node_modules/**', 'dist/**', '.verify/**', '.claude/**', 'src/**', 'build/**'] },
  js.configs.recommended,
  {
    files: ['**/*.{js,mjs}'],
    languageOptions: { ecmaVersion: 2024, sourceType: 'module', globals: { ...globals.node } },
    rules: {
      // 실패해도 다음 방법으로 넘어가는 정리 코드에 빈 catch 를 일부러 쓴다.
      'no-empty': ['error', { allowEmptyCatch: true }],
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', caughtErrors: 'none' }],
    },
  },
  {
    // 대조 도구 안에서 page.evaluate 로 브라우저에 넘겨 실행하는 함수들 — 브라우저 전역을 쓴다.
    files: ['scripts/verify/**/*.mjs'],
    languageOptions: { globals: { ...globals.node, ...globals.browser, XLSX: 'readonly' } },
  },
];
