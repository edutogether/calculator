/* 옛 학교 기기 기준 속도 — CPU 를 느리게(Chrome 스로틀) 놓고 전환 전(기준 태그)과 다른 판들의
 * "첫 화면이 그려지고 합계가 뜨기까지" 시간을 여러 번 번갈아 잰다.
 *
 *   node scripts/verify/perf.mjs [--runs 7] [--rates 4,6] [--device pc|phone] [이름=폴더 ...]
 *   --device phone 은 폰 흉내(375×812, 모바일·터치, 픽셀 비율 3)다 — 대부분 폰으로 쓴다.
 *   쓰는 도중 조작은 한 페이지 안에서 --reps 번(기본 15) 되풀이해 그 중앙값을 그 판의 한 번 값으로 쓴다.
 *   예) node scripts/verify/perf.mjs --runs 7 --rates 4,6 2단계=.verify/dist-s2 React=dist
 *
 * 재는 것 — 첫 로드(탐색 시작 기준 ms): 첫 그림(FCP), 합계(#tot)에 숫자가 뜬 때, load.
 *          쓰는 도중(조작 시작 기준 ms, 다음 화면이 그려질 때까지): 수량 하나를 바꿔 합계가 바뀌기까지,
 *          「다른 제품」을 눌러 제품 고르기 창이 열리기까지.
 * 판마다 한 번씩 돌아가며 재서(원본 → 다른 판들 → 원본 …) 시간대에 따른 흔들림이 모든 판에 고르게 들어가게 한다.
 * 외부 리소스(구글 폰트·SheetJS)는 한 번 받아 두고 재사용한다 — 네트워크 흔들림을 빼고 앱만 비교하려고.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { startServer } from './serve.mjs';
import { FREEZE_TAG } from './verify.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv.splice(i, 2)[1] : d; };
const RUNS = Number(opt('--runs', '7'));
const RATES = opt('--rates', '4').split(',').map(Number);
const DEVICE = opt('--device', 'pc');
const REPS = Number(opt('--reps', '15'));   // 쓰는 도중 조작을 한 페이지 안에서 되풀이하는 횟수
const CTX = DEVICE === 'phone'
  ? { viewport: { width: 375, height: 812 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true }
  : { viewport: { width: 1440, height: 900 } };
const builds = [['원본', null], ...(argv.length ? argv : ['지금=dist']).map(a => a.split('='))];

const baseDir = path.join(ROOT, '.verify', 'perf-base');
fs.rmSync(baseDir, { recursive: true, force: true }); fs.mkdirSync(baseDir, { recursive: true });
for (const f of ['index.html', 'og.jpg']) fs.writeFileSync(path.join(baseDir, f), execFileSync('git', ['show', `${FREEZE_TAG}:${f}`], { cwd: ROOT, maxBuffer: 64 << 20 }));

const EXTERNAL = /^https:\/\/(fonts\.googleapis\.com|fonts\.gstatic\.com|cdn\.sheetjs\.com)\//;
const cache = new Map();
async function fromCache(route) {
  const url = route.request().url();
  let hit = cache.get(url);
  if (!hit) {
    const resp = await route.fetch();
    const headers = { ...resp.headers() }; delete headers['content-encoding']; delete headers['content-length'];
    hit = { status: resp.status(), headers, body: await resp.body() };
    if (hit.status === 200) cache.set(url, hit);
  }
  await route.fulfill(hit);
}

function probe() {
  window.__t = {};
  const mark = k => { if (!(k in window.__t)) window.__t[k] = performance.now(); };
  new MutationObserver(() => {
    const t = document.getElementById('tot');
    if (t && /[1-9]/.test(t.textContent)) mark('tot');
  }).observe(document, { subtree: true, childList: true, characterData: true });
  addEventListener('load', () => mark('load'));
}

async function measure(browser, url, rate) {
  const ctx = await browser.newContext(CTX);
  await ctx.route(/getunicorn/, r => r.abort());
  await ctx.route(EXTERNAL, fromCache);
  await ctx.addInitScript(probe);
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate });
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForFunction(() => 'tot' in window.__t && 'load' in window.__t);
  const r = await page.evaluate(() => {
    const fcp = performance.getEntriesByName('first-contentful-paint')[0];
    return { fcp: fcp ? fcp.startTime : null, ...window.__t };
  });
  // 쓰는 도중 — 조작한 순간부터, 결과가 DOM 에 나타나고 그다음 화면이 그려질 때까지(rAF 두 번).
  // 화면은 한 장이 16.7ms 라 그 시간은 뭉툭하다 — 조작 직후 앱 코드가 일을 끝낼 때까지(JS)도 따로 잰다.
  Object.assign(r, await page.evaluate(async REPS => {
    const frame = () => new Promise(res => requestAnimationFrame(() => requestAnimationFrame(res)));
    const med = a => a.slice().sort((x, y) => x - y)[Math.floor(a.length / 2)];
    await frame();
    const tot = document.getElementById('tot');
    const q = document.querySelector('#body .row[data-i="0"] [data-act="q"]');
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    const mask = document.getElementById('optMask');
    const open = document.querySelector('#body .row[data-i="1"] [data-act="open"]');
    const m = { qty: [], qtyJs: [], dlg: [], dlgJs: [] };
    // 한 페이지 안에서 여러 번 되풀이해 중앙값을 낸다 — 순간적인 부하가 한 번에 섞여 드는 것을 줄인다.
    for (let i = 0; i < REPS; i++) {
      const before = tot.textContent;
      let t0 = performance.now();
      setter.call(q, String(5 + (i % 2))); q.dispatchEvent(new Event('input', { bubbles: true }));
      m.qtyJs.push(performance.now() - t0);
      while (tot.textContent === before) await new Promise(res => setTimeout(res, 0));
      await frame();
      m.qty.push(performance.now() - t0);
      t0 = performance.now();
      open.click();
      m.dlgJs.push(performance.now() - t0);
      while (!mask.classList.contains('on')) await new Promise(res => setTimeout(res, 0));
      await frame();
      m.dlg.push(performance.now() - t0);
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));   // 닫는다
      while (mask.classList.contains('on')) await new Promise(res => setTimeout(res, 0));
      await frame();
    }
    return { qty: med(m.qty), qtyJs: med(m.qtyJs), dlg: med(m.dlg), dlgJs: med(m.dlgJs) };
  }, REPS));
  await ctx.unrouteAll({ behavior: 'ignoreErrors' });   // 새 글꼴 조각을 받는 도중이어도 닫을 수 있게
  await ctx.close();
  return r;
}

const servers = [];
for (const [name, dir] of builds) servers.push([name, await startServer(dir ? path.resolve(ROOT, dir) : baseDir)]);
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  for (const [, s] of servers) await measure(browser, s.url + '/', 1);   // 외부 리소스를 캐시에 채우는 판(버림)
  for (const rate of RATES) {
    const rows = Object.fromEntries(servers.map(([n]) => [n, []]));
    for (let i = 0; i < RUNS; i++) for (const [n, s] of servers) rows[n].push(await measure(browser, s.url + '/', rate));
    const stat = (n, k) => {
      const v = rows[n].map(r => r[k]).filter(x => x != null).sort((a, b) => a - b);
      return { med: v[Math.floor(v.length / 2)], min: v[0], max: v[v.length - 1] };
    };
    const f = x => x.toFixed(0).padStart(5), g = x => x.toFixed(1).padStart(5);
    console.log(`\n${DEVICE === 'phone' ? '폰(375×812)' : 'PC(1440×900)'} · CPU ${rate}배 느리게 · ${RUNS}회씩 번갈아 · ms (중앙값 [최소–최대])`);
    console.log('판'.padEnd(8) + '첫 그림'.padEnd(22) + '합계 표시'.padEnd(22) + 'load'.padEnd(22) + '수량→합계(화면)'.padEnd(22) + '(JS)'.padEnd(20) + '제품 창(화면)'.padEnd(22) + '(JS)');
    for (const [n] of servers) {
      const cell = k => { const s = stat(n, k); return `${f(s.med)} [${f(s.min)}–${f(s.max)}]`; };
      const cj = k => { const s = stat(n, k); return `${g(s.med)} [${g(s.min)}–${g(s.max)}]`; };
      console.log(n.padEnd(8) + cell('fcp').padEnd(22) + cell('tot').padEnd(22) + cell('load').padEnd(22) + cell('qty').padEnd(22) + cj('qtyJs').padEnd(20) + cell('dlg').padEnd(22) + cj('dlgJs'));
    }
    const d = (n, k) => { const v = stat(n, k).med - stat('원본', k).med; return (v > 0 ? '+' : '') + v.toFixed(0); };
    const dj = (n, k) => { const v = stat(n, k).med - stat('원본', k).med; return (v > 0 ? '+' : '') + v.toFixed(1); };
    for (const [n] of servers.slice(1)) console.log(`  원본 대비 중앙값 차이 — ${n}: 합계 표시 ${d(n, 'tot')}ms · 수량→합계 ${d(n, 'qty')}ms(JS ${dj(n, 'qtyJs')}) · 제품 창 ${d(n, 'dlg')}ms(JS ${dj(n, 'dlgJs')})`);
  }
} finally {
  await browser.close();
  for (const [, s] of servers) await s.close();
}
