/* 페이지 안에서 도는 DOM 스냅샷. 화면 픽셀(스크린샷)이 못 잡는 것까지 기록한다 —
 * 요소마다 계산된 CSS·위치·크기, 모든 속성(aria-*·role·title·id 포함), 입력칸의 현재 값,
 * ::before/::after, <head>의 meta·link·title, 포커스 위치, 스크롤 위치.
 *
 * 요소는 문서 순서가 아니라 **안정적인 키**로 짝짓는다(COMMON_STANDARDS §5.5): 가장 가까운
 * id 조상에서부터의 경로(`#id>div:nth-of-type(2)>span:nth-of-type(1)`). 순서로 짝지으면
 * 요소 하나가 빠졌을 때 그 뒤가 전부 어긋나 진짜 차이가 묻힌다.
 */

// 결과물(픽셀)에 영향을 줄 수 있는 계산 스타일. 위치·크기는 rect로 따로 잰다.
export const STYLE_PROPS = [
  'display', 'position', 'top', 'right', 'bottom', 'left', 'float', 'clear', 'z-index', 'box-sizing',
  'width', 'height', 'min-width', 'min-height', 'max-width', 'max-height',
  'margin-top', 'margin-right', 'margin-bottom', 'margin-left',
  'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
  'border-top-width', 'border-right-width', 'border-bottom-width', 'border-left-width',
  'border-top-style', 'border-right-style', 'border-bottom-style', 'border-left-style',
  'border-top-color', 'border-right-color', 'border-bottom-color', 'border-left-color',
  'border-top-left-radius', 'border-top-right-radius', 'border-bottom-right-radius', 'border-bottom-left-radius',
  'outline-style', 'outline-width', 'outline-color', 'outline-offset',
  'color', 'background-color', 'background-image', 'background-position', 'background-size', 'background-repeat',
  'opacity', 'visibility', 'overflow-x', 'overflow-y', 'overscroll-behavior-y', 'overscroll-behavior-x',
  'font-family', 'font-size', 'font-weight', 'font-style', 'font-stretch', 'line-height', 'letter-spacing',
  'word-spacing', 'text-align', 'text-decoration-line', 'text-decoration-color', 'text-decoration-style',
  'text-transform', 'text-indent', 'text-overflow', 'white-space', 'word-break', 'overflow-wrap',
  'vertical-align', 'font-variant-numeric', 'font-feature-settings', 'text-rendering', '-webkit-font-smoothing',
  'flex-direction', 'flex-wrap', 'flex-grow', 'flex-shrink', 'flex-basis', 'justify-content', 'justify-items',
  'align-items', 'align-self', 'align-content', 'order', 'row-gap', 'column-gap',
  'grid-template-columns', 'grid-template-rows', 'grid-template-areas', 'grid-row-start', 'grid-row-end',
  'grid-column-start', 'grid-column-end', 'grid-auto-flow',
  'transform', 'transform-origin', 'transition-property', 'transition-duration', 'transition-timing-function',
  'transition-delay', 'animation-name', 'animation-duration', 'animation-timing-function',
  'animation-fill-mode', 'animation-iteration-count', 'animation-delay',
  'cursor', 'pointer-events', 'user-select', 'box-shadow', 'text-shadow', 'filter', 'backdrop-filter',
  'list-style-type', 'fill', 'stroke', '-webkit-tap-highlight-color', 'caret-color', 'accent-color',
  'color-scheme', 'scrollbar-width', 'object-fit', 'clip-path', 'isolation', 'mix-blend-mode',
  'content', 'inset-inline-start', 'direction', 'hyphens', 'tab-size', 'appearance',
];

export const PSEUDO_PROPS = ['content', 'display', 'position', 'width', 'height', 'color', 'background-color',
  'top', 'left', 'right', 'bottom', 'transform', 'opacity', 'border-top-width', 'border-top-color',
  'font-size', 'font-weight', 'margin-left', 'margin-right'];

/** page.evaluate 에 넘기는 함수. 인자는 { styleProps, pseudoProps }. 직렬화되어 페이지 안에서 돈다. */
export function domSnapshot({ styleProps, pseudoProps }) {
  const keyOf = new Map();
  const used = new Map();
  function key(el) {
    if (keyOf.has(el)) return keyOf.get(el);
    let k;
    if (el.id) k = '#' + el.id;
    else if (el === document.body) k = 'body';
    else if (el === document.documentElement) k = 'html';
    else {
      const parent = el.parentElement;
      const same = [...parent.children].filter(c => c.tagName === el.tagName);
      k = key(parent) + '>' + el.tagName.toLowerCase() + ':nth-of-type(' + (same.indexOf(el) + 1) + ')';
    }
    const n = (used.get(k) || 0) + 1; used.set(k, n);
    if (n > 1) k += '@dup' + n;            // 같은 id가 둘이면 그 사실 자체가 드러나게
    keyOf.set(el, k);
    return k;
  }
  const ownText = el => [...el.childNodes].filter(n => n.nodeType === 3).map(n => n.nodeValue).join('');
  const els = [];
  for (const el of document.body.querySelectorAll('*')) {
    if (el.tagName === 'SCRIPT' || el.tagName === 'STYLE') continue;
    const cs = getComputedStyle(el);
    const styles = {};
    for (const p of styleProps) styles[p] = cs.getPropertyValue(p);
    const pseudo = {};
    for (const ps of ['::before', '::after']) {
      const pc = getComputedStyle(el, ps);
      const c = pc.getPropertyValue('content');
      if (c && c !== 'none' && c !== 'normal') {
        pseudo[ps] = {};
        for (const p of pseudoProps) pseudo[ps][p] = pc.getPropertyValue(p);
      }
    }
    const r = el.getBoundingClientRect();
    const attrs = {};
    for (const a of el.attributes) attrs[a.name] = a.value;
    const raw = ownText(el);
    const state = {};
    if ('value' in el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT')) state.value = el.value;
    if (el.tagName === 'INPUT') { state.checked = el.checked; state.indeterminate = el.indeterminate; }
    if ('disabled' in el) state.disabled = el.disabled;
    state.hidden = el.hidden;
    if (el.scrollHeight > el.clientHeight || el.scrollWidth > el.clientWidth) {
      state.scroll = [el.scrollTop, el.scrollLeft, el.scrollHeight, el.scrollWidth];
    }
    els.push({
      key: key(el), tag: el.tagName.toLowerCase(), attrs, state,
      text: raw.replace(/\s+/g, ' ').trim(), rawText: raw,
      rect: [r.x, r.y, r.width, r.height], styles, pseudo,
    });
  }
  const head = {
    title: document.title,
    html: Object.fromEntries([...document.documentElement.attributes].map(a => [a.name, a.value])),
    body: Object.fromEntries([...document.body.attributes].map(a => [a.name, a.value])),
    meta: [...document.querySelectorAll('meta')].map(m => Object.fromEntries([...m.attributes].map(a => [a.name, a.value]))),
    link: [...document.querySelectorAll('link')].map(l => Object.fromEntries([...l.attributes].map(a => [a.name, a.value]))),
    // 외부 스크립트는 주소·무결성 값까지 같아야 한다(SRI). 인라인 스크립트는 번들로 바뀌므로 세지 않는다.
    extScripts: [...document.querySelectorAll('script[src]')].map(s => Object.fromEntries([...s.attributes].map(a => [a.name, a.value]))),
  };
  return {
    head, els,
    active: document.activeElement ? (document.activeElement === document.body ? 'body' : key(document.activeElement)) : null,
    scroll: [window.scrollX, window.scrollY, document.documentElement.scrollWidth, document.documentElement.scrollHeight],
    location: { hash: location.hash, search: location.search },
  };
}
