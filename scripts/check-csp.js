#!/usr/bin/env node
/* firebase.json 의 CSP 해시가 index.html 의 인라인 <style>/<script> 와 일치하는지 검사한다.
 *
 * 이 앱은 단일 HTML 파일이라 CSS·JS 를 밖으로 뺄 수 없고(카카오톡으로 보낸 파일 한 개가
 * 그대로 동작해야 한다), 그래서 CSP 를 'unsafe-inline' 없이 쓰려면 인라인 블록마다 sha256
 * 해시를 firebase.json 에 적어야 한다. index.html 을 한 글자라도 고치면 해시가 달라지고,
 * 갱신하지 않은 채 배포하면 호스팅된 화면이 통째로 죽는다(스크립트가 전부 차단된다).
 * 그 사고를 조용히 나지 않게 하려고, 배포 전에 이 검사를 먼저 돌린다.
 *
 * 검사 대상은 **실제로 배포되는 dist/index.html** 이다(빌드가 인라인 블록을 만들어 넣으므로
 * 소스가 아니라 산출물의 바이트에 해시가 걸린다). 먼저 `npm run build`.
 *
 * 실행: node scripts/check-csp.js
 * 해시를 갱신해야 하면 이 스크립트가 알려주는 값을 firebase.json 의 CSP 에 그대로 넣는다.
 */
import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const root = path.join(__dirname, '..');
const deployDir = path.join(root, 'dist');
const built = path.join(deployDir, 'index.html');
if (!fs.existsSync(built)) {
  console.error('dist/index.html 이 없습니다 — `npm run build` 를 먼저 돌리세요.');
  process.exit(1);
}

const approvedArtifacts = new Set(['index.html', 'og.jpg']);
function filesIn(dir, prefix = '') {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const relative = path.posix.join(prefix, entry.name);
    if (entry.isFile()) return [relative];
    if (entry.isDirectory()) return filesIn(path.join(dir, entry.name), relative);
    return [relative];
  });
}

const deployedArtifacts = filesIn(deployDir);
const unexpectedArtifacts = deployedArtifacts.filter(name => !approvedArtifacts.has(name));
const missingArtifacts = [...approvedArtifacts].filter(name => !deployedArtifacts.includes(name));

if (unexpectedArtifacts.length || missingArtifacts.length) {
  console.error('배포 산출물 검사 실패');
  unexpectedArtifacts.forEach(name => console.error(`  - 승인되지 않은 파일: dist/${name}`));
  missingArtifacts.forEach(name => console.error(`  - 승인된 파일이 없습니다: dist/${name}`));
  process.exit(1);
}

const html = fs.readFileSync(built, 'utf8');
const config = JSON.parse(fs.readFileSync(path.join(root, 'firebase.json'), 'utf8'));

function inlineBlocks(tag) {
  const re = new RegExp('<' + tag + '(?:\\s[^>]*)?>([\\s\\S]*?)</' + tag + '>', 'g');
  const out = [];
  let m;
  while ((m = re.exec(html))) {
    const openTag = m[0].slice(0, m[0].indexOf('>'));
    if (/\ssrc\s*=/.test(openTag)) continue; // 외부 파일을 부르는 태그는 해시 대상이 아니다
    out.push(m[1]);
  }
  return out;
}

const sha256 = text =>
  "'sha256-" + crypto.createHash('sha256').update(text, 'utf8').digest('base64') + "'";

const csp = (config.hosting.headers || [])
  .flatMap(entry => entry.headers || [])
  .filter(header => header.key === 'Content-Security-Policy')
  .map(header => header.value)
  .join(' ');

if (!csp) {
  console.error('firebase.json 에 Content-Security-Policy 헤더가 없습니다.');
  process.exit(1);
}

const problems = [];
const expected = new Set();

for (const [tag, directive] of [['script', 'script-src'], ['style', 'style-src']]) {
  const blocks = inlineBlocks(tag);
  if (blocks.length === 0) {
    problems.push(`index.html 에 인라인 <${tag}> 블록이 하나도 없습니다 — 검사 대상을 잘못 잡았습니다.`);
    continue;
  }
  blocks.forEach((block, i) => {
    const hash = sha256(block);
    expected.add(hash);
    if (!csp.includes(hash)) {
      problems.push(
        `${directive} 에 ${i + 1}번째 인라인 <${tag}> 블록의 해시가 없습니다.\n` +
        `    firebase.json 의 ${directive} 에 이 값을 넣으세요: ${hash}`
      );
    }
  });
}

for (const stale of csp.match(/'sha256-[A-Za-z0-9+/=]+'/g) || []) {
  if (!expected.has(stale)) {
    problems.push(`firebase.json 에 index.html 어디에도 없는 해시가 남아 있습니다: ${stale}`);
  }
}

if (/'unsafe-inline'|'unsafe-eval'/.test(csp)) {
  problems.push("CSP 에 'unsafe-inline' 또는 'unsafe-eval' 이 들어 있습니다 — 해시로 대신하세요.");
}

if (problems.length) {
  console.error('CSP 검사 실패\n');
  problems.forEach(p => console.error('  - ' + p));
  process.exit(1);
}

console.log('CSP 검사 통과 — 인라인 블록 해시가 firebase.json 과 일치합니다.');
