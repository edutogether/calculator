#!/usr/bin/env node
/* 카카오톡 등 공유 카드(Open Graph·Twitter Card)가 실제로 붙어 있는지 검사한다.
 *
 * 소스 검사(인자 없이 실행) — CI test 잡에서 매번 돈다:
 *   1) 배포되는 dist/index.html 의 <head> 에 필수 OG·Twitter 태그가 전부 있는가
 *   2) og:image 가 가리키는 주소가 절대 주소(https://calc.edutogether.kr/og.jpg)인가
 *   3) dist/og.jpg(public/og.jpg 를 빌드가 복사한 것)가 실제로 있고, firebase.json 의 ignore 목록에 걸리지 않는가
 *
 * 라이브 검사(URL 인자를 주면 추가로 실행) — CI deploy 잡이 배포 뒤에 돈다:
 *   4) 그 주소의 HTML에 태그가 실제로 응답에 실려 있는가
 *   5) og.jpg 가 실제로 200 + image/jpeg 로 응답하는가(상태 코드만 보지 않는다 —
 *      "정적 서버가 없는 파일에도 200 을 준다"는 함정이 있어 content-type 까지 본다)
 *
 * 실행: npm run build 뒤에 node scripts/check-og.js [검사할 주소]
 */
import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const ROOT = path.join(__dirname, '..');
const DIST = path.join(ROOT, 'dist');
if (!fs.existsSync(path.join(DIST, 'index.html'))) {
  console.error('dist/index.html 이 없습니다 — `npm run build` 를 먼저 돌리세요.');
  process.exit(1);
}
const html = fs.readFileSync(path.join(DIST, 'index.html'), 'utf8');
const problems = [];

// <head> 안쪽만 본다 — <body> 안의 다른 <meta> 와 섞이지 않게.
const headMatch = html.match(/<head>([\s\S]*?)<\/head>/);
if (!headMatch) {
  console.error('dist/index.html 에서 <head> 를 찾지 못했습니다.');
  process.exit(1);
}
const head = headMatch[1];

const REQUIRED_TAGS = [
  ['og:type', /<meta property="og:type" content="([^"]+)">/],
  ['og:site_name', /<meta property="og:site_name" content="([^"]+)">/],
  ['og:title', /<meta property="og:title" content="([^"]+)">/],
  ['og:description', /<meta property="og:description" content="([^"]+)">/],
  ['og:url', /<meta property="og:url" content="([^"]+)">/],
  ['og:image', /<meta property="og:image" content="([^"]+)">/],
  ['og:image:secure_url', /<meta property="og:image:secure_url" content="([^"]+)">/],
  ['og:image:type', /<meta property="og:image:type" content="([^"]+)">/],
  ['og:image:width', /<meta property="og:image:width" content="([^"]+)">/],
  ['og:image:height', /<meta property="og:image:height" content="([^"]+)">/],
  ['twitter:card', /<meta name="twitter:card" content="([^"]+)">/],
  ['twitter:title', /<meta name="twitter:title" content="([^"]+)">/],
  ['twitter:description', /<meta name="twitter:description" content="([^"]+)">/],
  ['twitter:image', /<meta name="twitter:image" content="([^"]+)">/],
];

const found = {};
console.log('산출물(dist/index.html <head>) 검사 — 카드 태그 ' + REQUIRED_TAGS.length + '개');
for (const [name, re] of REQUIRED_TAGS) {
  const m = head.match(re);
  if (!m) { problems.push(name + ' 태그가 <head> 에 없습니다.'); continue; }
  found[name] = m[1];
  console.log('  ' + name.padEnd(20) + ' = ' + m[1]);
}
// §21-1 — 대상이 0건이면(정규식이 전부 하나도 안 걸리면) 통과가 아니라 실패다.
if (Object.keys(found).length === 0) {
  problems.push('태그를 단 하나도 찾지 못했습니다 — <head> 구조가 통째로 바뀌었을 수 있습니다.');
}

if (found['og:image'] && !/^https:\/\/calc\.edutogether\.kr\/og\.jpg$/.test(found['og:image'])) {
  problems.push('og:image 가 절대 주소(https://calc.edutogether.kr/og.jpg)가 아닙니다: ' + found['og:image']);
}
if (found['og:image:width'] !== '1200' || found['og:image:height'] !== '630') {
  problems.push('og:image 크기가 1200×630 이 아닙니다(카톡 등은 이 비율을 기대합니다).');
}

const ogPath = path.join(DIST, 'og.jpg');
if (!fs.existsSync(ogPath)) {
  problems.push('dist/og.jpg 가 없습니다 — public/og.jpg 가 빠졌거나 빌드가 복사하지 않았습니다.');
} else {
  const size = fs.statSync(ogPath).size;
  console.log('  og.jpg 파일 크기: ' + size + ' 바이트');
  if (size < 1000) problems.push('og.jpg 파일이 너무 작습니다(' + size + '바이트) — 손상 의심.');
}

const fbConfig = JSON.parse(fs.readFileSync(path.join(ROOT, 'firebase.json'), 'utf8'));
const ignore = fbConfig.hosting.ignore || [];
// 정확한 minimatch 구현 없이, og.jpg 를 가릴 만한 뻔한 패턴만 본다.
const blockers = ignore.filter(p => p === 'og.jpg' || p === '*.jpg' || p === '**/*.jpg' || p === '**');
if (blockers.length) {
  problems.push('firebase.json 의 ignore 목록이 og.jpg 를 가릴 수 있습니다: ' + blockers.join(', '));
}

async function liveCheck(url) {
  const base = url.replace(/\/$/, '');
  console.log('\n라이브 검사 — ' + base);

  const pageRes = await fetch(base + '/');
  const pageBody = await pageRes.text();
  for (const [name] of REQUIRED_TAGS) {
    if (!pageBody.includes('"' + found[name] + '"') && found[name] && !pageBody.includes(found[name])) {
      problems.push('라이브 응답에 ' + name + ' 값이 없습니다.');
    }
  }
  console.log('  ' + base + '/ 응답에 카드 태그 존재 확인');

  const imgRes = await fetch(base + '/og.jpg');
  const ctype = imgRes.headers.get('content-type') || '';
  console.log('  ' + base + '/og.jpg → ' + imgRes.status + ' ' + ctype);
  // 상태 코드만 보지 않는다 — 정적 호스팅이 없는 파일에도 200 을 주는 함정이 있다(2026-09-10).
  if (imgRes.status !== 200) problems.push('og.jpg 응답이 200 이 아닙니다: ' + imgRes.status);
  if (!/^image\/jpeg/.test(ctype)) problems.push('og.jpg 의 content-type 이 image/jpeg 가 아닙니다: ' + ctype);

  const buf = Buffer.from(await imgRes.arrayBuffer());
  const liveHash = crypto.createHash('sha256').update(buf).digest('hex');
  const localHash = crypto.createHash('sha256').update(fs.readFileSync(ogPath)).digest('hex');
  console.log('  sha256 로컬: ' + localHash);
  console.log('  sha256 라이브: ' + liveHash);
  if (liveHash !== localHash) problems.push('라이브 og.jpg 의 sha256 이 로컬 파일과 다릅니다 — 배포 중 바이트가 바뀌었습니다.');
}

(async () => {
  const url = process.argv[2];
  if (url) {
    try {
      await liveCheck(url);
    } catch (err) {
      problems.push('라이브 검사 중 오류: ' + err.message);
    }
  }

  if (problems.length) {
    console.error('\n공유 카드 검사 실패\n');
    problems.forEach(p => console.error('  - ' + p));
    process.exitCode = 1;
    return;
  }
  console.log('\n공유 카드 검사 통과.');
})();
