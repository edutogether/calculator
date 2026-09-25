/* 빌드 결과를 "파일 하나"로 만든다 — 번들된 앱 스크립트를 index.html 의 원래 자리
 * (`<!--inline:app-->` 표시)에 **클래식 인라인 <script>** 로 넣는다.
 *
 * 왜 이렇게 하나:
 * - 이 앱은 내려받은 HTML 파일 하나만 열어도 돌아야 한다(.claude/rules/app.md). 스크립트를
 *   별도 파일로 두면 `file://`로 연 파일은 빈 화면이 된다.
 * - Vite 는 모듈 스크립트를 <head> 로 옮기고 `type="module"` 로 넣는데, 모듈 스크립트는
 *   문서를 다 읽은 뒤에 실행된다. 원래 앱은 본문 끝의 클래식 스크립트라 그 자리에서 바로
 *   실행됐다 — 실행 시점을 바꾸지 않으려고 원래 자리에 클래식 스크립트로 되돌린다.
 *   그래서 번들 형식은 IIFE 다(vite.config.mts).
 */
import type { Plugin } from 'vite';

const MARK = '<!--inline:app-->';

export function inlineApp(): Plugin {
  return {
    name: 'inline-app',
    apply: 'build',
    enforce: 'post',
    generateBundle(_opts, bundle) {
      const html = bundle['index.html'];
      if (!html || html.type !== 'asset') this.error('index.html 산출물이 없다');
      let src = String(html.source);
      if (src.split(MARK).length !== 2) this.error(`index.html 에 ${MARK} 표시가 정확히 하나 있어야 한다`);
      const chunks = Object.values(bundle).filter(f => f.type === 'chunk');
      if (chunks.length !== 1 || chunks[0].type !== 'chunk' || !chunks[0].isEntry) {
        this.error(`앱 번들은 진입 청크 하나여야 한다(지금 ${chunks.length}개)`);
      }
      const chunk = chunks[0] as Extract<typeof chunks[0], { type: 'chunk' }>;
      if (/<\/script/i.test(chunk.code)) this.error('번들 안에 </script 가 있어 인라인할 수 없다');
      const tag = new RegExp(`<script type="module" crossorigin src="[^"]*${chunk.fileName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"></script>\\s*`);
      if (!tag.test(src)) this.error(`Vite 가 넣은 ${chunk.fileName} <script> 태그를 찾지 못했다`);
      src = src.replace(tag, '');
      src = src.replace(MARK, () => `<script>\n${chunk.code}</script>`);
      delete bundle[chunk.fileName];
      const leftovers = Object.keys(bundle).filter(k => k !== 'index.html');
      if (leftovers.length) this.error(`인라인되지 않은 산출물이 남았다: ${leftovers.join(', ')}`);
      if (/\/assets\//.test(src)) this.error('index.html 이 아직 /assets/ 를 가리킨다');
      html.source = src;
    },
  };
}
