/* 전환 전·후 대조를 한 번에 돌린다. 결과는 `.verify/`(git 무시)에 쌓인다.
 *
 *   node scripts/verify/verify.mjs stability        기준선을 두 번 찍어 서로 대조 — 도구가 흔들리지 않는지(0건이어야 함)
 *   node scripts/verify/verify.mjs run <폴더>        기준선과 <폴더>(예: dist)를 **같은 때에** 찍어 대조
 *   node scripts/verify/verify.mjs run <폴더> --only 정규식
 *
 * 기준선은 저장해 두지 않고 매번 freeze 태그에서 꺼내 새로 찍는다 — 구글 폰트 파일처럼
 * 밖에서 오는 것이 시간이 지나 바뀌면, 오래전에 찍은 기준선과 오늘 찍은 결과가 앱과
 * 무관하게 어긋나기 때문이다. 둘을 같은 때에 찍으면 그 흔들림이 양쪽에 똑같이 들어간다.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { capture } from './capture.mjs';
import { compare } from './compare.mjs';

export const FREEZE_TAG = 'calculator-freeze-20260925-pre-react-after-artifact';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const V = path.join(ROOT, '.verify');

function extractBaseline() {
  const dir = path.join(V, 'src-baseline');
  fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true });
  for (const f of ['index.html', 'og.jpg']) {
    fs.writeFileSync(path.join(dir, f), execFileSync('git', ['show', `${FREEZE_TAG}:${f}`], { cwd: ROOT, maxBuffer: 64 << 20 }));
  }
  return dir;
}

function report(name, { files, fails, wsNotes }) {
  if (files === 0) { console.error(`${name}: 대조할 파일이 0개 — 빈 게이트`); return false; }
  if (wsNotes.length) console.log(`참고 — 공백만 다른 텍스트 노드 ${wsNotes.length}개 파일(실패 아님)\n  ${wsNotes.join('\n  ')}`);
  if (fails.length) { console.log(`${name}: 차이 ${fails.length}건 / 파일 ${files}개\n  ${fails.join('\n  ')}`); return false; }
  console.log(`${name}: 차이 0건 / 파일 ${files}개`);
  return true;
}

async function main() {
const [cmd, arg] = process.argv.slice(2);
const oi = process.argv.indexOf('--only');
const only = oi > 0 ? process.argv[oi + 1] : undefined;
const t = Date.now();
let ok;
if (cmd === 'stability') {
  const src = extractBaseline();
  await capture({ src, out: path.join(V, 'stab-1'), only });
  await capture({ src, out: path.join(V, 'stab-2'), only });
  ok = report('안정성(같은 원본 두 번)', compare(path.join(V, 'stab-1'), path.join(V, 'stab-2'), path.join(V, 'diff-stab')));
} else if (cmd === 'run' && arg) {
  const src = extractBaseline();
  const n1 = await capture({ src, out: path.join(V, 'baseline'), only });
  const n2 = await capture({ src: path.resolve(arg), out: path.join(V, 'candidate'), only });
  console.log(`찍음: 기준선 ${n1}개 · 대조 ${n2}개 조합`);
  ok = report(`기준선(${FREEZE_TAG}) ↔ ${arg}`, compare(path.join(V, 'baseline'), path.join(V, 'candidate'), path.join(V, 'diff')));
} else {
  console.error('사용법: verify.mjs stability | run <폴더> [--only 정규식]'); process.exit(2);
}
console.log(`${((Date.now() - t) / 1000).toFixed(0)}초`);
process.exit(ok ? 0 : 1);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) await main();
