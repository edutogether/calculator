/* 테스트 헬퍼 — 앱을 jsdom 안에서 **그대로** 실행하고, 사람이 하는 것처럼 화면으로만 다룬다.
 *
 * 입력칸에 치고(input 이벤트), 버튼을 누르고(click), 화면에 찍힌 글자·클래스를 읽는다.
 * 앱 내부 변수(M·D·render …)는 건드리지 않는다 — 그래서 같은 테스트가 React 전환 전
 * 원본(freeze 태그의 index.html)과 전환 후 산출물(dist/index.html)에서 똑같이 돈다.
 * (2026-09-25 전환 준비로 바꿨다. 그 전에는 win.eval 로 M·D 를 직접 만졌는데, 그러면
 *  로직이 모듈로 들어가는 순간 테스트가 전부 깨지고, 깨진 테스트를 새 구조에 맞춰 다시 쓰면
 *  "전환 전과 같다"를 증명하지 못한다.)
 *
 * 외부 리소스(SheetJS 의 xlsx, Google Fonts)는 받아오지 않는다 — 네트워크에 의존하면 CI가
 * 느려지고 흔들린다. 엑셀 가져오기 테스트는 전역 XLSX 를 가짜로 넣어 쓴다(앱 내부가 아니라
 * 앱이 기대는 바깥 라이브러리 자리다).
 *
 * 검사 대상은 **배포 산출물** dist/index.html 이다(`npm test`가 먼저 빌드한다).
 * APP_HTML 로 다른 파일을 줄 수 있다 — 전환 전 원본에 같은 테스트를 돌려 양쪽이 똑같이
 * 통과하는지 보려고 둔 것이다:
 *   APP_HTML=.verify/src-baseline/index.html npx vitest run
 */
import { JSDOM } from 'jsdom';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const HTML_PATH = process.env.APP_HTML
  ? path.resolve(process.env.APP_HTML)
  : path.join(__dirname, '..', 'dist', 'index.html');
if (!fs.existsSync(HTML_PATH)) {
  throw new Error(`${HTML_PATH} 가 없다 — \`npm run build\` 를 먼저 돌리거나 APP_HTML 을 확인할 것.`);
}
const HTML = fs.readFileSync(HTML_PATH, 'utf8');

/** 앱을 새 jsdom 창으로 띄운다. hash 를 주면 `#q=...` 상태로 진입한 것처럼 연다. */
async function loadApp(hash) {
  const url = 'https://calc.edutogether.kr/' + (hash ? '#' + hash : '');
  const win = new JSDOM(HTML, { runScripts: 'dangerously', url, pretendToBeVisual: true }).window;
  await tick();
  return win;
}

/** 화면 갱신을 기다린다. 원본은 이벤트 안에서 곧바로 다시 그리고, React는 이벤트가 끝난 뒤
 *  마이크로태스크에서 그린다 — 둘 다 이 한 번으로 끝난다. */
const tick = () => new Promise(r => setTimeout(r, 0));

const $ = (win, sel) => {
  const el = win.document.querySelector(sel);
  if (!el) throw new Error(`화면에서 ${sel} 을 찾지 못했다`);
  return el;
};

/** 입력칸에 사람이 친 것처럼 값을 넣는다. 값은 프로토타입의 setter로 넣어야 React도
 *  "바뀌었다"를 안다(요소의 value 에 바로 넣으면 React가 변화를 놓친다). */
async function type(win, sel, value) {
  const el = $(win, sel);
  const setter = Object.getOwnPropertyDescriptor(win.HTMLInputElement.prototype, 'value').set;
  setter.call(el, String(value));
  el.dispatchEvent(new win.Event('input', { bubbles: true }));
  await tick();
}

/** 칸을 벗어날 때(change) — 인당 금액 상한·500원 정리가 이때 걸린다. */
async function commit(win, sel) {
  $(win, sel).dispatchEvent(new win.Event('change', { bubbles: true }));
  await tick();
}

async function click(win, sel) { $(win, sel).click(); await tick(); }

const text = (win, sel) => $(win, sel).textContent;
const won = s => Number(String(s).replace(/[^0-9]/g, ''));

/** 견적 합계 패널(#sum)의 한 줄 — 라벨로 찾는다. */
function sumRow(win, label) {
  const row = [...$(win, '#sum').children].find(d => d.firstElementChild && d.firstElementChild.textContent === label);
  if (!row) return null;
  const v = row.querySelector('.v');
  return { text: v.textContent, className: v.className, html: v.outerHTML };
}

/** 물품을 전부 끄고(전체 선택 단추 두 번 — 처음 한 번은 꺼져 있던 배너까지 켠다),
 *  협의회 인원·횟수·지급액을 직접 넣는다. 지급액은 input 만 보내고 change 는 보내지 않는다 —
 *  change 가 가면 상한(40,000원)으로 맞춰져, 합계를 원하는 값으로 만들 수 없다. */
async function meetOnly(win, { n, c, per }) {
  await click(win, '#pAll');
  await click(win, '#pAll');
  const anyOn = [...win.document.querySelectorAll('#body .row [data-act="on"]')].some(x => x.checked);
  if (anyOn) throw new Error('물품을 전부 끄지 못했다 — 전체 선택 단추의 동작이 바뀌었다');
  await type(win, '#mN', n);
  await type(win, '#mC', c);
  await click(win, '#mMan');
  await type(win, '#mPer', per);
}

/** 공유하기가 넘기는 주소를 받는다(OS 공유창 자리를 가로챈다). */
async function sharedUrl(win) {
  let got = null;
  Object.defineProperty(win.navigator, 'share', { configurable: true, value: async d => { got = d; } });
  await click(win, '#pShare');
  await tick();
  if (!got) throw new Error('공유하기가 주소를 넘기지 않았다');
  return got.url;
}

/** stateStr() 과 같은 방식(JSON → UTF-8 바이트 → base64 → URL-safe)으로 값을 인코딩한다.
 *  stateStr() 이라면 절대 만들지 않을 값(문자열 수량·음수·소수·범위 밖 인덱스)을 직접
 *  실어 보낼 때 쓴다. */
function encodeState(obj) {
  return Buffer.from(JSON.stringify(obj), 'utf8').toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** 가져오기(엑셀)에 파일을 올린다. XLSX 는 가짜로 넣어 rows 를 그대로 돌려준다. */
async function importRows(win, rows) {
  win.XLSX = { read: () => ({ SheetNames: ['S'], Sheets: { S: {} } }), utils: { sheet_to_json: () => rows } };
  const input = $(win, '#fImp');
  const file = { name: 'test.xlsx', arrayBuffer: async () => new ArrayBuffer(0) };
  Object.defineProperty(input, 'files', { configurable: true, value: [file] });
  input.dispatchEvent(new win.Event('change', { bubbles: true }));
  for (let i = 0; i < 50 && text(win, '#pImp') === '가져오기'; i++) await tick();
}

/** 가져오기 한도 시험용 — 진짜 zip(.xlsx 껍데기)을 직접 만든다. entries: [이름, 원본 Buffer, (선택)선언할 풀린 크기].
 *  풀린 크기를 일부러 거짓으로 적어 "선언값만 믿으면 놓치는" 파일도 만들 수 있다. */
function buildZip(entries) {
  const crc32 = b => { let r = ~0; for (const x of b) { let c = (r ^ x) & 255; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; r = c ^ (r >>> 8); } return (~r) >>> 0; };
  const parts = [], cd = []; let off = 0;
  for (const [name, raw, declared] of entries) {
    const nb = Buffer.from(name), def = zlib.deflateRawSync(raw), crc = crc32(raw.length > 1 << 20 ? raw.subarray(0, 1 << 20) : raw);
    const usz = declared ?? raw.length;
    const l = Buffer.alloc(30); l.writeUInt32LE(0x04034b50, 0); l.writeUInt16LE(20, 4); l.writeUInt16LE(8, 8); l.writeUInt32LE(crc, 14);
    l.writeUInt32LE(def.length, 18); l.writeUInt32LE(usz, 22); l.writeUInt16LE(nb.length, 26);
    const c = Buffer.alloc(46); c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(20, 4); c.writeUInt16LE(20, 6); c.writeUInt16LE(8, 10); c.writeUInt32LE(crc, 16);
    c.writeUInt32LE(def.length, 20); c.writeUInt32LE(usz, 24); c.writeUInt16LE(nb.length, 28); c.writeUInt32LE(off, 42);
    parts.push(l, nb, def); cd.push(c, nb); off += 30 + nb.length + def.length;
  }
  const cdb = Buffer.concat(cd), e = Buffer.alloc(22);
  e.writeUInt32LE(0x06054b50, 0); e.writeUInt16LE(entries.length, 8); e.writeUInt16LE(entries.length, 10); e.writeUInt32LE(cdb.length, 12); e.writeUInt32LE(off, 16);
  return Buffer.concat([...parts, cdb, e]);
}

/** 파일 하나를 가져오기에 올린다. read 가 몇 번 불렸는지·넘겨받은 옵션을 돌려준다(한도에 걸리면 0번). */
async function importFile(win, { buf, ref = 'A1:H5', rows = [], size, inflate = true }) {
  if (inflate) { win.DecompressionStream = DecompressionStream; win.ReadableStream = ReadableStream; }   // jsdom 에는 없다 — Node 것을 빌려 준다(inflate:false 면 없는 브라우저처럼)
  const calls = { read: 0, opts: null, toJson: 0 };
  win.XLSX = {
    read: (_b, opts) => { calls.read++; calls.opts = opts; return { SheetNames: ['S'], Sheets: { S: { '!ref': ref } } }; },
    utils: { sheet_to_json: () => { calls.toJson++; return rows; } },
  };
  const input = $(win, '#fImp');
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length);
  const file = { name: 'test.xlsx', size: size ?? buf.length, arrayBuffer: async () => ab };
  Object.defineProperty(input, 'files', { configurable: true, value: [file] });
  input.dispatchEvent(new win.Event('change', { bubbles: true }));
  // 풀어서 세는 데 걸리는 시간은 기계마다 다르다 — 횟수가 아니라 시간으로 기다린다(최대 10초).
  for (const end = Date.now() + 10000; Date.now() < end && text(win, '#pImp') === '가져오기';) await tick();
  return calls;
}

export { buildZip, importFile, HTML, loadApp, tick, $, type, commit, click, text, won, sumRow, meetOnly, sharedUrl, encodeState, importRows };
