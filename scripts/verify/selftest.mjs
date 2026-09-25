/* 대조 도구 자체를 검증한다(§5.4). 기준선 사본에 일부러 작은 결함을 하나씩 넣고,
 * 도구가 그것을 "차이"로 잡는지 본다. 하나라도 못 잡으면 이 도구의 "0건"은 믿을 수 없다.
 *
 *   node scripts/verify/selftest.mjs
 *
 * 결함은 전환에서 실제로 새기 쉬운 종류로 골랐다 — 1px 밀림, 색 한 단계, id 하나 빠짐,
 * `#q=` 필드 순서, 화면에 안 보이는 aria-label, 엑셀 머리글, 인쇄 여백, JS 꺼진 카드 문구,
 * 공유 카드 meta, 계산 반올림.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { capture } from './capture.mjs';
import { compare } from './compare.mjs';
import { FREEZE_TAG } from './verify.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const V = path.join(ROOT, '.verify', 'selftest');
const ONLY = '^(default|share|xlsx-export-default|print|nojs|tab-5|meet-16)$';
const COMBO = 'pc-light';

// [이름, 원문, 바꿀 것, 잡혀야 하는 파일(정규식)]
const MUTANTS = [
  ['1px 밀림', '.tot{', '#tot{position:relative;left:1px}.tot{', /default\/pc-light\.(png|dom)/],
  ['색 한 단계', '--good:#146c43', '--good:#146c44', /default\/pc-light\.(png|dom)/],
  ['id 하나 빠짐', '<a id="openSafari" ', '<a ', /nojs\/pc-light\.dom/],
  ['#q= 필드 순서', 'JSON.stringify({v:1,a,m:', 'JSON.stringify({a,v:1,m:', /share\/pc-light\.values/],
  ['aria-label', 'aria-label="수량 감소"', 'aria-label="수량 줄이기"', /default\/pc-light\.dom/],
  ['엑셀 머리글', "'구매 링크'];", "'구매링크'];", /xlsx-export-default\/pc-light\.values/],
  ['인쇄 여백', '@page{size:A4;margin:10mm 11mm}', '@page{size:A4;margin:10mm 12mm}', /print\/pc-light\.values/],
  ['JS 꺼진 카드 문구', '<h2>브라우저로 열어 주세요</h2>', '<h2>브라우저로 열어주세요</h2>', /nojs\/pc-light\.(png|dom)/],
  ['공유 카드 meta', 'content="summary_large_image"', 'content="summary"', /default\/pc-light\.dom/],
  ['계산 반올림(내림 → 반올림)', 'Math.floor(meetRoom(goods)/slots/u)*u', 'Math.round(meetRoom(goods)/slots/u)*u', /meet-16\/pc-light\.(png|dom)/],
  ['표시 자릿수(집행률 소수 1자리 → 2자리)', '${(tot/BUDGET*100).toFixed(1)}%</span>', '${(tot/BUDGET*100).toFixed(2)}%</span>', /default\/pc-light\.(png|dom)/],
];

function extract(dir) {
  fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true });
  for (const f of ['index.html', 'og.jpg']) {
    fs.writeFileSync(path.join(dir, f), execFileSync('git', ['show', `${FREEZE_TAG}:${f}`], { cwd: ROOT, maxBuffer: 64 << 20 }));
  }
}

const base = path.join(V, 'src-base');
extract(base);
await capture({ src: base, out: path.join(V, 'out-base'), only: ONLY, combo: COMBO });
let bad = 0;
for (const [name, from, to, expect] of MUTANTS) {
  const src = path.join(V, 'src-mut');
  extract(src);
  const f = path.join(src, 'index.html');
  const html = fs.readFileSync(f, 'utf8');
  if (!html.includes(from)) { console.log(`✗ ${name}: 원문을 찾지 못함 — 변이를 넣지 못했다`); bad++; continue; }
  fs.writeFileSync(f, html.replace(from, to));
  const out = path.join(V, 'out-mut');
  await capture({ src, out, only: ONLY, combo: COMBO });
  const { fails } = compare(path.join(V, 'out-base'), out);
  const hit = fails.filter(x => expect.test(x.split(':')[0]));
  if (hit.length) console.log(`✓ ${name}: 잡음 (${fails.length}건, 예: ${hit[0].split('\n')[0]})`);
  else { console.log(`✗ ${name}: 못 잡음 (차이 ${fails.length}건${fails[0] ? ', 엉뚱한 곳: ' + fails[0].split('\n')[0] : ''})`); bad++; }
}
console.log(bad ? `\n실패 ${bad}/${MUTANTS.length} — 이 도구의 0건을 믿으면 안 된다` : `\n변이 ${MUTANTS.length}/${MUTANTS.length} 모두 잡음`);
process.exit(bad ? 1 : 0);
