/* 2026-09-09 라이브에서 손으로 눌러 통과시킨 7가지 상황을 여기 고정한다.
 *
 * 그날 실제로 있었던 결함(app.md 사고 기록)과, 팀장이 이번에 반드시 넣으라고 지시한 항목
 * (부호 양쪽·0원 경계값·견적서 출력까지·자동 계산 보정)을 겹쳐서 7개로 추렸다 — 어제 대화
 * 기록에 시나리오 번호가 못박혀 있지 않아 지금 화면 기준으로 다시 정의했다(팀장 지시 원문:
 * "없으면 없는 대로 지금 화면에서 다시 정의해서 적어두세요").
 *
 * scripts/check-signs.js·check-recommended.js 는 소스 코드를 정규식으로 떼어 내 재구현을
 * 검사하지만, 여기서는 index.html 을 jsdom 에 그대로 실행시켜 render() 가 실제로 그리는
 * DOM(#sum·#gauge·#mLeft)까지 함께 본다 — "표시되는 숫자"를 검사 대상으로 삼는다.
 *
 * §21-1(빈 게이트 금지): 아래 모든 검사는 값이 최소 1개 이상 나온 것을 먼저 확인하고 판정한다
 * (`expect(...).not.toHaveLength(0)` 또는 개수 자체를 단언). 대상을 못 찾으면 실패해야 한다.
 */
import { describe, it, expect } from 'vitest';
import { loadApp, ev, renderWithMeetOnly, encodeState } from './helpers.js';

describe('시나리오 1 — 남는 예산: 부호(+)와 색(ok)', () => {
  it('기본 화면(권장 구성)은 예산이 남고, 화면에 +부호·ok색으로 뜬다', () => {
    const win = loadApp();
    const goods = ev(win, "D.reduce((t,it)=>t+(it.on?it.o[it.sel].p*it.qty:0),0)");
    const meet = ev(win, "Math.max(0,M.per)*Math.max(0,M.n)*Math.max(0,M.c)");
    const tot = goods + meet;
    expect(tot).toBeLessThan(1500000); // 이 검사가 의미 있으려면 실제로 남아야 한다
    const rest = 1500000 - tot;
    const sum = win.document.getElementById('sum');
    expect(sum.innerHTML).toContain('남는 예산');
    expect(sum.innerHTML).toContain(`<span class="v ok">+${rest.toLocaleString('ko-KR')}원</span>`);
    expect(sum.innerHTML).not.toContain('예산 초과');
  });
});

describe('시나리오 2 — 예산 초과: 부호(−)와 색(no)', () => {
  it('물품 수량을 크게 늘려 예산을 넘기면 화면에 −부호·no색으로 뜬다', () => {
    const win = loadApp();
    // 포켓 Wi-Fi(D[0]) 수량을 크게 올려 확실히 예산을 넘긴다.
    ev(win, "D[0].qty=1000; render();");
    const goods = ev(win, "D.reduce((t,it)=>t+(it.on?it.o[it.sel].p*it.qty:0),0)");
    const meet = ev(win, "Math.max(0,M.per)*Math.max(0,M.n)*Math.max(0,M.c)");
    const tot = goods + meet;
    expect(tot).toBeGreaterThan(1500000); // 실제로 넘겨야 의미 있는 검사다
    const over = tot - 1500000;
    const sum = win.document.getElementById('sum');
    expect(sum.innerHTML).toContain('예산 초과');
    expect(sum.innerHTML).toContain(`<span class="v no">−${over.toLocaleString('ko-KR')}원</span>`);
    expect(sum.innerHTML).not.toContain('남는 예산');
  });
});

describe('시나리오 3 — 경계값: 예산과 정확히 같을 때(0원)', () => {
  it('합계가 예산과 정확히 같으면 부호 없이 0원, ok색, 초과 문구 없음', () => {
    const win = loadApp();
    // 물품을 전부 끄고 협의회비만으로 예산을 정확히 맞춘다: 1명×1회×1,500,000원 = 1,500,000원.
    renderWithMeetOnly(win, { n: 1, c: 1, per: 1500000 });
    const sum = win.document.getElementById('sum');
    expect(sum.innerHTML).toContain('<span class="v ok">0원</span>');
    expect(sum.innerHTML).not.toContain('예산 초과');
    const mLeft = win.document.getElementById('mLeft');
    expect(mLeft.textContent).toBe('0원');
    expect(mLeft.style.color).toBe('var(--good)');
  });
});

describe('시나리오 4 — 집행률 색 경계값(화면 표시값 기준)', () => {
  it('정확히 100%는 초록, 100.1%는 빨강, 89.95~90%는 초록으로 이어진다', () => {
    const win = loadApp();
    const rateClass = expr => ev(win, `rateClass(${expr})`);
    expect(rateClass(100)).toBe(' r-good');
    expect(rateClass(100.05)).toBe(' r-good'); // 화면엔 100.0%로 보인다 — 아직 빨강이면 안 됨
    expect(rateClass(100.1)).toBe(' r-over');
    expect(rateClass(89.94)).toBe(' r-warn');  // 화면엔 89.9%
    expect(rateClass(89.95)).toBe(' r-good');  // 화면엔 90.0%로 반올림 — 여기부터 초록
  });

  it('실제 render() 결과도 같은 경계를 따른다 — 정확히 예산과 같을 때 집행률 100.0%는 초록', () => {
    const win = loadApp();
    renderWithMeetOnly(win, { n: 1, c: 1, per: 1500000 });
    const sum = win.document.getElementById('sum');
    expect(sum.innerHTML).toContain('<span class="v rate r-good">100.0%</span>');
  });
});

describe('시나리오 5 — 게이지 막대 색이 집행률 색과 같다', () => {
  it('네 구간(over/good/warn/low) 모두에서 #gauge 클래스가 rateClass()와 일치한다', () => {
    const win = loadApp();
    const cases = [
      { n: 1, c: 1, per: 1600000, want: ' r-over' }, // 넘침 (perFit 우회 위해 M.per 직접 지정)
      { n: 1, c: 1, per: 1450000, want: ' r-good' }, // 96.7%
      { n: 1, c: 1, per: 1050000, want: ' r-warn' }, // 70%
      { n: 1, c: 1, per: 600000, want: ' r-low' },   // 40%
    ];
    let checked = 0;
    for (const c of cases) {
      renderWithMeetOnly(win, c);
      const gauge = win.document.getElementById('gauge');
      expect(gauge.className).toBe('gauge' + c.want);
      const sum = win.document.getElementById('sum');
      expect(sum.innerHTML).toContain(`rate${c.want}`);
      checked++;
    }
    expect(checked).toBe(4); // §21-1 — 대상 0건이면 이 줄에서 먼저 걸린다
  });
});

describe('시나리오 6 — 구분 번호 ⓪①②③④⑤가 끊기지 않고 이어진다', () => {
  it('SECS 순서 그대로 CIRC 번호가 매겨지고, 번호가 이미 있는 부스 이름은 겹치지 않는다', () => {
    const win = loadApp();
    const secs = ev(win, 'SECS');
    expect(secs.length).toBeGreaterThan(0); // 빈 목록이면 이 검사는 아무것도 안 본 것과 같다
    const nums = secs.map((_, i) => ev(win, `NO[SECS[${i}]]`));
    expect(nums.slice(0, 6)).toEqual(['⓪', '①', '②', '③', '④', '⑤']);
    // 부스 이름엔 이미 번호가 있다 — withNo()가 다시 붙여 "① ① AI Poster Studio"가 되면 안 된다.
    const boothName = ev(win, "D.find(it=>it.g.startsWith('①')).g");
    expect(ev(win, `withNo(${JSON.stringify(boothName)})`)).toBe(boothName);
  });
});

describe('시나리오 7 — 자동 계산이 어긋난 값을 바로잡고, 그 결과가 주소로 그대로 왕복된다', () => {
  it('말이 안 되는 인원·지급액을 「자동 계산」이 목표선 이상 · 상한 이내로 고쳐 준다', () => {
    const win = loadApp();
    // 인원을 100명으로 터무니없이 늘려 두면, 지금 조합(n=100,c=1)의 인당은 남는 돈을
    // 그대로 나눠 10,000원(목표선) 아래로 떨어진다 — "지금 조합을 가장 먼저 본다"는
    // 규칙 때문에 목표선 필터가 없으면 이 값이 그대로 최종값이 된다(남는 돈이 0이라
    // 다른 조합이 더 알뜰해 보이지 않기 때문). 그래서 이 시나리오는 목표선 필터가
    // 실제로 걸러내는지를 있는 그대로 검사한다.
    ev(win, "M.auto=false; M.n=100; M.c=1; M.per=100; render();");
    const before = ev(win, 'M.per');
    expect(before).toBe(100);
    const naive = ev(win, 'perFit(D.reduce((t,it)=>t+(it.on?it.o[it.sel].p*it.qty:0),0),100,1)');
    expect(naive).toBeLessThan(10000); // 이 검사가 실제로 목표선 아래를 건드리는지 먼저 확인
    const result = ev(win, 'autoFit()');
    expect(result.ok).toBe(true);
    const after = ev(win, 'M.per');
    expect(after).toBeGreaterThanOrEqual(10000); // PER_GOAL_LOW
    expect(after).toBeLessThanOrEqual(40000);    // PER_MAX / M.cap
    expect(ev(win, 'M.auto')).toBe(false); // 자동 계산은 누른 그 순간만 맞추고, 다시 뒤에서 안 따라온다
  });

  it('인쇄 안내창이 여는 "견적 그대로 열기" 주소(#q=)가 지금 화면 상태를 그대로 복원한다', () => {
    const win = loadApp();
    ev(win, "D[2].on=false; D[2].qty=D[2].qty+3; M.auto=false; M.n=9; M.c=3; M.per=22500; render();");
    const q = ev(win, 'stateStr()');
    expect(q.length).toBeGreaterThan(0);

    const win2 = loadApp('q=' + q);
    expect(ev(win2, 'D[2].on')).toBe(false);
    expect(ev(win2, 'D[2].qty')).toBe(ev(win, 'D[2].qty'));
    expect(ev(win2, 'M.n')).toBe(9);
    expect(ev(win2, 'M.c')).toBe(3);
    expect(ev(win2, 'M.per')).toBe(22500);
    expect(ev(win2, 'M.auto')).toBe(false);
    // 화면 숫자(#tot)까지 원본과 같아야 "그대로 열기"라고 부를 수 있다.
    expect(win2.document.getElementById('tot').textContent)
      .toBe(win.document.getElementById('tot').textContent);
  });
});

describe('시나리오 8 — 조작된 #q= 주소가 화면 계산을 깨지 않는다', () => {
  /* app.md "알려진 것 — 아직 고치지 않았다" 2번 항목(2026-09-09) — 2026-09-10에 처리.
   * stateStr() 이라면 절대 만들지 않을 값(문자열·음수·소수·범위 밖 인덱스·엉뚱한 절사 단위)을
   * 직접 실어 보내, applyState() 가 사람이 칸에 직접 칠 때와 같은 규칙(1073·1079행)으로
   * 걸러내는지 본다 — 걸러내지 못하면 화면이 "NaN원"으로 깨진다(서버가 없어 보안 문제는
   * 아니지만, 공유받은 링크를 손으로 고쳐 붙여넣기만 해도 화면 계산이 깨질 수 있었다). */
  it('문자열·음수·소수 수량과 범위 밖 선택은 0/최솟값으로, 절사 단위는 500·1000만 허용한다', () => {
    const q = encodeState({
      v: 1,
      a: [
        ['abc', 'xx', 1],   // 문자열 sel·qty
        [-5, -100, 0],      // 음수 sel·qty
        [2, 3.7, 1],        // 소수 qty
      ],
      m: ['nope', null, 999999, 12345, 1, 'notanumber'],
    });
    const win = loadApp('q=' + q);

    expect(ev(win, 'D[0].sel')).toBe(0);
    expect(ev(win, 'D[0].qty')).toBe(0);
    expect(ev(win, 'D[0].on')).toBe(true);

    expect(ev(win, 'D[1].sel')).toBe(0);
    expect(ev(win, 'D[1].qty')).toBe(0);
    expect(ev(win, 'D[1].on')).toBe(false);

    expect(ev(win, 'D[2].sel')).toBeGreaterThanOrEqual(0);
    expect(ev(win, 'D[2].sel')).toBeLessThanOrEqual(ev(win, 'D[2].o.length-1'));
    expect(ev(win, 'D[2].qty')).toBe(3); // 3.7 → parseInt로 3

    expect(ev(win, 'M.n')).toBe(0);           // "nope" → 0
    expect(ev(win, 'M.c')).toBe(0);           // null → 0
    expect(ev(win, 'M.cap')).toBe(40000);     // 999999 → 상한 40,000원으로
    expect(ev(win, 'M.unit')).toBe(1000);     // 12345 → 유효하지 않으니 기본값 1,000원
    expect(ev(win, 'M.auto')).toBe(true);
    expect(ev(win, 'M.per')).toBe(0);         // "notanumber" → 0

    // 화면이 실제로 깨지지 않았는지 — 숫자가 NaN 없이 정상적으로 찍혀야 한다.
    const tot = win.document.getElementById('tot').textContent;
    expect(tot).not.toContain('NaN');
    expect(tot).toMatch(/^[0-9,]+원$/);
    expect(win.document.getElementById('sum').innerHTML).not.toContain('NaN');
  });
});

describe('시나리오 9 — 인당 지원금액(#mCap)과 지급액(#mPer)의 자릿점 표기가 같다', () => {
  /* app.md "알려진 것" 항목 — 2026-09-10에 처리. #mPer 는 render() 가 매번 F() 로
   * 다시 그려 콤마가 붙었는데, #mCap 은 마크업 기본값("40000")을 그대로 두고 있어서
   * 사람이 그 칸을 한 번도 blur 하지 않은 첫 화면에서는 "40000"·"20,000"으로 자릿점
   * 표기가 서로 달랐다. */
  it('첫 화면부터 #mCap·#mPer 모두 콤마 자릿점으로 보인다', () => {
    const win = loadApp();
    expect(win.document.getElementById('mCap').value).toBe('40,000');
    expect(win.document.getElementById('mPer').value).toMatch(/^[0-9]{1,3}(,[0-9]{3})*$/);
  });

  it('그 칸에 지금 포커스가 있으면(입력 중) 값을 되읽어 덮어쓰지 않는다', () => {
    const win = loadApp();
    ev(win, "document.getElementById('mCap').focus()");
    ev(win, "render()");
    // 포커스 중엔 render() 가 손대지 않아야 사람이 치는 중간에 값이 안 튄다.
    expect(win.document.activeElement).toBe(win.document.getElementById('mCap'));
  });
});

describe('시나리오 10 — 부스 이름의 AI 표기가 탭과 목록 헤더에서 같다', () => {
  /* app.md "알려진 것" 항목 — 2026-09-10에 대표님 확인 후 처리(둘 다 AI 없이).
   * 탭·합계는 NICK(짧은 이름)을 쓰고, 부스 목록 헤더는 항목 데이터의 g(전체 이름)를
   * 그대로 쓴다 — 이 둘이 같은 글자여야 같은 부스를 다르게 부르는 일이 없다. */
  it('①②의 데이터 이름(g)과 탭 이름(NICK)이 AI 유무까지 정확히 같다', () => {
    const win = loadApp();
    for (const mark of ['①', '②']) {
      const groupName = ev(win, `D.find(it=>it.g.startsWith(${JSON.stringify(mark)})).g`);
      const nick = ev(win, `NICK[${JSON.stringify(mark)}]`);
      expect(groupName).toBe(`${mark} ${nick}`);
      expect(groupName).not.toContain('AI');
    }
  });
});

describe('시나리오 11 — 가져오기(엑셀)로 들어온 조작된 값도 걸러낸다', () => {
  /* 2026-09-10 종합감사에서 발견 — applyState() 는 어제 int0()·fixPer() 로 검증하도록
   * 고쳤는데(시나리오 8), 같은 문제(음수·소수 수량)가 "가져오기"(엑셀 업로드) 경로에는
   * 그대로 남아 있었다. 엑셀 셀도 사람이 손으로 고칠 수 있는 값이라 같은 규칙을 적용했다. */
  it('음수 수량은 0으로, 협의회비 지급액은 fixPer 규칙(상한 40,000원)으로 정리된다', async () => {
    const win = loadApp();
    const rows = [
      ['공통', '포켓 Wi-Fi', '코리아와이파이 5G 10GB (U50)', '5G · 10GB/일', -7, 20900, -146300],
      ['협의회비', '협의회 참석 지원', '', '15명 × 2회', '', -999999, ''],
    ];
    ev(win, `window.XLSX = { read: () => ({SheetNames:['S'],Sheets:{S:{}}}),
      utils: { sheet_to_json: () => (${JSON.stringify(rows)}) } }`);
    const fakeFile = { name: 'test.xlsx', arrayBuffer: async () => new ArrayBuffer(0) };
    await win.document.getElementById('fImp').onchange({ target: { files: [fakeFile] } });

    expect(ev(win, "D.find(it=>it.n==='포켓 Wi-Fi').qty")).toBe(0);   // -7 → 0
    expect(ev(win, "D.find(it=>it.n==='포켓 Wi-Fi').on")).toBe(true); // 그래도 항목은 반영된다
    expect(ev(win, 'M.per')).toBe(0);                                  // -999999 → fixPer → 0
    expect(ev(win, 'M.n')).toBe(15);
    expect(ev(win, 'M.c')).toBe(2);
  });

  it('소수 수량은 내림 처리된다(3.7 → 3)', async () => {
    const win = loadApp();
    const rows = [
      ['공통', '포켓 Wi-Fi', '코리아와이파이 5G 10GB (U50)', '5G · 10GB/일', 3.7, 20900, 77330],
    ];
    ev(win, `window.XLSX = { read: () => ({SheetNames:['S'],Sheets:{S:{}}}),
      utils: { sheet_to_json: () => (${JSON.stringify(rows)}) } }`);
    const fakeFile = { name: 'test.xlsx', arrayBuffer: async () => new ArrayBuffer(0) };
    await win.document.getElementById('fImp').onchange({ target: { files: [fakeFile] } });
    expect(ev(win, "D.find(it=>it.n==='포켓 Wi-Fi').qty")).toBe(3);
  });
});

describe('시나리오 12 — 아티팩트 흔적이 없다(2026-09-25 대표 결정으로 제거)', () => {
  /* 대표님: "아티팩트 빼 버려. 웹사이트만 남겨 놓자." 열리는 경로는 호스팅·내려받은 파일·
   * 카톡 미리보기 셋뿐이다. 아티팩트로 보내는 단추나 아티팩트에서만 돌던 분기가 다시 들어오면
   * 여기서 막는다 — 아티팩트 페이지 자체가 지워지므로, 남은 단추는 빈 페이지로 간다. */
  it('카톡 카드(#nojs) 단추는 Safari·Chrome 둘뿐이고, 둘 다 호스팅 주소로 간다', () => {
    const win = loadApp();
    const links = [...win.document.querySelectorAll('#nojs .btns a')];
    expect(links.map(a => a.getAttribute('aria-label'))).toEqual(['Safari에서 열기', 'Chrome에서 열기']);
    expect(links.map(a => a.getAttribute('href'))).toEqual([
      'x-safari-https://calc.edutogether.kr/',
      'googlechromes://calc.edutogether.kr/',
    ]);
  });

  it('문서 어디에도 claude.ai 주소·아티팩트 전용 요소가 없다', () => {
    const win = loadApp();
    const html = win.document.documentElement.outerHTML;
    expect(html.length).toBeGreaterThan(10000); // 문서를 제대로 읽었는지부터
    expect(html).not.toMatch(/claude\.ai|artifact|아티팩트|claude\.use/i);
    for (const id of ['dlgL', 'dlgCopy', 'dlgOpen']) expect(win.document.getElementById(id)).toBeNull();
  });
});
