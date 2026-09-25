/* 견적의 상태와 계산. 화면(DOM)은 모른다 — 화면은 main.ts 가 그린다. */
import { ITEMS } from './data.ts';
import { BUDGET, MEET_MAX_RATIO } from './money.ts';
import type { Item, Meet } from './types.ts';

export const M: Meet = { n: 15, c: 2, cap: 40000, unit: 1000, auto: true, per: 0 };   // 협의회 2회 기준, 인당 상한 40,000원

export const D: Item[] = ITEMS.map((it, i) => ({
  ...it, on: !it.off, sel: Math.max(0, it.o.findIndex(o => o.d)), qty: it.q, id: i,
}));

/* 협의회비로 쓸 수 있는 돈 = '남는 예산'과 '상한' 중 작은 쪽.
   자동 계산과 화면 안내가 같은 값을 말하도록 이 두 함수만 쓴다. */
export function meetRoom(goods: number): number {
  return Math.min(Math.max(0, BUDGET - goods), Math.floor(BUDGET * MEET_MAX_RATIO));
}
export function perFit(goods: number, n: number, c: number, unit?: number): number {
  const slots = Math.max(0, n) * Math.max(0, c), u = unit || M.unit;
  return slots ? Math.min(M.cap, Math.floor(meetRoom(goods) / slots / u) * u) : 0;
}

// 공통 수량을 참여 부스에 고르게 나눈다. 남는 것은 앞 부스(①)부터 한 개씩 더 준다.
export const pool = (it: Item): number => it.qty * (it.up || 1);
export function split(it: Item): void {
  if (!it.use) return;
  const n = it.use.length, q = pool(it), base = Math.floor(q / n), r = q % n;
  const sh: Record<number, number> = {};
  it.use.forEach((b, i) => { sh[b] = base + (i < r ? 1 : 0); });
  it.sh = sh;
  it.lastQ = it.qty;
}
D.forEach(split);

/* 첫 마크업이 박았던 값 — 체크 여부·수량·부스 몫의 **속성**(checked·value)은 처음 그린 그대로
   남고, 그 뒤 바뀌는 것은 요소의 속성값이 아니라 현재값(property)이다. #q= 로 들어와도 처음
   그리는 마크업은 권장 기본값이었다. 전환 뒤에도 같은 속성이 나오게 여기 붙잡아 둔다. */
export const INITIAL = D.map(it => ({ on: it.on, qty: it.qty, sh: it.sh ? { ...it.sh } : undefined }));

/* render() 가 화면을 그리면서 함께 하던 모델 쪽 일 — 몫 다시 나누기, 자동 계산이면 지급액 따라가기,
   마지막 합계 기억. 화면을 다시 그릴 때마다(= 전환 전 render() 가 불리던 때마다) 한 번씩 부른다. */
export const runtime = { lastTot: 0 };
export function refresh(): void {
  let goods = 0;
  D.forEach(it => {
    const o = it.o[it.sel];
    goods += it.on ? o.p * it.qty : 0;
    if (it.use && it.lastQ !== it.qty) split(it);            // 전체 수량이 바뀌면 다시 고르게 나눈다
  });
  const slots = Math.max(0, M.n) * Math.max(0, M.c);
  const auto0 = perFit(goods, M.n, M.c);                     // 자동 계산이 낼 값과 똑같아야 한다(상한 포함)
  if (M.auto) M.per = auto0;
  runtime.lastTot = goods + Math.max(0, M.per) * slots;
}

export const groups: string[] = [...new Set(D.map(d => d.g))];
export const booths: string[] = groups.slice(1);                       // ①②③④ (공통 제외)
export const NICK: Record<string, string> = { '①': 'Poster Studio', '②': 'Voice Cinema', '③': 'Face Painting', '④': '잔상 원리' };
export const TAB: Record<string, string> = {};                         // 탭 이름
groups.forEach(g => {
  const k = g.slice(0, 1);
  TAB[g] = g === '공통' ? '공통' : (NICK[k] || g.slice(2));
});
TAB['협의회비'] = '협의회';
export const SECS: string[] = [...groups, '협의회비'];
/* 구분 번호 ⓪①②③④⑤ — 화면 순서 그대로 붙인다. 탭·합계 목록·구분 머리글·엑셀이
   모두 이 하나를 쓴다(따로 적으면 한쪽만 바뀐다).
   부스 이름에는 번호가 이미 들어 있으므로 withNo() 는 없는 것에만 붙인다.
   ⚠ `/^[⓪-⑨]/` 같은 문자 범위를 쓰지 말 것 — ⓪(U+24EA)가 ⑨보다 코드포인트가 크다. 집합으로 비교한다. */
export const CIRC = ['⓪', '①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧', '⑨'];
export const NO: Record<string, string> = {};
SECS.forEach((sec, i) => { NO[sec] = CIRC[i] || ''; });
export const withNo = (sec: string): string => CIRC.includes(sec.slice(0, 1)) ? sec : (NO[sec] ? NO[sec] + ' ' + sec : sec);

export const goodsTotal = (): number => D.reduce((t, it) => t + (it.on ? it.o[it.sel].p * it.qty : 0), 0);

// 한 부스 몫을 올리면 가장 많이 가진 다른 부스에서 한 개를 가져오고,
// 내리면 가장 적게 가진 부스로 한 개를 넘긴다. 전체 수량은 그대로다.
// 더 가져올 몫이 없으면 'none' — 화면이 안내창을 띄운다.
export function moveShare(it: Item, bi: number, dir: number): boolean | 'none' {
  const sh = it.sh as Record<number, number>;
  const others = (it.use as number[]).filter(b => b !== bi);
  if (dir > 0) {
    let j = -1, mx = 0;
    others.forEach(b => { if (sh[b] > 0 && sh[b] >= mx) { mx = sh[b]; j = b; } });
    if (j < 0) return 'none';
    sh[j]--; sh[bi]++;
  } else {
    if (!sh[bi]) return false;
    let j = -1, mn = Infinity;
    others.forEach(b => { if (sh[b] < mn) { mn = sh[b]; j = b; } });
    if (j < 0) return false;
    sh[bi]--; sh[j]++;
  }
  return true;
}

/* 협의회비가 상한 비율을 넘었는지 본다. **막지는 않는다** — 저장 자체를 막을지는 대표님 확정 전이다. */
export function meetOverRatio(): { meet: number; ratio: number } | null {
  const slots = Math.max(0, M.n) * Math.max(0, M.c), meet = Math.max(0, M.per) * slots;
  const ratio = meet / BUDGET;
  return ratio > MEET_MAX_RATIO ? { meet, ratio } : null;
}

/* 자동 계산 : 쓸 수 있는 돈을 **사람이 보기에 자연스러운 조합**으로 나눈다.
   대표님이 준 현실 분포(2026-09-09)를 탐색 순서로 쓴다 —
   협의회는 1회가 70%, 1~2회가 90%이고, 인원은 10~20명이 90%다.
   사람은 **5·0으로 떨어지는 인원**을 가장 깔끔하게 본다는 대표님 말씀에 따라 그것을 먼저 본다:
     · 지금 사람이 맞춰 둔 조합을 가장 먼저 본다(그대로 되면 건드리지 않는다)
     · 그다음 횟수 1회 → 2회 → 3회, 각 횟수에서 **인원 20·15·10·5명** → 그 밖의 인원
   조건은 **인당이 목표선(10,000원) 이상**이고, 그중 **쓸 돈을 가장 알뜰히 쓰는**(남는 돈이 가장
   적은) 조합을 고른다. 같으면 먼저 본 것(= 더 흔한 것)이 이긴다.
   · 인당 상한은 40,000원.
   · 절사 단위는 1,000원이 기본이다. **500원은 마지막 수단**으로, 남는 돈을 실제로 더 줄일 수
     있을 때만 쓴다(목표선을 맞추는 데는 도움이 안 된다 — 10,000원이 두 단위 모두의 배수라
     1,000원으로 못 맞추면 500원으로도 못 맞춘다). 바꿨으면 안내에 명시한다.
   · 목표선을 맞출 조합이 아예 없으면 멈추고 알린다.
   사람이 「자동 계산」을 눌렀을 때만 돌고, 인원·횟수를 바꿨으면 무엇을 바꿨는지 알려 준다. */
export const PER_GOAL_LOW = 10000;               // 인당 목표선(규칙이 아니라 목표다 — 1만~1.5만원 선)
const C_ORDER = [1, 2, 3];                       // 1회가 70%, 1~2회가 90%
const N_ROUND = [20, 15, 10, 5];                 // 5·0으로 떨어지는 인원을 먼저
const N_ETC = [19, 18, 17, 16, 14, 13, 12, 11, 9, 8, 7, 6, 4, 3, 2, 1];
interface NC { n: number; c: number }
export type FitResult =
  | { ok: false }
  | { ok: true; per: number; left: number; unit: number; unitChanged: boolean; changed: boolean; from: NC; to: NC };
export function autoFit(): FitResult {
  const goods = goodsTotal();
  /* 쓸 수 있는 돈은 '남는 예산'과 '협의회비 상한' 중 **작은 쪽**이다.
     이걸 빼먹으면 자동 계산이 상한을 넘는 값을 만들어 놓고, 곧바로 자기 앱이
     '상한을 넘았다'고 경고하는 상태가 된다(실제로 그렇게 짰다가 검증에서 잡혔다). */
  const room = meetRoom(goods);
  const from: NC = { n: Math.max(1, M.n), c: Math.max(1, M.c) };
  const cands: NC[] = [from];
  for (const c of C_ORDER) for (const n of N_ROUND) cands.push({ n, c });
  for (const c of C_ORDER) for (const n of N_ETC) cands.push({ n, c });
  /* 절사 단위별로 가장 알뜰한 조합을 찾는다. 같은 남는 돈이면 먼저 본 것(= 더 흔한 조합)이 이긴다. */
  type Best = { n: number; c: number; per: number; left: number; unit: number };
  const search = (u: number): Best | null => {
    let b: Best | null = null;
    for (const cd of cands) {
      const per = perFit(goods, cd.n, cd.c, u);
      if (per < PER_GOAL_LOW) continue;
      const left = room - per * cd.n * cd.c;
      if (!b || left < b.left) b = { n: cd.n, c: cd.c, per, left, unit: u };
    }
    return b;
  };
  /* 500원 단위는 **마지막 수단**이다 — 쓰이는 경우는 **남는 돈을 실제로 더 줄일 수 있을 때뿐**이다. */
  let best = search(M.unit);
  if (M.unit === 1000 && (!best || best.left > 0)) {
    const half = search(500);
    if (half && (!best || half.left < best.left)) best = half;
  }
  if (!best) return { ok: false };
  const unitChanged = best.unit !== M.unit;
  M.n = best.n; M.c = best.c; M.per = best.per; M.auto = false;
  if (unitChanged) M.unit = best.unit;
  return { ok: true, per: best.per, left: best.left, unit: best.unit, unitChanged,
           changed: (best.n !== from.n || best.c !== from.c || unitChanged), from, to: { n: best.n, c: best.c } };
}
