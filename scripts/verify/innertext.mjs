/* "공백만 다른 텍스트 노드"가 사람이 복사해 가는 글자에 나타나는지 본다.
 *
 *   node scripts/verify/innertext.mjs [대조할 폴더=dist]
 *
 * React 는 태그 사이의 들여쓰기 공백(텍스트 노드)을 만들지 않는다. 그 공백은 flex·grid·블록 사이라
 * 화면(픽셀)에는 안 나타나고 픽셀 대조가 그걸 이미 증명한다. 남는 질문은 "복사"다 — 브라우저가
 * 선택·복사할 때 내보내는 글자는 innerText(렌더링된 텍스트)이므로, 여러 화면 상태에서 두 판의
 * document.body.innerText 를 글자 하나까지 대조한다. 공유 주소·엑셀 셀·인쇄 PDF 의 글자는 전체 대조
 * (verify.mjs)가 values.json 으로 이미 비교한다.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { startServer } from './serve.mjs';
import { FREEZE_TAG } from './verify.mjs';
import { SCENARIOS, VP } from './scenarios.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const cand = path.resolve(ROOT, process.argv[2] || 'dist');
const baseDir = path.join(ROOT, '.verify', 'it-base');
fs.rmSync(baseDir, { recursive: true, force: true }); fs.mkdirSync(baseDir, { recursive: true });
for (const f of ['index.html', 'og.jpg']) fs.writeFileSync(path.join(baseDir, f), execFileSync('git', ['show', `${FREEZE_TAG}:${f}`], { cwd: ROOT, maxBuffer: 64 << 20 }));

// 화면 글자가 바뀌는 시나리오를 고루 — 탭 전부, 안내창, 제품 고르기, 예산 초과, #q= 옛 링크, 가져오기 결과
const PICK = /^(default|tab-\d|over-budget|opt-modal|opt-pick|cap-over|autofit-changed|autofit-fail|meet-ratio-share|share-fallback|q-[A-F]|xlsx-bad|xlsx-norows|move-share|meet-16|qty-junk)$/;

function stubs() {
  Object.defineProperty(navigator, 'share', { value: async () => {}, configurable: true });
  window.print = () => {};
}

async function textOf(browser, base, sc, vpName, scheme) {
  const vp = VP[vpName];
  const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, colorScheme: scheme, acceptDownloads: true });
  await ctx.route(/getunicorn/, r => r.abort());
  await ctx.addInitScript(stubs);
  const page = await ctx.newPage();
  try {
    await page.goto(base + '/' + (sc.hash || ''), { waitUntil: 'load' });
    if (sc.xlsx) return null;
    await sc.run(page, {});
    if (sc.waitAfter) await page.waitForTimeout(sc.waitAfter);
    return await page.evaluate(() => document.body.innerText);
  } finally { await ctx.close(); }
}

const s1 = await startServer(baseDir), s2 = await startServer(cand);
const browser = await chromium.launch({ channel: 'chrome', headless: true });
let n = 0, diff = 0;
try {
  for (const sc of SCENARIOS) {
    if (!PICK.test(sc.name) || sc.nojs || sc.file || sc.reduced) continue;
    for (const [vpName, scheme] of sc.combos.filter(([v]) => v === 'pc' || v === 'phone')) {
      const a = await textOf(browser, s1.url, sc, vpName, scheme), b = await textOf(browser, s2.url, sc, vpName, scheme);
      if (a == null) continue;
      n++;
      if (a !== b) {
        diff++;
        let i = 0; while (i < a.length && a[i] === b[i]) i++;
        console.log(`✗ ${sc.name} ${vpName}-${scheme}: ${i}번째 글자부터 다름\n    전: ${JSON.stringify(a.slice(Math.max(0, i - 30), i + 40))}\n    후: ${JSON.stringify(b.slice(Math.max(0, i - 30), i + 40))}`);
      }
    }
  }
} finally { await browser.close(); await s1.close(); await s2.close(); }
if (n === 0) { console.error('대조한 화면이 0개 — 빈 검사'); process.exit(1); }
console.log(diff ? `innerText 차이 ${diff}건 / ${n}개 화면` : `innerText 차이 0건 / ${n}개 화면 — 복사해 가는 글자는 전환 전과 같다`);
process.exit(diff ? 1 : 0);
