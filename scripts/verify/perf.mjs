/* 옛 학교 기기 기준 속도 — CPU 를 4배 느리게(Chrome 스로틀) 놓고 전환 전(기준 태그)과 지금 dist/ 의
 * "첫 화면이 그려지고 합계가 뜨기까지" 시간을 각각 여러 번 잰다.
 *
 *   node scripts/verify/perf.mjs [대조할 폴더=dist] [횟수=3] [배수=4]
 *
 * 재는 것(탐색 시작 기준 ms): 첫 그림(FCP), 합계(#tot)에 숫자가 뜬 때, DOMContentLoaded, load.
 * 외부 리소스(구글 폰트·cdnjs)는 한 번 받아 두고 재사용한다 — 네트워크 흔들림을 빼고 앱만 비교하려고.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { startServer } from './serve.mjs';
import { FREEZE_TAG } from './verify.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const [candArg = 'dist', runsArg = '3', rateArg = '4'] = process.argv.slice(2);
const RUNS = Number(runsArg), RATE = Number(rateArg);

const baseDir = path.join(ROOT, '.verify', 'perf-base');
fs.rmSync(baseDir, { recursive: true, force: true }); fs.mkdirSync(baseDir, { recursive: true });
for (const f of ['index.html', 'og.jpg']) fs.writeFileSync(path.join(baseDir, f), execFileSync('git', ['show', `${FREEZE_TAG}:${f}`], { cwd: ROOT, maxBuffer: 64 << 20 }));

const EXTERNAL = /^https:\/\/(fonts\.googleapis\.com|fonts\.gstatic\.com|cdnjs\.cloudflare\.com)\//;
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
  document.addEventListener('DOMContentLoaded', () => mark('dcl'));
  addEventListener('load', () => mark('load'));
}

async function measure(browser, url) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await ctx.route(/getunicorn/, r => r.abort());
  await ctx.route(EXTERNAL, fromCache);
  await ctx.addInitScript(probe);
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: RATE });
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForFunction(() => 'tot' in window.__t && 'load' in window.__t);
  const r = await page.evaluate(() => {
    const fcp = performance.getEntriesByName('first-contentful-paint')[0];
    return { fcp: fcp ? fcp.startTime : null, ...window.__t };
  });
  await ctx.close();
  return r;
}

const server = { base: await startServer(baseDir), cand: await startServer(path.resolve(ROOT, candArg)) };
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  await measure(browser, server.base.url + '/');          // 외부 리소스를 캐시에 채우는 첫 판(버림)
  const rows = { '전환 전': [], '지금': [] };
  for (let i = 0; i < RUNS; i++) {                          // 번갈아 재서 시간대 흔들림을 양쪽에 고르게
    rows['전환 전'].push(await measure(browser, server.base.url + '/'));
    rows['지금'].push(await measure(browser, server.cand.url + '/'));
  }
  const f = v => (v == null ? '   -  ' : v.toFixed(0).padStart(6));
  console.log(`CPU ${RATE}배 느리게 · ${RUNS}회 · 탐색 시작 기준 ms`);
  console.log('판       회   첫그림  합계표시  DOMContentLoaded   load');
  for (const [name, list] of Object.entries(rows)) list.forEach((r, i) =>
    console.log(`${name.padEnd(6)} ${i + 1}  ${f(r.fcp)}  ${f(r.tot)}      ${f(r.dcl)}      ${f(r.load)}`));
  const med = (name, k) => { const v = rows[name].map(r => r[k]).sort((a, b) => a - b); return v[Math.floor(v.length / 2)]; };
  for (const k of ['fcp', 'tot', 'dcl', 'load'])
    console.log(`중앙값 ${k.padEnd(4)}: 전환 전 ${f(med('전환 전', k))} · 지금 ${f(med('지금', k))} · 차이 ${f(med('지금', k) - med('전환 전', k))}`);
} finally {
  await browser.close(); await server.base.close(); await server.cand.close();
}
