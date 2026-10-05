/* 카톡 미리보기 안내 카드(#nojs)가 JS 가 도는 화면에서 한 장면이라도 보이는지 잰다.
 *
 *   node scripts/verify/nojs-flash.mjs [--runs 10] [--rate 6] [이름=폴더|주소 ...]
 *   (기본은 원본(기준 태그) 과 dist/. 주소(https://…)를 주면 그 페이지를 연다 — 라이브 확인용)
 *
 * 폰 흉내(375×812)·CPU 느리게 놓고 문서가 만들어지는 순간부터 매 장면(requestAnimationFrame — 화면을
 * 그리기 직전에 돈다)마다 #nojs 가 보이는지 적는다. 한 장면이라도 보이면 실패다.
 * JS 를 끈 화면(카톡 미리보기)에서는 거꾸로 카드가 보여야 통과다.
 * 2026-09-25 React 판에서 첫 화면 직후 약 0.1초 카드가 보였다(대표님이 녹화로 찾음) — 그 회귀를 막는다.
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
const RUNS = Number(opt('--runs', '10'));
const RATE = Number(opt('--rate', '6'));
const PHONE = { viewport: { width: 375, height: 812 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true };
const EXTERNAL = /^https:\/\/(fonts\.googleapis\.com|fonts\.gstatic\.com|cdn\.sheetjs\.com)\//;

const baseDir = path.join(ROOT, '.verify', 'nojs-base');
fs.rmSync(baseDir, { recursive: true, force: true }); fs.mkdirSync(baseDir, { recursive: true });
for (const f of ['index.html', 'og.jpg']) fs.writeFileSync(path.join(baseDir, f), execFileSync('git', ['show', `${FREEZE_TAG}:${f}`], { cwd: ROOT, maxBuffer: 64 << 20 }));
const targets = [['원본', baseDir], ...(argv.length ? argv : ['지금=dist']).map(a => a.split('='))];

function probe() {
  const frames = window.__frames = [];
  const shown = () => {
    const el = document.getElementById('nojs');
    if (!el) return false;
    const r = el.getBoundingClientRect();
    return getComputedStyle(el).display !== 'none' && r.width > 0 && r.height > 0;
  };
  const tick = () => {
    frames.push({ t: performance.now(), shown: shown(), ready: !!document.getElementById('tot') && /[1-9]/.test(document.getElementById('tot').textContent) });
    if (!window.__stop) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

async function once(browser, url, js) {
  const ctx = await browser.newContext({ ...PHONE, javaScriptEnabled: js });
  await ctx.route(/getunicorn/, r => r.abort());
  if (!/^https:/.test(url)) await ctx.route(EXTERNAL, r => r.continue());
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: RATE });
  if (!js) {
    await page.goto(url, { waitUntil: 'load' });
    const v = await page.locator('#nojs').isVisible();
    await ctx.close();
    return { nojsVisible: v };
  }
  await page.addInitScript(probe);
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__frames.some(f => f.ready));
  await page.waitForTimeout(500);
  const frames = await page.evaluate(() => { window.__stop = true; return window.__frames; });
  await ctx.close();
  return { frames: frames.length, shown: frames.filter(f => f.shown).length, firstShownMs: frames.find(f => f.shown)?.t ?? null };
}

const servers = [];
for (const [name, where] of targets) {
  if (/^https?:/.test(where)) servers.push([name, { url: where.replace(/\/$/, ''), close: async () => {} }]);
  else servers.push([name, await startServer(path.resolve(ROOT, where))]);
}
const browser = await chromium.launch({ channel: 'chrome', headless: true });
let fail = false;
try {
  console.log(`폰(375×812) · CPU ${RATE}배 느리게 · ${RUNS}회 — #nojs 카드가 보인 장면 수(JS 켬은 0이어야, JS 끔은 보여야 통과)`);
  for (const [name, s] of servers) {
    const runs = [];
    for (let i = 0; i < RUNS; i++) runs.push(await once(browser, s.url + '/', true));
    const off = await once(browser, s.url + '/', false);
    const bad = runs.filter(r => r.shown > 0);
    const judge = name === '원본' ? '' : (bad.length || !off.nojsVisible ? '  ✗' : '  ✓');
    if (judge.includes('✗')) fail = true;
    console.log(`${name.padEnd(6)} JS 켬: 보인 판 ${bad.length}/${RUNS} (보인 장면 ${runs.map(r => r.shown).join(',')} / 전체 장면 ${runs.map(r => r.frames).join(',')})`
      + ` · JS 끔: ${off.nojsVisible ? '보임' : '안 보임'}${judge}`);
  }
} finally {
  await browser.close();
  for (const [, s] of servers) await s.close();
}
process.exit(fail ? 1 : 0);
