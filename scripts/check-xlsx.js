/* 외부 엑셀 라이브러리(SheetJS) <script> 가 안전한 상태로 고정돼 있는지 검사한다.
 *
 *   node scripts/check-xlsx.js          dist/index.html 과 firebase.json 만 본다(네트워크 없음)
 *   node scripts/check-xlsx.js --live   위에 더해, 실제로 그 주소의 파일을 받아 SRI 해시와 버전을 대조한다
 *
 * 왜 있는가: 가져오기(엑셀)는 사용자가 고른 파일을 이 라이브러리로 직접 읽는다. 0.19.2 이하에는 알려진
 * 취약점(CVE-2023-30533)이 있어 0.19.3 이상이어야 한다. cdnjs 에는 0.18.5 보다 새 버전이 없어
 * 공식 배포처(cdn.sheetjs.com)에서 받는다. 그 호스트를 CSP 로 열어 둔 만큼, 파일 내용은 SRI 로 고정하고
 * 다른 호스트·와일드카드·unsafe 가 끼어들지 못하게 여기서 막는다.
 *
 * 정적 검사는 배포 전에, --live 는 PR 에서(그리고 SRI 해시를 새로 정할 때) 돌린다. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const built = path.join(root, 'dist', 'index.html');
if (!fs.existsSync(built)) {
  console.error('dist/index.html 이 없습니다 — `npm run build` 를 먼저 돌리세요.');
  process.exit(1);
}
const html = fs.readFileSync(built, 'utf8');
const config = JSON.parse(fs.readFileSync(path.join(root, 'firebase.json'), 'utf8'));

const ALLOWED_HOST = 'https://cdn.sheetjs.com';
const MIN_VERSION = [0, 19, 3];
const problems = [];

// 1) 외부 <script src> 는 SheetJS 하나뿐이어야 한다
const tags = [...html.matchAll(/<script\b[^>]*\ssrc\s*=\s*"([^"]*)"[^>]*>/g)];
if (tags.length !== 1) problems.push(`외부 <script src> 가 ${tags.length}개입니다 — SheetJS 하나뿐이어야 합니다.`);
const tag = tags[0] ? tags[0][0] : '';
const src = tags[0] ? tags[0][1] : '';

// 2) 주소: 허용 호스트 + 버전이 박힌 경로, 버전은 0.19.3 이상
const m = /^https:\/\/cdn\.sheetjs\.com\/xlsx-(\d+)\.(\d+)\.(\d+)\/package\/dist\/xlsx\.full\.min\.js$/.exec(src);
let version = null;
if (!m) {
  problems.push(`SheetJS 주소가 ${ALLOWED_HOST}/xlsx-<버전>/package/dist/xlsx.full.min.js 형식이 아닙니다: ${src}`);
} else {
  const v = [Number(m[1]), Number(m[2]), Number(m[3])];
  version = v.join('.');
  const older = v[0] !== MIN_VERSION[0] ? v[0] < MIN_VERSION[0]
    : v[1] !== MIN_VERSION[1] ? v[1] < MIN_VERSION[1] : v[2] < MIN_VERSION[2];
  if (older) problems.push(`SheetJS ${version} 은 0.19.3 보다 낮습니다 — 알려진 취약 버전입니다.`);
}

// 3) 무결성: sha512 SRI + crossorigin="anonymous"
const integrity = (/\sintegrity\s*=\s*"(sha512-[A-Za-z0-9+/]+=*)"/.exec(tag) || [])[1];
if (!integrity) problems.push('SheetJS <script> 에 sha512 integrity 가 없습니다.');
if (!/\scrossorigin\s*=\s*"anonymous"/.test(tag)) problems.push('SheetJS <script> 에 crossorigin="anonymous" 가 없습니다 — 없으면 SRI 가 적용되지 않습니다.');

// 4) CSP script-src: 이 호스트 하나만 추가로 열려 있어야 한다
const csp = (config.hosting.headers || []).flatMap(e => e.headers || [])
  .filter(h => h.key === 'Content-Security-Policy').map(h => h.value).join(' ');
const scriptSrc = (/(?:^|;)\s*script-src\s+([^;]*)/.exec(csp) || [])[1] || '';
const tokens = scriptSrc.split(/\s+/).filter(Boolean);
const hosts = tokens.filter(t => /^(https?:|\*)/.test(t) || t.includes('*'));
if (hosts.length !== 1 || hosts[0] !== ALLOWED_HOST) {
  problems.push(`CSP script-src 의 외부 호스트가 ${ALLOWED_HOST} 하나뿐이어야 합니다. 지금: ${hosts.join(' ') || '(없음)'}`);
}
if (tokens.some(t => t.includes('*') || t === 'https:' || t === 'http:' || t === 'data:' || t === "'unsafe-inline'" || t === "'unsafe-eval'")) {
  problems.push("CSP script-src 에 와일드카드·스킴 전체·data:·'unsafe-*' 가 들어 있습니다.");
}

// 5) --live: 실제 파일의 해시·버전이 박아 둔 값과 같은지
async function live() {
  if (!m || !integrity) return;
  const res = await fetch(src);
  if (!res.ok) { problems.push(`SheetJS 파일을 받지 못했습니다: ${res.status} ${src}`); return; }
  const body = Buffer.from(await res.arrayBuffer());
  const got = 'sha512-' + crypto.createHash('sha512').update(body).digest('base64');
  if (got !== integrity) problems.push(`실제 파일의 해시가 박아 둔 integrity 와 다릅니다.\n    박아 둔 값: ${integrity}\n    실제 값   : ${got}`);
  if (!body.toString('latin1').includes(`version="${version}"`)) problems.push(`받은 파일이 스스로 밝히는 버전이 ${version} 이 아닙니다.`);
}

if (process.argv.includes('--live')) await live();

if (problems.length) {
  console.error('엑셀 라이브러리 검사 실패\n');
  problems.forEach(p => console.error('  - ' + p));
  process.exit(1);
}
console.log(`엑셀 라이브러리 검사 통과 — SheetJS ${version}, SRI·CSP 고정${process.argv.includes('--live') ? ', 실제 파일 해시 일치' : ''}.`);
