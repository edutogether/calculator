/* 두 캡처 폴더를 대조한다. 차이가 하나라도 있으면 종료 코드 1.
 *
 *   node scripts/verify/compare.mjs <기준선 폴더> <대조할 폴더> [--diff <차이 그림을 둘 폴더>]
 *
 * 허용 오차는 없다 — 픽셀은 한 점, 위치·크기는 0px, 계산 스타일·속성·텍스트는 글자 하나까지 같아야 한다.
 * 유일한 예외는 "공백만 있는 텍스트 노드"다: 화면(픽셀)과 계산 스타일이 같은데 태그 사이
 * 들여쓰기 공백만 다른 경우는 따로 세어 **보고하되 실패로 치지 않는다**(`rawText`).
 * 그 공백이 화면을 바꿨다면 픽셀·위치 대조가 이미 실패로 잡는다.
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { pathToFileURL } from 'node:url';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';

const MAX_LIST = 25;

function walk(dir, base = dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(e =>
    e.isDirectory() ? walk(path.join(dir, e.name), base) : [path.relative(base, path.join(dir, e.name)).replace(/\\/g, '/')]);
}

function comparePng(a, b, diffOut) {
  const A = PNG.sync.read(a), B = PNG.sync.read(b);
  if (A.width !== B.width || A.height !== B.height) return `크기 다름 ${A.width}×${A.height} → ${B.width}×${B.height}`;
  const d = new PNG({ width: A.width, height: A.height });
  const n = pixelmatch(A.data, B.data, d.data, A.width, A.height, { threshold: 0, includeAA: true });
  if (n && diffOut) { fs.mkdirSync(path.dirname(diffOut), { recursive: true }); fs.writeFileSync(diffOut, PNG.sync.write(d)); }
  return n ? `픽셀 ${n}개 다름` : null;
}

function deepDiff(a, b, p, out) {
  if (out.length >= MAX_LIST * 4) return;
  if (Object.is(a, b)) return;
  if (typeof a !== typeof b || a === null || b === null || typeof a !== 'object' || Array.isArray(a) !== Array.isArray(b)) {
    out.push(`${p}: ${JSON.stringify(a)?.slice(0, 160)} → ${JSON.stringify(b)?.slice(0, 160)}`); return;
  }
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const k of keys) deepDiff(a[k], b[k], p ? `${p}.${k}` : k, out);
}

function compareDom(a, b) {
  const A = JSON.parse(zlib.gunzipSync(a)), B = JSON.parse(zlib.gunzipSync(b));
  const hard = [], ws = [];
  deepDiff(A.head, B.head, 'head', hard);
  deepDiff(A.active, B.active, 'focus', hard);
  deepDiff(A.scroll, B.scroll, 'scroll', hard);
  deepDiff(A.location, B.location, 'location', hard);
  const mapA = new Map(A.els.map(e => [e.key, e])), mapB = new Map(B.els.map(e => [e.key, e]));
  for (const [k, ea] of mapA) {
    const eb = mapB.get(k);
    if (!eb) { hard.push(`요소 없어짐: ${k} <${ea.tag}>`); continue; }
    const { rawText: ra, ...ra2 } = ea, { rawText: rb, ...rb2 } = eb;
    deepDiff(ra2, rb2, k, hard);
    if (ra !== rb) ws.push(`${k}: 공백 ${JSON.stringify(ra)} → ${JSON.stringify(rb)}`);
  }
  for (const k of mapB.keys()) if (!mapA.has(k)) hard.push(`요소 생김: ${k} <${mapB.get(k).tag}>`);
  const order = (m, o) => [...m.keys()].filter(k => o.has(k));
  const oa = order(mapA, mapB), ob = order(mapB, mapA);
  if (oa.join('\n') !== ob.join('\n')) hard.push('요소 순서가 다르다(같은 키 집합, 다른 문서 순서)');
  return { hard, ws };
}

export function compare(dirA, dirB, diffDir) {
  const fa = new Set(walk(dirA)), fb = new Set(walk(dirB));
  // .xlsx 는 원본 파일(셀 값은 values.json 에서 대조), .render.png 는 사람이 볼 참고 그림이다(capture.mjs 머리말).
  const all = [...new Set([...fa, ...fb])].filter(f => !f.endsWith('.xlsx') && !f.endsWith('.render.png')).sort();
  const fails = [], wsNotes = [];
  for (const f of all) {
    if (!fa.has(f)) { fails.push(`${f}: 대조 쪽에만 있음`); continue; }
    if (!fb.has(f)) { fails.push(`${f}: 기준선에만 있음`); continue; }
    const a = fs.readFileSync(path.join(dirA, f)), b = fs.readFileSync(path.join(dirB, f));
    if (f.endsWith('.png')) {
      const r = comparePng(a, b, diffDir && path.join(diffDir, f.replace(/\.png$/, '.diff.png')));
      if (r) fails.push(`${f}: ${r}`);
    } else if (f.endsWith('.dom.json.gz')) {
      const { hard, ws } = compareDom(a, b);
      if (hard.length) fails.push(`${f}: ${hard.length}건\n    ` + hard.slice(0, MAX_LIST).join('\n    '));
      if (ws.length) wsNotes.push(`${f}: 공백만 다른 텍스트 ${ws.length}건\n    ` + ws.slice(0, 5).join('\n    '));
    } else if (f.endsWith('.json')) {
      const out = []; deepDiff(JSON.parse(a), JSON.parse(b), '', out);
      if (out.length) fails.push(`${f}:\n    ` + out.slice(0, MAX_LIST).join('\n    '));
    } else if (!a.equals(b)) {
      fails.push(`${f}: 내용 다름 — ${a.toString().slice(0, 200)} → ${b.toString().slice(0, 200)}`);
    }
  }
  return { files: all.length, fails, wsNotes };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [a, b] = process.argv.slice(2).filter(x => !x.startsWith('--'));
  const di = process.argv.indexOf('--diff');
  if (!a || !b) { console.error('사용법: compare.mjs <기준선> <대조> [--diff <폴더>]'); process.exit(2); }
  const { files, fails, wsNotes } = compare(path.resolve(a), path.resolve(b), di > 0 ? path.resolve(process.argv[di + 1]) : null);
  if (files === 0) { console.error('대조할 파일이 0개다 — 폴더를 잘못 줬다(빈 게이트 방지).'); process.exit(1); }
  if (wsNotes.length) console.log(`참고 — 공백만 다른 텍스트 노드(실패 아님):\n  ${wsNotes.join('\n  ')}\n`);
  if (fails.length) { console.log(`차이 ${fails.length}건 / 파일 ${files}개\n  ${fails.join('\n  ')}`); process.exit(1); }
  console.log(`차이 0건 / 파일 ${files}개`);
}
