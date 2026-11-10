/* 「움직임 줄이기」 신호가 있어도 없어도 앱이 똑같이 움직이는지 실제 브라우저로 잰다.
 *
 *   node scripts/verify/motion.mjs [폴더|주소 ...]      (기본은 dist/. 주소를 주면 라이브를 연다)
 *
 * 같은 페이지를 reducedMotion 'reduce' 와 'no-preference' 두 조건으로 열어
 *  ① 스타일시트에 prefers-reduced-motion 조건이 하나라도 있으면 실패,
 *  ② 움직임을 정하는 계산된 값(게이지 막대 전환, 번쩍임 애니메이션, 카톡 카드 단추 전환)이
 *     두 조건에서 다르거나, 움직임이 «없음»이면 실패한다.
 * 2026-11-11 대표 결정: 움직임 줄이기 신호와 상관없이 늘 정상처럼 돈다. 확인은 두 조건 모두로 한다.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { startServer } from './serve.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const EXTERNAL = /^https:\/\/(fonts\.googleapis\.com|fonts\.gstatic\.com|cdn\.sheetjs\.com)\//;
const targets = process.argv.slice(2).length ? process.argv.slice(2) : ['dist'];

function measure() {
  const rules = [];
  const walk = list => { for (const r of list) { if (r.media) rules.push(r.conditionText || r.media.mediaText); if (r.cssRules) walk(r.cssRules); } };
  for (const s of document.styleSheets) { try { walk(s.cssRules); } catch { /* 다른 출처 시트 */ } }
  const probe = (cls, parent) => {
    const el = document.createElement('div'); el.className = cls; (parent || document.body).appendChild(el);
    const cs = getComputedStyle(el); const v = { anim: cs.animationName, dur: cs.animationDuration, trans: cs.transitionDuration };
    el.remove(); return v;
  };
  const gauge = document.querySelector('.gauge i');
  const nojsA = document.querySelector('.nojs .btns a');
  return {
    mediaConditions: rules.filter(c => /reduced-motion/.test(c)),
    gaugeTransition: gauge ? getComputedStyle(gauge).transitionDuration : null,
    flash: probe('flash'),
    nojsButtonTransition: nojsA ? getComputedStyle(nojsA).transitionDuration : null,
  };
}

const servers = [];
for (const t of targets) servers.push(/^https?:/.test(t) ? { url: t.replace(/\/$/, ''), close: async () => {} } : await startServer(path.resolve(ROOT, t)));
const browser = await chromium.launch({ channel: 'chrome', headless: true });
let fail = false;
try {
  for (const s of servers) {
    const got = {};
    for (const mode of ['reduce', 'no-preference']) {
      const ctx = await browser.newContext({ reducedMotion: mode, viewport: { width: 1280, height: 900 } });
      await ctx.route(/getunicorn/, r => r.abort());
      if (!/^https:/.test(s.url)) await ctx.route(EXTERNAL, r => r.continue());
      const page = await ctx.newPage();
      await page.goto(s.url + '/', { waitUntil: 'load' });
      await page.waitForSelector('.gauge i');
      const mq = await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches);
      got[mode] = { ...(await page.evaluate(measure)), mqReduce: mq };
      await ctx.close();
    }
    const a = got.reduce, b = got['no-preference'];
    const problems = [];
    if (!a.mqReduce || b.mqReduce) problems.push('브라우저가 두 조건을 흉내 내지 못했다(검사가 아무것도 못 본 것)');
    if (a.mediaConditions.length || b.mediaConditions.length) problems.push(`스타일시트에 움직임 줄이기 조건이 있다: ${[...a.mediaConditions, ...b.mediaConditions].join(' | ')}`);
    if (JSON.stringify({ ...a, mqReduce: 0, mediaConditions: 0 }) !== JSON.stringify({ ...b, mqReduce: 0, mediaConditions: 0 })) problems.push('두 조건에서 움직임 값이 다르다');
    if (!b.gaugeTransition || /^0s(, 0s)*$/.test(b.gaugeTransition)) problems.push('게이지 전환이 없다');
    if (b.flash.anim === 'none') problems.push('번쩍임 애니메이션이 없다');
    console.log(`${s.url}\n  reduce        ${JSON.stringify({ g: a.gaugeTransition, flash: a.flash, nojs: a.nojsButtonTransition })}\n  no-preference ${JSON.stringify({ g: b.gaugeTransition, flash: b.flash, nojs: b.nojsButtonTransition })}`);
    console.log(problems.length ? '  ✗ ' + problems.join('\n  ✗ ') : '  ✓ 두 조건이 같고 움직임이 살아 있다');
    if (problems.length) fail = true;
  }
} finally {
  await browser.close();
  for (const s of servers) await s.close();
}
process.exit(fail ? 1 : 0);
