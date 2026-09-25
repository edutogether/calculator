#!/usr/bin/env node
/* 첫 화면(권장안)이 성립하는지 배포 전에 검사한다.
 *
 * 이 앱의 첫 진입은 권장 물품 구성에서 자동 계산을 한 번 돌려 지급액을 정하고 고정한다.
 * 그래서 **물품 단가·수량·권장 표시나 협의회 기본값을 손대면 첫 화면이 조용히 달라진다.**
 * 사람이 아무것도 하지 않은 첫 화면이 규칙을 어기거나 이상한 숫자를 보이면 안 되므로 여기서 막는다.
 *
 * 검사하는 것
 *   0) 화면 입력칸의 기본값과 상태(M)가 같은가
 *   1) 항목마다 권장(d) 표시가 정확히 하나씩 있는가
 *   2) 권장안의 협의회비가 상한 비율 안에 드는가
 *   3) 권장안의 합계가 배정 예산을 넘지 않는가
 *   4) 권장안의 인당 지급액이 목표선(10,000원) 이상인가
 *      — 2)는 계산에 상한이 반영돼 있어 보통 저절로 지켜진다. 그래도 남겨 둔다:
 *        계산 쪽이 잘못 바뀌면 여기서 걸린다. 실제로 의미를 지키는 것은 3)·4)다.
 *
 * 데이터·기본값은 앱이 쓰는 모듈(src/*.ts)을 그대로 불러오고(Node 24 는 .ts 를 그대로 실행한다),
 * 계산은 여기서 **따로 다시** 한다 — 앱의 계산을 불러다 쓰면 앱이 틀렸을 때 검사도 같이 틀린다.
 * 입력칸의 화면 기본값은 src/App.tsx 의 마크업(defaultValue)에서 읽는다.
 *
 * 실행: node scripts/check-recommended.js
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const view = fs.readFileSync(path.join(__dirname, '..', 'src', 'App.tsx'), 'utf8');

(async () => {
  const { ITEMS: D } = await import('../src/data.ts');
  const { BUDGET, MEET_MAX_RATIO: RATIO } = await import('../src/money.ts');
  const { M, PER_GOAL_LOW: GOAL_LOW } = await import('../src/model.ts');
  for (const [what, v] of [['예산(BUDGET)', BUDGET], ['협의회비 상한(MEET_MAX_RATIO)', RATIO], ['인당 목표선(PER_GOAL_LOW)', GOAL_LOW]]) {
    if (typeof v !== 'number' || !(v > 0)) {
      console.error('src/ 에서 ' + what + ' 을 찾지 못했습니다 — 검사 대상을 잘못 잡았습니다.');
      process.exit(1);
    }
  }
  if (!Array.isArray(D) || D.length === 0) {
    // §21-1 — 대상이 0건이면 아래 forEach 는 전부 조용히 통과한다(검사한 게 아니라 아무것도
    // 안 본 것). 항목 데이터가 통째로 비면 배포를 막아야 한다.
    console.error('항목 데이터(src/data.ts 의 ITEMS)가 비었습니다 — 검사할 항목이 0개면 이 검사는 아무것도 못 봅니다.');
    process.exit(1);
  }
  const N = M.n, C = M.c, CAP = M.cap, UNIT = M.unit;

  const problems = [];

  /* 0) 화면의 입력칸 기본값과 상태(M)가 같은지.
        두 곳에 같은 숫자가 박혀 있어서 한쪽만 고치면 **화면과 계산이 어긋난다** —
        인당 상한을 40,000 → 30,000 으로 내릴 때 실제로 마크업 쪽을 빼먹었다(2026-09-09). */
  [['mN', N, '인원'], ['mC', C, '협의회 횟수'], ['mCap', CAP, '인당 지원금액']].forEach(([id, want, what]) => {
    const m = view.match(new RegExp('id="' + id + '"[^>]*(?:defaultValue|value)="(\\d+)"'));
    if (!m) { problems.push('입력칸 ' + id + ' 의 기본값(value)을 찾지 못했습니다.'); return; }
    if (Number(m[1]) !== want)
      problems.push(what + ' 의 화면 기본값과 상태가 다릅니다 — 입력칸 value="' + m[1] + '" 인데 M(src/model.ts) 은 ' + want + ' 입니다.');
  });

  // 1) 권장 표시 정합성 + 권장 물품 합계
  let goods = 0;
  D.forEach(it => {
    const marked = it.o.filter(o => o.d).length;
    if (marked !== 1) problems.push('권장(d) 표시가 ' + marked + '개인 항목: ' + it.g + ' / ' + it.n + ' (정확히 1개여야 합니다)');
    if (it.off) return;                       // 처음에 꺼져 있는 항목은 합계에 들어가지 않는다
    goods += it.o[Math.max(0, it.o.findIndex(o => o.d))].p * it.q;
  });

  // src/model.ts 의 meetRoom()·perFit() 과 같은 계산이다. 저쪽을 고치면 이쪽도 고쳐야 한다.
  const room = Math.min(Math.max(0, BUDGET - goods), Math.floor(BUDGET * RATIO));
  const slots = N * C;
  const per = slots ? Math.min(CAP, Math.floor(room / slots / UNIT) * UNIT) : 0;
  const meet = per * slots;
  const total = goods + meet;
  const ratio = meet / BUDGET;

  const fmt = n => n.toLocaleString('ko-KR');
  console.log('권장안 계산');
  console.log('  물품 합계   : ' + fmt(goods) + '원');
  console.log('  협의회 기본 : ' + N + '명 × ' + C + '회 = ' + slots + '건, 인당 상한 ' + fmt(CAP) + '원, 절사 ' + fmt(UNIT) + '원');
  console.log('  쓸 수 있는 돈: ' + fmt(room) + '원 (남는 예산과 상한 중 작은 쪽)');
  console.log('  인당 지급액 : ' + fmt(per) + '원   (목표선 ' + fmt(GOAL_LOW) + '원 이상)');
  console.log('  협의회비    : ' + fmt(meet) + '원 = 예산의 ' + (ratio * 100).toFixed(1) + '%  (상한 ' + (RATIO * 100).toFixed(0) + '%)');
  console.log('  합계        : ' + fmt(total) + '원 / ' + fmt(BUDGET) + '원');

  // 2) 상한
  if (ratio > RATIO)
    problems.push('권장안의 협의회비가 상한을 넘습니다 — ' + fmt(meet) + '원(' + (ratio * 100).toFixed(1) + '%) > '
      + fmt(Math.floor(BUDGET * RATIO)) + '원(' + (RATIO * 100).toFixed(0) + '%).');

  // 3) 예산
  if (total > BUDGET)
    problems.push('권장안의 합계가 배정 예산을 넘습니다 — ' + fmt(total) + '원 > ' + fmt(BUDGET) + '원.\n'
      + '    사람이 아무것도 하지 않은 첫 화면이 이미 초과 상태가 됩니다.');

  // 4) 인당 목표선
  if (per < GOAL_LOW)
    problems.push('권장안의 인당 지급액이 목표선보다 적습니다 — ' + fmt(per) + '원 < ' + fmt(GOAL_LOW) + '원.\n'
      + '    물품이 늘어 남는 돈이 줄었거나 인원·횟수 기본값이 커진 것입니다.\n'
      + '    협의회 기본값(src/model.ts 의 M 의 n·c)이나 권장 물품 구성을 다시 잡으세요.');

  if (problems.length) {
    console.error('\n권장안 검사 실패\n');
    problems.forEach(p => console.error('  - ' + p));
    process.exitCode = 1;
    return;
  }
  console.log('\n권장안 검사 통과');
})();
