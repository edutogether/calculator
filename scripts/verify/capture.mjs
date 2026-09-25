/* 기준선(또는 전환 후 결과)을 찍는다.
 *
 *   node scripts/verify/capture.mjs --src <index.html 이 있는 폴더> --out <결과 폴더> [--only 정규식]
 *
 * 시나리오마다(scenarios.mjs) 뷰포트·라이트/다크 조합별로:
 *   <이름>/<뷰포트>-<테마>.png          전체 페이지 스크린샷(shot:'both'면 .view.png 도)
 *   <이름>/<뷰포트>-<테마>.dom.json.gz  요소별 계산 스타일·위치·속성·값(snapshot.mjs)
 *   <이름>/<뷰포트>-<테마>.values.json  밖으로 나간 것 — 공유 주소·클립보드·인쇄 호출·엑셀 셀·PDF
 *   <이름>/<뷰포트>-<테마>.pdf-p<N>.render.png  인쇄 PDF 쪽별 그림 — **사람이 볼 참고용, 대조하지 않는다.**
 *       PDF 를 캔버스에 그리는 단계가 같은 파일에서도 몇 픽셀씩 흔들린다(2026-09-25 확인).
 *       대조는 PDF 자체로 한다 — 생성 시각·문서 ID 를 빼고 정규화한 PDF 의 sha256(values.pdf.hash).
 *       같은 원본이면 세 번 찍어도 이 값이 같았다.
 *   <이름>/<뷰포트>-<테마>.error.txt    시나리오가 실패했으면 그 이유(이것도 대조 대상이다)
 *
 * 브라우저는 이 PC의 Chrome을 헤드리스로 띄운다(창이 안 뜬다 — 대표님 크롬과 무관).
 * 끝나면 반드시 닫는다(§17).
 */
import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import zlib from 'node:zlib';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';
import { startServer } from './serve.mjs';
import { domSnapshot, STYLE_PROPS, PSEUDO_PROPS } from './snapshot.mjs';
import { SCENARIOS, VP } from './scenarios.mjs';

const FIXED_NOW = new Date('2026-10-01T09:00:00+09:00');

/* 밖에서 오는 것(구글 폰트 CSS·글꼴 파일, cdnjs xlsx)은 한 번만 받아 이 프로세스 안에서 재사용한다.
 * 빠르기도 하지만, 더 중요한 것은 기준선과 대조본이 **같은 바이트**를 받는다는 점이다 —
 * 도중에 구글이 글꼴 파일을 바꿔도 양쪽이 똑같이 영향을 받는다. */
const EXTERNAL = /^https:\/\/(fonts\.googleapis\.com|fonts\.gstatic\.com|cdnjs\.cloudflare\.com)\//;
const cache = new Map();
async function fromCache(route) {
  const url = route.request().url();
  let hit = cache.get(url);
  if (!hit) {
    const resp = await route.fetch();
    const headers = { ...resp.headers() };
    delete headers['content-encoding']; delete headers['content-length'];
    hit = { status: resp.status(), headers, body: await resp.body() };
    if (hit.status === 200) cache.set(url, hit);
  }
  await route.fulfill(hit);
}

function stubs(mode) {
  window.__log = [];
  const push = (...a) => window.__log.push(a);
  const def = (o, k, v) => { try { Object.defineProperty(o, k, { value: v, configurable: true, writable: true }); } catch (_) {} };
  if (mode === 'fallback') {
    def(navigator, 'share', undefined);
    def(navigator, 'clipboard', { writeText: async t => { push('clip-rejected', t); throw new Error('denied'); } });
    def(document, 'execCommand', c => { push('execCommand', c, false); return false; });
  } else {
    def(navigator, 'share', async d => { push('share', { title: d.title, text: d.text, url: d.url }); });
    if (navigator.clipboard) def(navigator, 'clipboard', { writeText: async t => { push('clip', t); } });
    def(document, 'execCommand', c => { push('execCommand', c, true); return true; });
  }
  window.print = () => push('print');
}

async function settle(target) {
  await target.evaluate(async () => {
    const frames = n => new Promise(r => { const f = k => (k ? requestAnimationFrame(() => f(k - 1)) : r()); f(n); });
    for (let i = 0; i < 10; i++) {
      await document.fonts.ready; await frames(2);
      if (document.fonts.status === 'loaded') break;
    }
    let last = '', same = 0;
    for (let i = 0; i < 180 && same < 4; i++) {
      await frames(1);
      const s = scrollX + ',' + scrollY; if (s === last) same++; else { same = 0; last = s; }
    }
    for (const a of document.getAnimations()) { try { a.finish(); } catch (_) {} }
    await document.fonts.ready; await frames(2);
  });
}

async function renderPdf(page, base, buf) {
  await page.goto(base + '/__pdfview.html');
  return page.evaluate(async b64 => {
    const pdfjs = await import('/__pdfjs/pdf.mjs');
    pdfjs.GlobalWorkerOptions.workerSrc = '/__pdfjs/pdf.worker.mjs';
    const data = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
    const doc = await pdfjs.getDocument({ data }).promise;
    const pages = [];
    for (let i = 1; i <= doc.numPages; i++) {
      const pg = await doc.getPage(i);
      const vp = pg.getViewport({ scale: 1.5 });
      const c = document.createElement('canvas'); c.width = Math.round(vp.width); c.height = Math.round(vp.height);
      await pg.render({ canvasContext: c.getContext('2d'), viewport: vp, canvas: c }).promise;
      const tc = await pg.getTextContent();
      pages.push({ png: c.toDataURL('image/png'), text: tc.items.map(t => t.str).join('|'),
                   size: [vp.width, vp.height] });
    }
    return pages;
  }, buf.toString('base64'));
}

async function readXlsx(page, buf) {
  return page.evaluate(b64 => {
    const wb = XLSX.read(b64, { type: 'base64' });
    return wb.SheetNames.map(n => {
      const s = wb.Sheets[n];
      return { name: n, ref: s['!ref'], cols: s['!cols'] || null, merges: s['!merges'] || null,
               aoa: XLSX.utils.sheet_to_json(s, { header: 1, raw: true, defval: null }) };
    });
  }, buf.toString('base64'));
}

async function importFile(page, sc, outDir) {
  const kind = sc.xlsx.slice('import:'.length);
  let file;
  if (kind === 'bad') file = { name: '견적.xlsx', mimeType: 'application/octet-stream', buffer: Buffer.from('이건 엑셀이 아니다') };
  else if (kind === 'norows') {
    const b64 = await page.evaluate(() => {
      const ws = XLSX.utils.aoa_to_sheet([['아무', '상관', '없는'], ['표', '입니다', 1]]);
      const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 's');
      return XLSX.write(wb, { bookType: 'xlsx', type: 'base64' });
    });
    file = { name: '다른표.xlsx', mimeType: 'application/octet-stream', buffer: Buffer.from(b64, 'base64') };
  } else {
    const src = path.join(outDir, kind, 'pc-light.xlsx');
    file = { name: 'InKY_부스_견적.xlsx', mimeType: 'application/octet-stream', buffer: fs.readFileSync(src) };
  }
  await page.setInputFiles('#fImp', file);
  await page.waitForFunction(() => document.getElementById('pImp').textContent !== '가져오기', null, { timeout: 10000 });
}

async function runCombo(browser, base, srcDir, outDir, sc, vpName, scheme) {
  const vp = VP[vpName];
  const id = `${vpName}-${scheme}`;
  const dir = path.join(outDir, sc.name);
  fs.mkdirSync(dir, { recursive: true });
  const ctx = await browser.newContext({
    viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: vp.dpr || 1,
    colorScheme: scheme, reducedMotion: sc.reduced ? 'reduce' : 'no-preference',
    locale: 'ko-KR', timezoneId: 'Asia/Seoul', acceptDownloads: true, javaScriptEnabled: !sc.nojs,
  });
  const values = {};
  try {
    await ctx.route(/getunicorn/, r => r.abort());
    await ctx.route(EXTERNAL, fromCache);
    if (!sc.nojs) await ctx.addInitScript(stubs, sc.stub || 'normal');
    const page = await ctx.newPage();
    if (!sc.nojs) await page.clock.setFixedTime(FIXED_NOW);
    const pageErrors = [];
    page.on('pageerror', e => pageErrors.push(String(e.message)));
    page.on('console', m => { if (m.type() === 'error') pageErrors.push('console: ' + m.text()); });

    const url = sc.file ? pathToFileURL(path.join(srcDir, 'index.html')).href + (sc.hash || '')
      : base + '/' + (sc.hash || '');
    await page.goto(url, { waitUntil: 'load' });
    const target = page;
    if (!sc.nojs) await settle(target);

    let download = null;
    if (sc.xlsx === 'export') {
      await sc.run(target, values);
      const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#xls')]);
      const f = path.join(dir, `${id}.xlsx`); await dl.saveAs(f);
      values.xlsxName = dl.suggestedFilename();
      download = fs.readFileSync(f);
      values.xlsxButton = await page.textContent('#xls');
    } else if (sc.xlsx) {
      await importFile(page, sc, outDir);
      values.importButton = await page.textContent('#pImp');
    } else {
      await sc.run(target, values);
    }
    // 단추 글자가 잠깐 바뀌었다 돌아오는 동작(공유 2.6초·엑셀 1.8초·가져오기 2.6초)은 끝난 뒤를 찍는다 —
    // 찍는 순간이 그 경계에 걸리면 같은 원본도 결과가 흔들린다(2026-09-25 확인).
    if (sc.waitAfter) await page.waitForTimeout(sc.waitAfter);
    if (!sc.nojs) await settle(target);

    const dom = await target.evaluate(domSnapshot, { styleProps: STYLE_PROPS, pseudoProps: PSEUDO_PROPS });
    fs.writeFileSync(path.join(dir, `${id}.dom.json.gz`), zlib.gzipSync(JSON.stringify(dom)));
    const shotOpts = { animations: 'disabled', caret: 'hide' };
    if (sc.shot !== 'viewport') await page.screenshot({ ...shotOpts, path: path.join(dir, `${id}.png`), fullPage: true });
    if (sc.shot === 'both' || sc.shot === 'viewport') await page.screenshot({ ...shotOpts, path: path.join(dir, `${id}.view.png`) });

    if (!sc.nojs) values.log = await target.evaluate(() => window.__log || null);
    if (download) values.xlsx = await readXlsx(page, download);
    if (sc.print) {
      const pdf = await page.pdf({ preferCSSPageSize: true });
      const norm = pdf.toString('latin1').replace(/\/(CreationDate|ModDate) \(D:[^)]*\)/g, '')
        .replace(/\/ID \[<[0-9A-Fa-f]+> <[0-9A-Fa-f]+>\]/g, '');
      const pages = await renderPdf(page, base, pdf);
      values.pdf = { pages: pages.length, hash: crypto.createHash('sha256').update(norm, 'latin1').digest('hex'),
                     text: pages.map(p => p.text), size: pages.map(p => p.size) };
      pages.forEach((p, i) => fs.writeFileSync(path.join(dir, `${id}.pdf-p${i + 1}.render.png`), Buffer.from(p.png.split(',')[1], 'base64')));
    }
    values.pageErrors = pageErrors.filter(e => !/getunicorn|net::ERR_FAILED/.test(e));
    fs.writeFileSync(path.join(dir, `${id}.values.json`), JSON.stringify(values, null, 1));
  } catch (err) {
    fs.writeFileSync(path.join(dir, `${id}.error.txt`), String(err && err.message || err).split('\n')[0]);
  } finally {
    await ctx.close();
  }
}

export async function capture({ src, out, only, combo }) {
  fs.rmSync(out, { recursive: true, force: true });
  fs.mkdirSync(out, { recursive: true });
  const server = await startServer(src);
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const re = only ? new RegExp(only) : null;
  let n = 0;
  try {
    for (const sc of SCENARIOS) {
      if (re && !re.test(sc.name)) continue;
      for (const [vp, scheme] of sc.combos) {
        if (combo && `${vp}-${scheme}` !== combo) continue;
        await runCombo(browser, server.url, src, out, sc, vp, scheme); n++; }
    }
  } finally {
    await browser.close();
    await server.close();
  }
  return n;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const a = process.argv.slice(2);
  const get = k => { const i = a.indexOf(k); return i >= 0 ? a[i + 1] : undefined; };
  const src = get('--src'), out = get('--out');
  if (!src || !out) { console.error('사용법: capture.mjs --src <폴더> --out <폴더> [--only 정규식]'); process.exit(2); }
  const t = Date.now();
  const n = await capture({ src: path.resolve(src), out: path.resolve(out), only: get('--only') });
  console.log(`찍음: ${n}개 조합, ${((Date.now() - t) / 1000).toFixed(0)}초 → ${out}`);
}
