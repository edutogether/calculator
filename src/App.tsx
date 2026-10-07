/* 화면. 계산·상태는 model.ts·money.ts·share-state.ts 에 있고, 여기서는 그것을 그리고 사람의 조작을 받는다.
 *
 * 전환 전(바닐라 JS) 화면과 **한 픽셀도, 한 동작도** 다르지 않아야 한다. 그래서 몇 가지를 일부러
 * 원래 방식대로 둔다 — "React 답게" 바꾸면 화면이나 동작이 달라지는 곳들이다:
 * - 입력칸(수량·인원·횟수·인당 상한·지급액)과 체크박스는 **비제어**다. 원래 코드는 사람이 친 글자를
 *   그대로 두다가 정해진 순간(±단추, syncChecks(), render())에만 값을 썼다. 그 순간을 그대로 지키려고
 *   ref 로 그 순간에만 쓴다. 처음 마크업의 checked·value 속성도 원래처럼 권장 기본값이다.
 * - 그룹 머리 체크박스는 줄 하나를 끌 때 따라 바뀌지 않는다(syncChecks() 때만 맞춰진다). 원래 그랬다.
 * - 절사 단위 단추의 선택 표시는 단추를 누르거나 자동 계산이 바꿀 때만 바뀐다(#q= 로 500원이
 *   들어와도 1,000원이 선택된 채로 보인다). 원래 그랬다.
 * - render() 자리는 flushSync(commit) 이다 — 원래처럼 그 자리에서 곧바로 화면이 바뀐다.
 * 이런 것들은 _docs/intents/2026-09-25-react-ts-conversion 의 "전환 중 발견한 것"에 적어 두었다. */
import {
  memo, useLayoutEffect, useEffect, useRef, useState, useSyncExternalStore,
  type ReactNode, type MouseEvent, type FormEvent, type ChangeEvent,
} from 'react';
import { createPortal, flushSync } from 'react-dom';
import {
  BUDGET, F, signed, MEET_MAX_RATIO, rateClass, PER_MAX, fixPer, int0, PER_BASIS, type Basis,
} from './money.ts';
import {
  M, D, INITIAL, perFit, pool, groups, booths, TAB, SECS, NO, withNo, moveShare, meetOverRatio, autoFit, runtime,
} from './model.ts';
import { stateStr } from './share-state.ts';
import { commit, subscribe, getVersion } from './store.ts';
import type { Item } from './types.ts';

const byId = <T extends HTMLElement = HTMLElement>(id: string): T => document.getElementById(id) as T;
const LIVE_URL = 'https://calc.edutogether.kr/';   // 이 견적기가 올라가 있는 웹 주소. 공유하기가 #q= 를 붙여 보낸다.
const NOTES = "단가는 2026-09-07 다나와 · 배너 전문몰 · 통신사 공식 요금표 기준이며 배송비는 포함하지 않았어요. 공통 물품은 운영 총괄이 한 번에 사서 부스로 나누기로 해요. 여기서 고른 물건 가운데 각 부스에 공통으로 사용되는 것은 ①②③④ 화면에도 배분된 수량 만큼 그대로 표시됩니다. 부스 화면의 몫을 올리면 다른 부스 몫에서 그만큼 빠지고, 공통 전체 수량을 넘길 수는 없게 설계되어 있어요.";
const IMPORT_MAX_BYTES = 10 * 1024 * 1024;   // 가져오기 파일 크기 상한 — 「엑셀로 저장」이 만드는 파일은 수십 KB 다.
const HEAD = ['구분', '품목', '선택 상품', '규격 · 사양', '수량', '단가(원)', '금액(원)', '구매 링크'];

/** render() 자리 — 모델 부수효과를 돌리고 그 자리에서 곧바로 다시 그린다. */
const render = (): void => flushSync(commit);

/* 비제어 입력칸들 — 원래 코드가 값을 쓰던 순간에만 여기로 쓴다. */
const refs = {
  rowOn: new Map<number, HTMLInputElement>(),
  rowQty: new Map<number, HTMLInputElement>(),
  rowEl: new Map<number, HTMLDivElement>(),
  grp: new Map<string, HTMLInputElement>(),
  fixSh: new Map<string, { el: HTMLInputElement; it: Item; bi: number }>(),
};
function syncChecks(): void {
  D.forEach(it => {
    const c = refs.rowOn.get(it.id); if (c) c.checked = it.on;
    const q = refs.rowQty.get(it.id); if (q) q.value = String(it.qty);
  });
  groups.forEach(g => { const c = refs.grp.get(g); if (c) c.checked = D.filter(d => d.g === g).every(d => d.on); });
}
/* render() 가 입력칸에 하던 일 — 부스 몫 칸, 지급액 칸(입력 중이 아니면), 인당 상한 칸(입력 중이 아니면). */
function paintInputs(): void {
  refs.fixSh.forEach(({ el, it, bi }) => { el.value = String((it.sh as Record<number, number>)[bi] || 0); });
  const mp = byId<HTMLInputElement>('mPer');
  if (document.activeElement !== mp) mp.value = M.per ? F(M.per) : '';
  const mc = byId<HTMLInputElement>('mCap');
  if (document.activeElement !== mc) mc.value = F(M.cap);
}

interface Dlg { open: boolean; t: string; b: string; id: number | null | undefined; basis: Basis[] | undefined; seen: boolean }
interface Opt { open: boolean; item: Item | null; pick: number; gen: number }   // item 은 닫힌 뒤에도 마지막 것을 들고 있다(화면에 남는다)
type Unit = 'init' | '1000' | '500';

/* 두 창(안내창·제품 고르기)의 상태는 App 밖의 작은 상자에 둔다 — 창을 열고 닫을 때 그 창만 다시 그리게.
   App 안에 두면 창 하나를 여는 데 탭·옆 패널·섹션이 다 다시 그려져 원본보다 한 장면 늦었다(2026-09-25 측정). */
function box<T>(initial: T) {
  let value = initial;
  const subs = new Set<() => void>();
  return {
    get: (): T => value,
    set(next: (prev: T) => T): void { value = next(value); subs.forEach(f => f()); },
    subscribe(f: () => void): () => void { subs.add(f); return () => { subs.delete(f); }; },
  };
}
const dlgBox = box<Dlg>({ open: false, t: '', b: '', id: undefined, basis: undefined, seen: false });
const optBox = box<Opt>({ open: false, item: null, pick: 0, gen: 0 });

function dialog(t: string, b: string, id: number | null, basis?: Basis[]): void {
  flushSync(() => dlgBox.set(() => ({ open: true, t, b, id, basis, seen: true })));
  byId('dlgX').focus();
}
const closeDlg = (): void => flushSync(() => dlgBox.set(d => ({ ...d, open: false })));
function openOpts(it: Item): void {
  flushSync(() => optBox.set(o => ({ open: true, item: it, pick: it.sel, gen: o.gen + 1 })));
  byId('optSave').focus();
}
const closeOpts = (): void => flushSync(() => optBox.set(o => ({ ...o, open: false })));

/* 협의회비가 상한 비율을 넘었으면 왜 안 되는지와 무엇을 하면 되는지 알린다. 막지는 않는다. */
function warnMeetRatio(what: string): boolean {
  const o = meetOverRatio(); if (!o) return false;
  dialog('협의회비가 상한을 초과하였습니다 !',
    `협의회비는 배정 예산의 ${Math.round(MEET_MAX_RATIO * 100)}% 안에서 써야 해요 — `
    + `${F(Math.floor(BUDGET * MEET_MAX_RATIO))}원까지입니다. 지금은 ${(o.ratio * 100).toFixed(1)}%예요.\n\n`
    + '물품을 더 담아 남는 예산을 줄이거나, 협의회비의 인당 지급액·인원·횟수를 낮춰 주세요.\n\n'
    + (what ? what + '은 그대로 진행됩니다 — 막지는 않아요.' : ''), null);
  return true;
}

export function App({ man0, meet0 }: { man0: boolean; meet0: boolean }): ReactNode {
  useSyncExternalStore(subscribe, getVersion);
  const [cur, setCur] = useState(SECS[0]);
  const [man, setManState] = useState(man0);
  const [unit, setUnit] = useState<Unit>('init');
  const [pAllText, setPAllText] = useState('전체 선택');
  const [shareText, setShareText] = useState('공유하기');
  const [shareBusy, setShareBusy] = useState(false);
  const [impText, setImpText] = useState('가져오기');
  const [xlsText, setXlsText] = useState('엑셀로 저장');
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [flashed, setFlashed] = useState<ReadonlySet<number>>(new Set());
  const meetWarned = useRef(false);
  const shareUrlRef = useRef<HTMLInputElement>(null);

  const show = (sec: string): void => flushSync(() => setCur(sec));
  const setMan = (on: boolean): void => flushSync(() => setManState(on));
  const segOn = (u: '1000' | '500'): void => flushSync(() => setUnit(u));

  function jumpTo(id: number): void {
    show('공통');
    flushSync(() => setFlashed(s => new Set(s).add(id)));
    const r = refs.rowEl.get(id) as HTMLDivElement;
    r.scrollIntoView({ block: 'center', behavior: 'smooth' });
    r.classList.remove('flash'); void r.offsetWidth; r.classList.add('flash');
  }

  // 첫 그림 뒤: #q= 로 협의회 설정이 들어왔으면 입력칸을 채우고, 체크·수량을 맞추고, render() 가 하던 칸을 칠한다.
  useLayoutEffect(() => {
    if (meet0) {
      byId<HTMLInputElement>('mN').value = String(M.n);
      byId<HTMLInputElement>('mC').value = String(M.c);
      byId<HTMLInputElement>('mCap').value = String(M.cap);
    }
    syncChecks();
    paintInputs();
  }, [meet0]);
  const version = getVersion();
  useLayoutEffect(() => { paintInputs(); }, [version]);

  // 문서 전체에 걸린 것 — Esc 로 창 닫기.
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => { if (e.key === 'Escape') { closeDlg(); closeOpts(); } };
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('keydown', onKey); };
  }, []);

  // 인당 상한·지급액 칸 — 다 적고 칸을 벗어날 때(change) 한 번만 확인한다(치는 중에 잔소리하지 않게).
  // React 의 onChange 는 칠 때마다 불리는 input 이벤트라, 원래의 change 를 직접 건다.
  useEffect(() => {
    const off: (() => void)[] = [];
    (['mCap', 'mPer'] as const).forEach(id => {
      const el = byId<HTMLInputElement>(id);
      const onChange = (): void => {
        const raw = int0(el.value.replace(/[^0-9]/g, ''));
        if (!raw) return;
        const ok = fixPer(raw);
        if (id === 'mCap') M.cap = ok; else M.per = ok;
        el.value = F(ok);
        if (ok !== raw) {
          if (raw > PER_MAX)
            dialog('인당 지원금액을 초과하였습니다 !',
              '40,000원 이하로 다시 조정해 주세요.\n\n'
              + PER_BASIS.why, null, PER_BASIS.refs);
          else
            dialog('500원 단위로 맞췄어요',
              '계산을 깔끔하게 하려고 500원 단위로 정리했어요. 다시 고치셔도 됩니다.', null);
        }
        render();
      };
      el.addEventListener('change', onChange);
      off.push(() => el.removeEventListener('change', onChange));
    });
    return () => off.forEach(f => f());
  }, []);

  /* ── 계산 — 원래 render() 가 그리던 값들 */
  let goods = 0; const gs: Record<string, number> = {}, fg: Record<string, number> = {};
  D.forEach(it => {
    const o = it.o[it.sel], amt = it.on ? o.p * it.qty : 0;
    goods += amt; gs[it.g] = (gs[it.g] || 0) + amt;
    if (it.use && it.on) it.use.forEach(bi => {
      const sec = booths[bi], share = (it.sh as Record<number, number>)[bi] || 0;
      fg[sec] = (fg[sec] || 0) + o.p * share / (it.up || 1);
    });
  });
  const slots = Math.max(0, M.n) * Math.max(0, M.c), avail = Math.max(0, BUDGET - goods);
  const auto0 = perFit(goods, M.n, M.c);
  const meet = Math.max(0, M.per) * slots, tot = goods + meet;
  const rest = BUDGET - tot;
  const raw = slots ? Math.floor(avail / slots) : 0, capped = raw > M.cap;
  const tips: string[] = [];
  if (M.c < 1 || M.c > 3) tips.push(`협의회 횟수는 보통 1~2회, 많아도 3회예요(지금 ${M.c}회).`);
  if (M.n < 5 || M.n > 20) tips.push(`인원은 보통 5~20명이에요(지금 ${M.n}명).`);
  const rate = tot / BUDGET * 100;
  const d = BUDGET - tot;

  /* ── 동작 */
  function onRowClick(it: Item, act: string, e: MouseEvent<HTMLElement>): void {
    if (act === 'open') { openOpts(it); return; }
    if (act === 'on') it.on = (e.currentTarget as HTMLInputElement).checked;
    if (act === 'm') { it.qty = Math.max(0, it.qty - 1); (refs.rowQty.get(it.id) as HTMLInputElement).value = String(it.qty); }
    if (act === 'p') { it.qty = it.qty + 1; (refs.rowQty.get(it.id) as HTMLInputElement).value = String(it.qty); }
    render();
  }
  function onFixClick(it: Item, bi: number, dir: number): void {
    if (!it.on) return;
    const moved = moveShare(it, bi, dir);
    if (moved === 'none') {
      const u = it.du || '개';
      dialog('더 가져올 몫이 없어요',
        `공통에서 정한 ${it.n} 전체는 ${pool(it)}${u}인데, 지금 그 전부가 이 부스 몫이에요. `
        + `더 쓰려면 공통 화면에서 전체 수량을 늘려 주세요.`, it.id);
    } else if (moved) render();
  }
  function onTab(sec: string): void {
    show(sec);
    /* 협의회 탭에 처음 들어올 때 예산이 넘어 있으면, 그 사실과 「자동 계산」을 한 번만 알려 준다. */
    if (sec !== '협의회비' || meetWarned.current) return;
    const over = runtime.lastTot - BUDGET;
    if (over <= 0) { if (meetOverRatio()) { meetWarned.current = true; warnMeetRatio(''); } return; }
    meetWarned.current = true;
    if (warnMeetRatio('')) return;
    dialog('배정 예산을 초과하였습니다 !',
      '협의회비의 지급액을 직접 줄이셔도 되고, 오른쪽 「자동 계산」을 누르시면 '
      + '남는 예산에 맞춰 인당 금액을 한 번에 맞춰 드려요.', null);
  }
  function onMeetInput(id: 'mN' | 'mC' | 'mCap' | 'mPer', e: FormEvent<HTMLInputElement>): void {
    const v = int0(e.currentTarget.value.replace(/[^0-9]/g, ''));
    if (id === 'mN') M.n = v; else if (id === 'mC') M.c = v; else if (id === 'mCap') M.cap = v;
    else M.per = v;
    render();
  }
  function onAuto(): void {
    const r = autoFit();
    if (r.ok) {
      if (r.unitChanged) segOn(r.unit === 500 ? '500' : '1000');
      byId<HTMLInputElement>('mN').value = String(r.to.n); byId<HTMLInputElement>('mC').value = String(r.to.c);
    }
    setMan(false); render();
    if (!r.ok) {
      dialog('이 예산으로는 협의회비를 맞추기 어려워요',
        '남는 예산으로는 인당 10,000원도 만들기 어려워요.\n\n'
        + '물품을 덜어 남는 예산을 늘린 뒤 다시 눌러 주세요. '
        + '인당 금액을 직접 적어 넣으셔도 됩니다.', null);
      return;
    }
    if (r.changed) {
      const moved: string[] = [];                          // 실제로 바뀐 것만 말한다
      if (r.from.c !== r.to.c) moved.push(`협의회 횟수를 ${r.from.c}회 → ${r.to.c}회로`);
      if (r.from.n !== r.to.n) moved.push(`인원을 ${r.from.n}명 → ${r.to.n}명으로`);
      if (r.unitChanged) moved.push('절사 단위를 500원으로');   // 1,000원으로 안 맞을 때만
      dialog(moved.length > 1 ? '인원과 횟수를 함께 맞췄어요' : '설정을 하나 바꿔 맞췄어요',
        `인당 ${F(r.per)}원이 되도록 ${moved.join(', ')} 바꿨어요.\n\n`
        + '원하는 값이 있으면 직접 고치셔도 돼요 — 그 뒤에는 그대로 유지됩니다.', null);
    }
  }
  function onPAll(): void {
    const anyOff = D.some(it => !it.on);
    D.forEach(it => { it.on = anyOff; });
    flushSync(() => setPAllText(anyOff ? '전체 취소' : '전체 선택'));
    syncChecks(); render();
  }

  /* 공유하기 : 윈도우·휴대폰의 공유창(OS 공유 시트)을 띄운다.
     보내는 것은 **지금 견적이 담긴 주소**다 — 받은 사람이 열면 같은 견적이 그대로 재현된다.
     공유창이 없는 브라우저(데스크톱 파이어폭스 등)에서는 주소를 클립보드에 복사하고,
     그마저 막혀 있으면 화면에 주소를 띄워 직접 복사하게 한다. */
  function showLink(url: string): void {
    flushSync(() => setShareUrl(url));
    const i = shareUrlRef.current as HTMLInputElement; i.value = url; i.focus(); i.select();
  }
  async function shareLink(done: (t: string) => void): Promise<void> {
    const url = LIVE_URL + '#q=' + stateStr();
    const title = 'InKY 부스 견적 같이뽑아요';
    if (navigator.share) {
      try { await navigator.share({ title, text: title, url });
        return done('보냈어요');
      } catch (err) { if (err && (err as Error).name === 'AbortError') return done('취소됨'); }
    }
    try { await navigator.clipboard.writeText(url); return done('주소 복사됨'); } catch (_) { /* 다음 방법으로 */ }
    try {
      const ta = document.createElement('textarea');
      ta.value = url; ta.style.cssText = 'position:fixed;opacity:0';
      document.body.appendChild(ta); ta.select();
      const ok = document.execCommand('copy'); ta.remove();
      if (ok) return done('주소 복사됨');
    } catch (_) { /* 마지막 방법으로 */ }
    showLink(url); done('아래 주소를 복사');
  }
  async function onShare(): Promise<void> {
    if (shareBusy) return;
    flushSync(() => setShareBusy(true));
    const done = (t: string): void => {
      flushSync(() => { setShareText(t); setShareBusy(false); });
      setTimeout(() => flushSync(() => setShareText('공유하기')), 2600);
    };
    warnMeetRatio('공유');
    try { await shareLink(done); }
    catch (err) { console.error(err); done('만들지 못했어요'); }
  }

  /* 가져오기 : 「엑셀로 저장」이 만든 .xlsx 를 그대로 다시 올리면 그 견적이 복원된다.
     먼저 파일을 다 읽어 무엇이 맞는지 세어 보고, **하나라도 맞을 때만** 화면에 반영한다 —
     형식이 다른 파일을 올렸다고 지금 짜 놓은 견적이 지워지면 안 된다. */
  async function onImport(e: ChangeEvent<HTMLInputElement>): Promise<void> {
    const input = e.currentTarget;
    const f = (input.files as FileList)[0]; if (!f) return;
    const setB = (t: string): void => flushSync(() => setImpText(t));
    const fail = (t: string, body: string): void => { dialog(t, body, null); setB('가져오지 못했어요'); };
    if (f.size > IMPORT_MAX_BYTES) {
      fail('파일이 너무 커요',
        `「${f.name}」은 ${Math.ceil(f.size / 1048576)}MB 로, 가져올 수 있는 크기(10MB)를 넘어요.\n\n`
        + '이 계산기의 「엑셀로 저장」으로 만든 파일은 훨씬 작아요. 그 파일을 올려 주세요.');
      input.value = '';
      setTimeout(() => setB('가져오기'), 2600);
      return;
    }
    try {
      let rows: unknown[][];
      try {
        const wb = XLSX.read(await f.arrayBuffer(), { type: 'array' });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        if (!sheet) throw new Error('sheet');
        rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });
      } catch (_) {
        fail('엑셀 파일로 읽지 못했어요',
          `「${f.name}」을 엑셀 파일로 열 수 없었어요.\n\n`
          + '확장자가 .xlsx 인지, 내려받다 만 파일이 아닌지 확인해 주세요.\n\n'
          + '이 계산기의 「엑셀로 저장」으로 만든 파일을 올리시면 가장 확실해요.');
        return;
      }
      // 파일을 먼저 다 훑어 적용할 것을 모아 둔다(이 단계에서는 화면을 바꾸지 않는다)
      const picks: { it: Item; sel: number | null; qty: number | null }[] = [];
      let meetIn: { per: number; n: number | null; c: number | null } | null = null;
      rows.forEach(r => {
        if (!r || r.length < 7) return;
        const nm = String(r[1] || '').trim(), pt = String(r[2] || '').trim();
        if (nm === '협의회 참석 지원') {
          const mm = String(r[3] || '').match(/(\d+)명 × (\d+)회/);
          // 엑셀 셀은 사람이 손으로 고칠 수 있는 값이다 — #q= 와 같은 규칙으로 음수·소수·상한 초과를 걸러낸다.
          meetIn = { per: fixPer(int0(r[5])), n: mm ? int0(mm[1]) : null, c: mm ? int0(mm[2]) : null };
          return;
        }
        const it = D.find(x => x.n === nm); if (!it) return;
        const k = it.o.findIndex(o => o.t === pt);
        const qn = Number(r[4]);
        picks.push({ it, sel: k >= 0 ? k : null, qty: Number.isFinite(qn) ? Math.min(Number.MAX_SAFE_INTEGER, Math.max(0, Math.floor(qn))) : null });
      });
      if (!picks.length) {
        fail('견적으로 알아볼 수 있는 줄이 없어요',
          `「${f.name}」의 첫 시트에서 이 계산기가 아는 품목을 찾지 못했어요.\n\n`
          + '첫 시트에 「구분 · 품목 · 선택 상품 · 규격 · 수량 · 단가 · 금액」 순서로 칸이 있어야 하고, '
          + '품목 이름이 이 계산기의 이름과 같아야 해요.\n\n'
          + '「엑셀로 저장」으로 받은 파일을 그대로 올리시면 됩니다. '
          + '지금 짜고 계신 견적은 그대로 두었어요.');
        return;
      }
      // 여기까지 왔으면 반영한다
      D.forEach(it => { it.on = false; });                       // 파일에 있는 것만 체크된 상태로 만든다
      picks.forEach(p => {
        if (p.sel !== null) p.it.sel = p.sel;
        if (p.qty !== null) p.it.qty = p.qty;
        p.it.on = true;
      });
      const mt = meetIn as { per: number; n: number | null; c: number | null } | null;
      if (mt) {
        if (mt.n) { M.n = mt.n; M.c = mt.c as number; }
        M.auto = false; M.per = mt.per; setMan(true);
        byId<HTMLInputElement>('mN').value = String(M.n); byId<HTMLInputElement>('mC').value = String(M.c);
      }
      syncChecks(); render();
      setB(`${picks.length}개 반영됨`);
    } catch (err) {
      console.error(err);
      fail('가져오는 중에 문제가 생겼어요',
        '파일은 읽었지만 견적으로 옮기지 못했어요.\n\n'
        + '「엑셀로 저장」으로 받은 파일을 고치지 않은 채로 올려 보시고, '
        + '그래도 안 되면 이 화면을 알려 주세요.');
    }
    input.value = '';
    setTimeout(() => setB('가져오기'), 2600);
  }

  function rowsOut(): { R: (string | number)[][]; tot: number } {
    const R: (string | number)[][] = []; let t = 0;
    D.filter(x => x.on && x.qty > 0).forEach(x => {
      const o = x.o[x.sel]; t += o.p * x.qty;
      const sh = x.use ? ' (부스 배분 ' + x.use.map(i => booths[i].slice(0, 1) + ((x.sh as Record<number, number>)[i] || 0) + (x.du || '개')).join(' ') + ')' : '';
      R.push([withNo(x.g), x.n, o.t, o.s + sh, x.qty, o.p, o.p * x.qty, o.u || '']);
    });
    const sl = Math.max(0, M.n) * Math.max(0, M.c);
    if (M.per * sl > 0)
      R.push([withNo('협의회비'), '협의회 참석 지원', `인당 ${F(M.per)}원`, `${M.n}명 × ${M.c}회`, sl, M.per, M.per * sl, '']);
    return { R, tot: t + M.per * sl };
  }
  function onXls(): void {
    const setB = (t: string): void => flushSync(() => setXlsText(t));
    warnMeetRatio('엑셀 저장');
    const { R, tot: total } = rowsOut();
    const now = new Date(), pad = (n: number) => String(n).padStart(2, '0');
    const day = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
    const aoa = [[`InKY 놀이터 체험 부스 구매 견적 (${day}) · 배정 예산 1,500,000원`],
      HEAD, ...R,
      ['합계', '', '', '', '', '', total, ''],
      ['잔액', '', '', '', '', '', 1500000 - total, '']];
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws['!cols'] = [{ wch: 16 }, { wch: 20 }, { wch: 34 }, { wch: 30 }, { wch: 7 }, { wch: 11 }, { wch: 12 }, { wch: 46 }];
    ws['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 7 } }];
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, '견적');
    const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    const name = `InKY_부스_견적_${day}.xlsx`;
    setB('저장 중…');
    try {
      const url = URL.createObjectURL(new Blob([buf],
        { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
      const a = document.createElement('a'); a.href = url; a.download = name;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
      setB('저장됨');
    } catch (_) { setB('저장 실패'); }
    setTimeout(() => setB('엑셀로 저장'), 1800);
  }
  /* 인쇄하기 : 브라우저 인쇄창을 그대로 연다.
     프린터 목록에서 「Microsoft Print to PDF」 같은 PDF 프린터를 고르면 PDF 로 저장된다.
     글자가 그림이 아니라 진짜 글자로 찍혀서 검색·복사도 되고 파일도 가볍다. */
  function onPrint(): void {
    warnMeetRatio('인쇄');
    window.print();
  }

  /* ── 그리기 */
  const u1000Class = unit === '500' ? '' : 'on';
  const u500Class = unit === '500' ? 'on' : unit === '1000' ? '' : undefined;
  const bn = (k: string): ReactNode => <><span className="bn">{NO[k] || ''}</span>{TAB[k] || k}</>;

  const sections = SECS.map(sec => {
    if (sec === '협의회비') return (
      <div key={sec} className={'sec' + (cur === sec ? ' on' : '')} data-sec="협의회비">
        <div className="grp"><div className="gh"><b>{withNo('협의회비')}</b><span>물품 구매 후에 남는 예산은 협의회비로 활용할 수 있어요</span>
          <span className="gs n" id="mSum">{F(meet) + '원'}</span></div>
          <div className="meet">
            <div className="mrow">
              <div className="fld"><label htmlFor="mN">인원</label><input id="mN" className="n" defaultValue="15" inputMode="numeric" onInput={e => onMeetInput('mN', e)} /></div>
              <div className="fld"><label htmlFor="mC">협의회 횟수</label><input id="mC" className="n" defaultValue="2" inputMode="numeric" onInput={e => onMeetInput('mC', e)} /></div>
              <div className="fld"><label htmlFor="mCap">인당 지원금액</label><input id="mCap" className="n" defaultValue="40000" inputMode="numeric" onInput={e => onMeetInput('mCap', e)} /></div>
              <div className="fld w2"><label>절사 단위</label><span className="seg">
                <button id="u1000" className={u1000Class} onClick={() => { M.unit = 1000; segOn('1000'); render(); }}>1,000원</button>
                <button id="u500" className={u500Class} onClick={() => { M.unit = 500; segOn('500'); render(); }}>500원</button></span></div>
              <div className="fld w2"><label htmlFor="mPer">지급액</label><span className="seg plain">
                <span className={'segin' + (man ? ' on' : '')}>
                  <button id="mMan" hidden={man} onClick={() => {
                    M.auto = false; setMan(true); render();
                    byId('mPer').focus(); byId<HTMLInputElement>('mPer').select();
                  }}>직접 입력</button>
                  <input id="mPer" className="n" inputMode="numeric" placeholder={F(auto0) + '원'} hidden={!man}
                    onInput={e => onMeetInput('mPer', e)}
                    onBlur={e => { e.currentTarget.value = M.per ? F(M.per) : ''; }}
                    onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.currentTarget.blur(); } }} />
                  <button className="clr" id="mClr" hidden={!man} aria-label="자동 계산으로 되돌리기"
                    onClick={e => { e.stopPropagation(); M.auto = true; setMan(false); render(); }}>✕</button>
                </span>
                <button id="mAuto" className={man ? 'idle' : 'on'} onClick={onAuto}>자동 계산</button></span></div>
            </div>
            <p className="tip-range" id="mTip" hidden={!tips.length}>{tips.join(' ')}</p>
            <div className="moutw"><p className="cap" id="mNote">{slots === 0
              ? '인원과 횟수를 1 이상으로 두면 지급액이 계산돼요.'
              : <>{'물품 구매에 '}<b>{F(goods) + '원'}</b>{'을 쓰고 남는 '}<b>{F(avail) + '원'}</b>{'을 '
                + `${M.n}명 × ${M.c}회로 나누면 인당 ${F(raw)}원이에요. `
                + (capped ? `인당 상한 ${F(M.cap)}원에 걸려 ` : `여기서 ${F(M.unit)}원 단위로 절사해 `)}<b>{F(M.per) + '원'}</b>{`으로 정리하면 총 ${F(meet)}원, `}<b>{`${F(Math.abs(rest))}원이 ${rest < 0 ? '모자라요' : '남아요'}`}</b>{'.'}</>}</p>
              <div className="mout">
                <div><span className="k">인당</span><span className="big n" id="mPerOut">{F(M.per) + '원'}</span></div>
                <div><span className="k">총 협의회비</span><span className="big n" id="mTotOut">{F(meet) + '원'}</span></div>
                <div className="last"><span className="k">최종 잔액</span><span className="big n" id="mLeft" style={{ color: rest < 0 ? 'var(--over)' : 'var(--good)' }}>{signed(rest)}</span></div>
              </div></div>
          </div>
        </div></div>
    );
    const own = D.filter(x => x.g === sec);
    const bi = booths.indexOf(sec);
    const inh = bi < 0 ? [] : D.filter(x => x.use && x.use.includes(bi));
    return (
      <div key={sec} className={'sec' + (cur === sec ? ' on' : '')} data-sec={sec}>
        <div className="grp"><div className="gh">
          <input type="checkbox" data-grp={sec} defaultChecked aria-label={`${sec} 전체 선택`}
            ref={el => { if (el) refs.grp.set(sec, el); else refs.grp.delete(sec); }}
            onChange={e => { const on = e.currentTarget.checked; D.forEach(it => { if (it.g === sec) it.on = on; }); syncChecks(); render(); }} />
          <b>{withNo(sec)}</b><span>{`${own.length}개 품목 · ${bi < 0 ? '4개 부스가 함께 사용하는 항목이에요' : '이 부스에서만 사용하는 항목이에요'}`}</span>
          <span className="gs n" data-g={sec}>{F(gs[sec] || 0) + '원'}</span></div>
          <div className="list">{own.map(it => <Row key={it.id} it={it} on={it.on} sel={it.sel} qty={it.qty} flashed={flashed.has(it.id)} onAct={onRowClick} />)}</div></div>
        {inh.length ? <div className="grp">
          <div className="subh"><b>공통에서 배분되는 물품</b><span>{`${inh.length}개 · 공통 화면에서만 바꿀 수 있어요`}</span>
            <span className="gs n" data-fg={sec}>{'공통 몫 ' + F(fg[sec] || 0) + '원'}</span></div>
          <div className="list">{inh.map(it => <FixRow key={it.id} it={it} bi={bi} on={it.on} sel={it.sel} share={(it.sh as Record<number, number>)[bi] || 0} onMove={onFixClick} onJump={jumpTo} />)}
            <div className="hint">이 줄들의 값은 공통 예산에 이미 들어가 있어요. 위 소계에는 다시 더하지 않고, 부스별로 얼마어치가 가는지만 보여 줘요.</div>
          </div></div> : null}
      </div>
    );
  });

  return <>
    {sections}
    {createPortal(SECS.map(s => (
      <button key={s} className={'tab' + (cur === s ? ' on' : '')} data-t={s} onClick={() => onTab(s)}><span className="tno">{NO[s]}</span>{TAB[s]}</button>
    )), byId('tabs'))}
    {createPortal(<>
      <div className="actsTop">
        <button className="pb" id="pShare" data-busy={shareBusy ? '1' : undefined} title="이 견적기 주소를 보냅니다 — 받은 사람이 열면 같이 짤 수 있어요" onClick={onShare}>{shareText}</button>
        <button className="pb" id="pImp" onClick={() => byId('fImp').click()}>{impText}</button>
        <button className="pb" id="pAll" onClick={onPAll}>{pAllText}</button>
        <input type="file" id="fImp" accept=".xlsx" hidden onChange={onImport} />
      </div>
      <div className="panel">
        <div className="lab">견적 합계</div>
        <div className="tot n" id="tot">{F(tot)}<small>원</small></div>
        <div className={'gauge' + rateClass(rate)} id="gauge"><i id="bar" style={{ width: Math.min(100, rate) + '%' }}></i></div>
        <div className="sum hideM" id="sum">
          <div><span>물품</span><span className="v">{F(goods) + '원'}</span></div>
          <div><span>협의회비</span><span className="v">{F(meet) + '원'}</span></div>
          {d >= 0 ? <div><span>남는 예산</span><span className="v ok">{signed(d)}</span></div>
            : <div><span>예산 초과</span><span className="v no">{signed(d)}</span></div>}
          <div><span>집행률</span><span className={'v rate' + rateClass(tot / BUDGET * 100)}>{(tot / BUDGET * 100).toFixed(1) + '%'}</span></div>
        </div>
        <div className="brk hideM" id="brk">
          {groups.map(k => <div key={k} data-go={k} onClick={() => show(k)}><span>{bn(k)}</span><span className="n">{F(gs[k] || 0) + '원'}</span></div>)}
          <div data-go="협의회비" onClick={() => show('협의회비')}><span>{bn('협의회비')}</span><span className="n">{F(meet) + '원'}</span></div>
        </div>
      </div>
      <div className="panel acts hideM">
        <button className="pb" id="xls" onClick={onXls}>{xlsText}</button>
        <button className="pb" id="prt" title="여섯 화면을 6쪽으로 묶어 인쇄창을 엽니다 (PDF 프린터를 고르면 PDF 로 저장돼요)" onClick={onPrint}>인쇄하기</button>
      </div>
      <div className="panel notes hideM">
        <p>{NOTES}</p>
      </div>
      {shareUrl !== null ? <div id="shareBox" className="panel" style={{ marginTop: '12px', display: 'flex', flexDirection: 'column', gap: '7px' }}>
        <div className="lab">공유 주소</div><input id="shareUrl" readOnly ref={shareUrlRef} />
      </div> : null}
    </>, document.querySelector('.side') as HTMLElement)}
    <OptDialog />
    <MessageDialog jumpTo={jumpTo} />
  </>;
}

/* 줄은 그 줄이 그리는 값(켜짐·선택 상품·수량·부스 몫·깜빡임)이 바뀔 때만 다시 그린다 — 수량 하나를 바꿀 때
   37개 줄을 모두 다시 비교하면 원본보다 반응이 느려진다(2026-09-25 측정). 품목 객체(it)는 모델이 제자리에서
   고치므로 참조로는 변화를 알 수 없어, 값을 따로 넘겨 비교한다. 처리기(onAct 등)는 비교하지 않는다 — 늘 같은
   상태 setter 만 부르므로 지난번 것을 써도 동작이 같다. */
type RowProps = { it: Item; on: boolean; sel: number; qty: number; flashed: boolean;
  onAct: (it: Item, act: string, e: MouseEvent<HTMLElement>) => void };
const Row = memo(RowView, (a: RowProps, b: RowProps) =>
  a.it === b.it && a.on === b.on && a.sel === b.sel && a.qty === b.qty && a.flashed === b.flashed);
type FixRowProps = { it: Item; bi: number; on: boolean; sel: number; share: number;
  onMove: (it: Item, bi: number, dir: number) => void; onJump: (id: number) => void };
const FixRow = memo(FixRowView, (a: FixRowProps, b: FixRowProps) =>
  a.it === b.it && a.bi === b.bi && a.on === b.on && a.sel === b.sel && a.share === b.share);

/* ── 한 품목 줄(고를 수 있는 줄) */
function RowView({ it, flashed, onAct }: RowProps): ReactNode {
  const o = it.o[it.sel], amt = it.on ? o.p * it.qty : 0;
  return (
    <div className={'row' + (it.on ? '' : ' off') + (flashed ? ' flash' : '')} data-i={it.id}
      ref={el => { if (el) refs.rowEl.set(it.id, el); else refs.rowEl.delete(it.id); }}>
      <div className="main">
        <div><input type="checkbox" defaultChecked={INITIAL[it.id].on} data-act="on" aria-label={`${it.n} 포함`}
          ref={el => { if (el) refs.rowOn.set(it.id, el); else refs.rowOn.delete(it.id); }}
          onClick={e => onAct(it, 'on', e)} /></div>
        <div className="m-t"><div className="nm">{it.n}</div></div>
        <div className="pick m-p">
          <div className="ptx"><div className="pt" data-f="pt">{o.t}</div><div className="ps" data-f="ps">{o.s}</div></div>
          {it.o.length > 1 ? <button className="alt" data-act="open" onClick={e => onAct(it, 'open', e)}>{`다른 제품 ${it.o.length - 1}개`}</button> : null}
        </div>
        <div className="u n m-u" data-f="u">{F(o.p)}</div>
        <div className="m-q"><span className="qty"><button data-act="m" aria-label="수량 감소" onClick={e => onAct(it, 'm', e)}>−</button>
          <input className="n" defaultValue={String(INITIAL[it.id].qty)} data-act="q" inputMode="numeric" aria-label={`${it.n} 수량`}
            ref={el => { if (el) refs.rowQty.set(it.id, el); else refs.rowQty.delete(it.id); }}
            onInput={e => { it.qty = int0(e.currentTarget.value.replace(/[^0-9]/g, '')); render(); }} />
          <button data-act="p" aria-label="수량 증가" onClick={e => onAct(it, 'p', e)}>+</button></span></div>
        <div className="amt n m-a" data-f="a">{it.on ? F(amt) : '—'}</div>
      </div>
    </div>
  );
}

/* ── 공통에서 내려온 줄(여기서는 못 바꾸는 줄) */
function FixRowView({ it, bi, onMove, onJump }: FixRowProps): ReactNode {
  const o = it.o[it.sel], key = `${it.id}:${bi}`;
  return (
    <div className={'row fix' + (it.on ? '' : ' out')} data-fx={it.id}>
      <div className="main">
        <div className="fmark" data-f="mk">◆</div>
        <div className="m-t"><div className="nm">{it.n}</div></div>
        <div className="pick m-p">
          <div className="ptx"><div className="pt" data-f="pt">{o.t}</div><div className="ps" data-f="ps">{o.s}</div></div>
          <button className="alt jump" data-act="jump" onClick={() => onJump(it.id)}>공통에서 바꾸기 ↗</button>
        </div>
        <div className="u n m-u" data-f="u">{F(o.p)}</div>
        <div className="m-q"><span className="fq">{`이 부스 몫 (${it.du || '개'})`}</span>
          <span className={'qty' + (it.on ? '' : ' dis')} data-f="qty"><button data-act="fm" aria-label="몫 줄이기" onClick={() => onMove(it, bi, -1)}>−</button>
            <input className="n" defaultValue={String((INITIAL[it.id].sh as Record<number, number>)[bi] || 0)} data-f="sh" readOnly aria-label={`${it.n} 이 부스 몫`}
              ref={el => { if (el) refs.fixSh.set(key, { el, it, bi }); else refs.fixSh.delete(key); }} />
            <button data-act="fp" aria-label="몫 늘리기" onClick={() => onMove(it, bi, 1)}>+</button></span></div>
        <div className="m-a"><span className={'tag ' + (it.on ? 'ok' : 'no')} data-f="tag">{it.on ? '공통 일괄 구매' : '공통에서 제외'}</span></div>
      </div>
    </div>
  );
}

/* ── 제품 고르기 목록. 고를 때마다 원래처럼 목록을 새로 그린다(key 가 바뀐다) — 라디오의 checked
   속성까지 원래와 같게 나온다. */
function OptList({ item, pick, onPick }: { item: Item; pick: number; onPick: (k: number) => void }): ReactNode {
  return <>{item.o.map((o, k) => (
    <label key={k} className={'opt' + (k === pick ? ' sel' : '')} data-k={k}
      onClick={e => { if ((e.target as HTMLElement).tagName === 'A') return; onPick(k); }}>
      <input type="radio" name="om" defaultChecked={k === pick} />
      <span className="ol"><b>{o.t}</b>{o.d ? <span className="badge">권장</span> : null}<br /><span className="os">{o.s}</span></span>
      <span className="op n">{F(o.p) + '원'}</span>
      <span>{o.u ? <a href={o.u} target="_blank" rel="noopener">상품 ↗</a> : null}</span>
    </label>
  ))}</>;
}

/* ── 제품 고르기 창 — 상태는 optBox. 바탕(#optMask)의 on 표시와 바탕 클릭은 React 밖의 요소라 직접 건다.
   받는 값이 없어 App 이 다시 그려질 때 따라 그릴 이유가 없다(memo). */
const OptDialog = memo(function OptDialog(): ReactNode {
  const opt = useSyncExternalStore(optBox.subscribe, optBox.get);
  useLayoutEffect(() => { byId('optMask').classList.toggle('on', opt.open); }, [opt.open]);
  useEffect(() => {
    const oMask = byId('optMask');
    oMask.onclick = e => { if (e.target === oMask) closeOpts(); };
  }, []);
  return createPortal(<div className="dlg dlg2" role="dialog" aria-modal="true">
    <button className="x" id="optX" aria-label="닫기" onClick={closeOpts}>✕</button>
    <h3 id="optT">{opt.item ? opt.item.n + ' · 제품 고르기' : ''}</h3>
    <p id="optN" className="cap" hidden={opt.item ? !opt.item.note : false}>{opt.item ? opt.item.note || '' : ''}</p>
    <div className="optbox" id="optBody">{opt.item ? <OptList key={opt.gen} item={opt.item} pick={opt.pick}
      onPick={k => flushSync(() => optBox.set(o => ({ ...o, pick: k, gen: o.gen + 1 })))} /> : null}</div>
    <div className="row2"><button className="pb" id="optCancel" onClick={closeOpts}>취소하기</button>
      <button className="pb on" id="optSave" onClick={() => { if (opt.open && opt.item) { opt.item.sel = opt.pick; syncChecks(); render(); } closeOpts(); }}>저장하기</button></div>
  </div>, byId('optMask'));
});

/* ── 안내창 — 상태는 dlgBox. 「공통에서 수량 늘리기」는 App 의 jumpTo 를 쓴다(App 이 다시 그려질 때 이 창까지
   다시 그리지 않도록 memo — jumpTo 는 늘 같은 상태 setter 만 부르므로 처음 받은 것을 써도 동작이 같다). */
const MessageDialog = memo(function MessageDialog({ jumpTo }: { jumpTo: (id: number) => void }): ReactNode {
  const dlg = useSyncExternalStore(dlgBox.subscribe, dlgBox.get);
  useLayoutEffect(() => { byId('mask').classList.toggle('on', dlg.open); }, [dlg.open]);
  useEffect(() => {
    const mask = byId('mask');
    mask.onclick = e => { if (e.target === mask) closeDlg(); };
  }, []);
  return createPortal(<div className="dlg" role="alertdialog" aria-modal="true">
    <h3 id="dlgT">{dlg.t}</h3><div id="dlgB">{dlg.seen ? String(dlg.b).split('\n\n').map((para, i) => <p key={i}>{para.trim()}</p>) : null}</div>
    <div id="dlgRefs" className="dlgRefs" hidden={!(dlg.basis && dlg.basis.length)}>{dlg.basis && dlg.basis.length ? <>
      <div className="rlab">근거</div>
      {dlg.basis.map((r, i) => <a key={i} href={r.url} target="_blank" rel="noopener">{r.ref}{r.note ? <small>{r.note}</small> : null}</a>)}
    </> : null}</div>
    <div className="row2"><button className="pb" id="dlgGo" hidden={dlg.seen && dlg.id == null} onClick={() => {
      closeDlg(); if (dlg.id == null) return;
      jumpTo(dlg.id);
    }}>공통에서 수량 늘리기</button>
      <button className="pb on" id="dlgX" onClick={closeDlg}>알겠어요</button></div>
  </div>, byId('mask'));
}, () => true);
