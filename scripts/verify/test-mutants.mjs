/* 화면 기반 테스트(tests/scenarios.test.js)가 이빨이 있는지 확인한다(§5.4).
 * 전환 전 원본(freeze 태그)에 실제로 있었던 종류의 결함을 하나씩 넣고, 테스트가 실패하는지 본다.
 *
 *   node scripts/verify/test-mutants.mjs
 *
 * 원본에 대고 돌리는 이유: 테스트를 화면 기반으로 옮긴 뒤에도 옮기기 전과 같은 결함을
 * 잡는지가 궁금한 것이고, 그 기준은 전환 전 코드다.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const TAG = 'calculator-freeze-20260925-pre-react-after-artifact';
const DIR = path.join(ROOT, '.verify', 'test-mutants');
fs.mkdirSync(DIR, { recursive: true });
const base = execFileSync('git', ['show', `${TAG}:index.html`], { cwd: ROOT, maxBuffer: 64 << 20 }).toString('utf8');

// [이름, 원문, 바꿀 것, 실패해야 하는 시나리오 번호]
const MUTANTS = [
  ['부호 뒤집힘', "return (v>0?'+':v<0?'−':'')", "return (v>0?'−':v<0?'+':'')", [1, 2]],
  ['초록 경계 90 → 90 초과', "if(p>=90) return ' r-good';", "if(p>90) return ' r-good';", [4]],
  ['정확히 100%를 빨강으로', "if(p>100) return ' r-over';", "if(p>=100) return ' r-over';", [4]],
  ['게이지가 옛 규칙(pct>92)', "g.className='gauge'+rateClass(rate);", "g.className='gauge'+(rate>92?' r-warn':' r-good');", [5]],
  ['부스 이름에 번호 이중', "const withNo=sec=>CIRC.includes(sec.slice(0,1))?sec:", "const withNo=sec=>false?sec:", [6]],
  ['자동 계산 목표선 필터 빠짐', 'if(per<PER_GOAL_LOW) continue;', '', [7]],
  ['자동 계산 뒤 계속 따라옴', 'M.n=best.n; M.c=best.c; M.per=best.per; M.auto=false;', 'M.n=best.n; M.c=best.c; M.per=best.per; M.auto=true;', [7]],
  ['#q= 에서 수량 빠짐', 'const a=D.map(it=>[it.sel,it.qty,it.on?1:0]);', 'const a=D.map(it=>[it.sel,0,it.on?1:0]);', [7]],
  ['#q= 수량 검증 없음', 'D[i].qty=int0(v[1]);', 'D[i].qty=v[1];', [8]],
  ['입력 중인 #mCap 을 덮어씀', 'if(document.activeElement!==mc)mc.value=F(M.cap);', 'mc.value=F(M.cap);', [9]],
  ['탭 이름에 AI', "'①':'Poster Studio'", "'①':'AI Poster Studio'", [10]],
  ['엑셀 수량 검증 없음', 'qty:Number.isFinite(q)?Math.max(0,Math.floor(q)):null', 'qty:Number.isFinite(q)?q:null', [11]],
  ['인당 상한 두 배', 'return Math.min(PER_MAX, Math.max(0,', 'return Math.min(PER_MAX*2, Math.max(0,', [13]],
];

let bad = 0;
for (const [name, from, to, expect] of MUTANTS) {
  if (!base.includes(from)) { console.log(`✗ ${name}: 원문을 찾지 못함`); bad++; continue; }
  const f = path.join(DIR, 'index.html');
  fs.writeFileSync(f, base.replace(from, to));
  const out = path.join(DIR, 'result.json');
  fs.rmSync(out, { force: true });
  spawnSync(process.execPath, [path.join(ROOT, 'node_modules', 'vitest', 'vitest.mjs'), 'run', '--reporter=json', `--outputFile=${out}`],
    { cwd: ROOT, env: { ...process.env, APP_HTML: f }, encoding: 'utf8', maxBuffer: 64 << 20 });
  if (!fs.existsSync(out)) { console.log(`✗ ${name}: 테스트 결과 파일이 안 생김`); bad++; continue; }
  const json = JSON.parse(fs.readFileSync(out, 'utf8'));
  const failed = new Set(json.testResults.flatMap(t => t.assertionResults)
    .filter(a => a.status === 'failed').map(a => Number((a.ancestorTitles[0].match(/시나리오 (\d+)/) || [])[1])));
  const missed = expect.filter(n => !failed.has(n));
  if (!failed.size || missed.length) { console.log(`✗ ${name}: 시나리오 ${missed.join(',') || expect.join(',')} 가 실패하지 않음 (실패한 것: ${[...failed].join(',') || '없음'})`); bad++; }
  else console.log(`✓ ${name}: 시나리오 ${[...failed].sort((a, b) => a - b).join(',')} 실패`);
}
console.log(bad ? `\n못 잡은 변이 ${bad}/${MUTANTS.length}` : `\n변이 ${MUTANTS.length}/${MUTANTS.length} 모두 잡음`);
process.exit(bad ? 1 : 0);
