/* 2026-09-09 라이브에서 손으로 눌러 통과시킨 상황과, 그 뒤에 고친 결함들을 여기 고정한다.
 *
 * 모든 검사는 **화면으로만** 한다 — 입력칸에 치고 단추를 눌러 상태를 만들고, 화면에 찍힌
 * 글자·클래스를 읽는다(tests/helpers.js 머리말 참고). 그래서 이 파일 하나가 React 전환 전
 * 원본과 전환 후 산출물 양쪽에서 똑같이 돌아야 한다(2026-09-25 전환 intent의 증명 방법).
 * 2026-09-25 전에는 앱 내부 변수(M·D)를 직접 읽고 썼다 — 단언은 그대로 두고 읽는 자리만
 * 화면으로 옮겼다. 몇 개는 오히려 강해졌다(함수 반환값 대신 실제로 그려진 결과를 본다).
 *
 * §21-1(빈 게이트 금지): 모든 검사는 대상이 실제로 있는지부터 확인하고 판정한다.
 */
import { describe, it, expect } from 'vitest';
import {
  HTML, loadApp, tick, $, type, commit, click, text, won, sumRow, meetOnly, sharedUrl, encodeState, importRows,
} from './helpers.js';

const F = n => n.toLocaleString('ko-KR');

describe('시나리오 1 — 남는 예산: 부호(+)와 색(ok)', () => {
  it('기본 화면(권장 구성)은 예산이 남고, 화면에 +부호·ok색으로 뜬다', async () => {
    const win = await loadApp();
    const goods = won(sumRow(win, '물품').text), meet = won(sumRow(win, '협의회비').text);
    const tot = goods + meet;
    expect(goods).toBeGreaterThan(0);
    expect(text(win, '#tot')).toBe(F(tot) + '원');
    expect(tot).toBeLessThan(1500000); // 이 검사가 의미 있으려면 실제로 남아야 한다
    const rest = 1500000 - tot;
    expect(sumRow(win, '남는 예산').html).toBe(`<span class="v ok">+${F(rest)}원</span>`);
    expect(sumRow(win, '예산 초과')).toBeNull();
  });
});

describe('시나리오 2 — 예산 초과: 부호(−)와 색(no)', () => {
  it('물품 수량을 크게 늘려 예산을 넘기면 화면에 −부호·no색으로 뜬다', async () => {
    const win = await loadApp();
    await type(win, '#body .row[data-i="0"] [data-act="q"]', 1000); // 포켓 Wi-Fi 수량을 크게
    const goods = won(sumRow(win, '물품').text), meet = won(sumRow(win, '협의회비').text);
    const tot = goods + meet;
    expect(tot).toBeGreaterThan(1500000); // 실제로 넘겨야 의미 있는 검사다
    expect(sumRow(win, '예산 초과').html).toBe(`<span class="v no">−${F(tot - 1500000)}원</span>`);
    expect(sumRow(win, '남는 예산')).toBeNull();
  });
});

describe('시나리오 3 — 경계값: 예산과 정확히 같을 때(0원)', () => {
  it('합계가 예산과 정확히 같으면 부호 없이 0원, ok색, 초과 문구 없음', async () => {
    const win = await loadApp();
    // 물품을 전부 끄고 협의회비만으로 예산을 정확히 맞춘다: 1명×1회×1,500,000원 = 1,500,000원.
    await meetOnly(win, { n: 1, c: 1, per: 1500000 });
    expect(sumRow(win, '물품').text).toBe('0원');
    expect(sumRow(win, '남는 예산').html).toBe('<span class="v ok">0원</span>');
    expect(sumRow(win, '예산 초과')).toBeNull();
    expect(text(win, '#mLeft')).toBe('0원');
    expect($(win, '#mLeft').style.color).toBe('var(--good)');
  });
});

describe('시나리오 4 — 집행률 색 경계값(화면 표시값 기준)', () => {
  // 물품을 끄고 1명×1회로 두면 합계 = 지급액이라, 합계를 원하는 원 단위로 정확히 만들 수 있다.
  const rateAt = async (win, tot) => {
    await type(win, '#mPer', tot);
    expect(won(text(win, '#tot'))).toBe(tot); // 합계를 정말 그 값으로 만들었는지 먼저 확인
    return sumRow(win, '집행률');
  };
  it('정확히 100%는 초록, 100.05%(화면 100.0%)도 초록, 100.1%는 빨강, 89.94%는 주황, 89.95%(화면 90.0%)는 초록', async () => {
    const win = await loadApp();
    await meetOnly(win, { n: 1, c: 1, per: 1 });
    const cases = [
      [1500000, 'r-good', '100.0%'], [1500750, 'r-good', '100.0%'], [1501500, 'r-over', '100.1%'],
      [1349100, 'r-warn', '89.9%'], [1349250, 'r-good', '90.0%'],
    ];
    for (const [tot, cls, shown] of cases) {
      const r = await rateAt(win, tot);
      expect(r.className).toBe(`v rate ${cls}`);
      expect(r.text).toBe(shown);
    }
  });

  it('정확히 예산과 같을 때 집행률 100.0%는 초록', async () => {
    const win = await loadApp();
    await meetOnly(win, { n: 1, c: 1, per: 1500000 });
    expect(sumRow(win, '집행률').html).toBe('<span class="v rate r-good">100.0%</span>');
  });
});

describe('시나리오 5 — 게이지 막대 색이 집행률 색과 같다', () => {
  it('네 구간(over/good/warn/low) 모두에서 #gauge 클래스가 집행률 색과 일치한다', async () => {
    const win = await loadApp();
    const cases = [
      { per: 1600000, want: 'r-over' }, // 넘침
      { per: 1450000, want: 'r-good' }, // 96.7%
      { per: 1050000, want: 'r-warn' }, // 70%
      { per: 600000, want: 'r-low' },   // 40%
    ];
    let checked = 0;
    await meetOnly(win, { n: 1, c: 1, per: 1 });
    for (const c of cases) {
      await type(win, '#mPer', c.per);
      expect(won(text(win, '#tot'))).toBe(c.per);
      expect($(win, '#gauge').className).toBe('gauge ' + c.want);
      expect(sumRow(win, '집행률').className).toBe('v rate ' + c.want);
      checked++;
    }
    expect(checked).toBe(4); // §21-1 — 대상 0건이면 이 줄에서 먼저 걸린다
  });
});

describe('시나리오 6 — 구분 번호 ⓪①②③④⑤가 끊기지 않고 이어진다', () => {
  it('탭·구분 머리글에 번호가 순서대로 붙고, 번호가 이미 있는 부스 이름에는 겹치지 않는다', async () => {
    const win = await loadApp();
    const tabs = [...win.document.querySelectorAll('#tabs .tab .tno')].map(e => e.textContent);
    expect(tabs).toEqual(['⓪', '①', '②', '③', '④', '⑤']);
    const heads = [...win.document.querySelectorAll('#body .sec > .grp:first-child .gh b')].map(e => e.textContent);
    expect(heads).toHaveLength(6);
    expect(heads[0]).toBe('⓪ 공통');
    expect(heads[5]).toBe('⑤ 협의회비');
    // 부스 이름엔 이미 번호가 있다 — 다시 붙어 "① ① Poster Studio"가 되면 안 된다.
    expect(heads[1]).toBe('① Poster Studio');
    heads.forEach(h => expect(h).not.toMatch(/^.\s.\s/u));
  });
});

describe('시나리오 7 — 자동 계산이 어긋난 값을 바로잡고, 그 결과가 주소로 그대로 왕복된다', () => {
  it('말이 안 되는 인원·지급액을 「자동 계산」이 목표선 이상 · 상한 이내로 고쳐 준다', async () => {
    const win = await loadApp();
    // 인원을 100명으로 터무니없이 늘려 두면, 지금 조합(n=100,c=1)의 인당은 남는 돈을
    // 그대로 나눠 10,000원(목표선) 아래로 떨어진다 — "지금 조합을 가장 먼저 본다"는
    // 규칙 때문에 목표선 필터가 없으면 이 값이 그대로 최종값이 된다.
    await type(win, '#mN', 100);
    await type(win, '#mC', 1);
    await click(win, '#mMan');
    await type(win, '#mPer', 100);
    expect(text(win, '#mPerOut')).toBe('100원');
    // 비워 둔 지급액 칸의 안내(placeholder)가 "지금 조합으로 자동 계산하면 나올 값"이다.
    const naive = won($(win, '#mPer').placeholder);
    expect(naive).toBeLessThan(10000); // 이 검사가 실제로 목표선 아래를 건드리는지 먼저 확인
    await click(win, '#mAuto');
    const after = won(text(win, '#mPerOut'));
    expect(after).toBeGreaterThanOrEqual(10000); // 목표선
    expect(after).toBeLessThanOrEqual(40000);    // 인당 상한
    // 자동 계산은 누른 그 순간만 맞추고, 다시 뒤에서 따라오지 않는다 — 물품을 바꿔도 그대로다.
    await type(win, '#body .row[data-i="0"] [data-act="q"]', 9);
    expect(won(text(win, '#mPerOut'))).toBe(after);
  });

  it('공유하기가 보내는 주소(#q=)가 지금 화면 상태를 그대로 복원한다', async () => {
    const win = await loadApp();
    await click(win, '#body .row[data-i="2"] [data-act="on"]');        // 배너: 꺼져 있던 것을 켰다가
    await click(win, '#body .row[data-i="2"] [data-act="on"]');        // 다시 끈다
    await type(win, '#body .row[data-i="2"] [data-act="q"]', 7);
    await type(win, '#mN', 9);
    await type(win, '#mC', 3);
    await click(win, '#mMan');
    await type(win, '#mPer', 22500);
    const url = await sharedUrl(win);
    const q = url.split('#')[1];
    expect(q).toMatch(/^q=.+/);

    const win2 = await loadApp(q);
    expect($(win2, '#body .row[data-i="2"] [data-act="on"]').checked).toBe(false);
    expect($(win2, '#body .row[data-i="2"] [data-act="q"]').value).toBe('7');
    expect($(win2, '#mN').value).toBe('9');
    expect($(win2, '#mC').value).toBe('3');
    expect(text(win2, '#mPerOut')).toBe('22,500원');
    // 직접 입력으로 보냈으니 직접 입력으로 열린다(자동이면 지급액 칸이 숨는다)
    expect($(win2, '#mPer').hidden).toBe(false);
    expect($(win2, '#mMan').hidden).toBe(true);
    // 화면 숫자(#tot)까지 원본과 같아야 "그대로 열기"라고 부를 수 있다.
    expect(text(win2, '#tot')).toBe(text(win, '#tot'));
  });
});

describe('시나리오 8 — 조작된 #q= 주소가 화면 계산을 깨지 않는다', () => {
  /* stateStr() 이라면 절대 만들지 않을 값(문자열·음수·소수·범위 밖 인덱스·엉뚱한 절사 단위)을
   * 직접 실어 보내, 사람이 칸에 직접 칠 때와 같은 규칙으로 걸러내는지 본다 — 걸러내지 못하면
   * 화면이 "NaN원"으로 깨지거나 render() 가 그 자리에서 죽는다(2026-09-10 실제 재현). */
  it('문자열·음수·소수 수량과 범위 밖 선택은 0/최솟값으로, 절사 단위는 500·1000만 허용한다', async () => {
    const plain = await loadApp();
    const firstOpt = i => text(plain, `#body .row[data-i="${i}"] [data-f="pt"]`);
    const q = encodeState({
      v: 1,
      a: [
        ['abc', 'xx', 1],   // 문자열 sel·qty
        [-5, -100, 0],      // 음수 sel·qty
        [2, 3.7, 1],        // 소수 qty
      ],
      m: ['nope', null, 999999, 12345, 1, 'notanumber'],
    });
    const win = await loadApp('q=' + q);
    const row = i => `#body .row[data-i="${i}"]`;

    expect($(win, row(0) + ' [data-act="on"]').checked).toBe(true);
    expect($(win, row(0) + ' [data-act="q"]').value).toBe('0');
    expect(text(win, row(0) + ' [data-f="pt"]')).toBe(firstOpt(0));   // sel "abc" → 0번 상품

    expect($(win, row(1) + ' [data-act="on"]').checked).toBe(false);
    expect($(win, row(1) + ' [data-act="q"]').value).toBe('0');
    expect(text(win, row(1) + ' [data-f="pt"]')).toBe(firstOpt(1));   // sel -5 → 0번 상품

    expect(text(win, row(2) + ' [data-f="pt"]')).not.toBe('');          // 범위 안의 상품 하나
    expect($(win, row(2) + ' [data-act="q"]').value).toBe('3');       // 3.7 → 3

    expect($(win, '#mN').value).toBe('0');        // "nope" → 0
    expect($(win, '#mC').value).toBe('0');        // null → 0
    expect($(win, '#mCap').value).toBe('40,000'); // 999999 → 상한 40,000원으로
    expect(text(win, '#mPerOut')).toBe('0원');    // "notanumber" → 0
    // 자동 계산으로 들어왔다(m[4]=1) — 지급액 칸이 숨고 「직접 입력」 단추가 보인다
    expect($(win, '#mPer').hidden).toBe(true);
    expect($(win, '#mMan').hidden).toBe(false);

    // 화면이 실제로 깨지지 않았는지 — 숫자가 NaN 없이 정상적으로 찍혀야 한다.
    expect(text(win, '#tot')).not.toContain('NaN');
    expect(text(win, '#tot')).toMatch(/^[0-9,]+원$/);
    expect($(win, '#sum').innerHTML).not.toContain('NaN');

    // 절사 단위 12345 → 기본값 1,000원. 인원·횟수를 넣으면 안내문이 그 단위를 말한다
    // (인당이 상한에 걸리지 않게 20명 × 2회로 나눈다 — 걸리면 안내문이 상한 쪽 문장이 된다).
    await type(win, '#mN', 20);
    await type(win, '#mC', 2);
    expect(text(win, '#mNote')).not.toContain('인당 상한');
    expect(text(win, '#mNote')).toContain('1,000원 단위로 절사');
    // 자동 계산 상태라 지급액이 인원·횟수를 따라 다시 계산된다
    expect(won(text(win, '#mPerOut'))).toBeGreaterThan(0);
  });
});

describe('시나리오 9 — 인당 지원금액(#mCap)과 지급액(#mPer)의 자릿점 표기가 같다', () => {
  it('첫 화면부터 #mCap·#mPer 모두 콤마 자릿점으로 보인다', async () => {
    const win = await loadApp();
    expect($(win, '#mCap').value).toBe('40,000');
    expect($(win, '#mPer').value).toMatch(/^[0-9]{1,3}(,[0-9]{3})*$/);
  });

  it('그 칸에 지금 포커스가 있으면(입력 중) 값을 다시 그려 덮어쓰지 않는다', async () => {
    const win = await loadApp();
    $(win, '#mCap').focus();
    await type(win, '#mCap', '4500');               // 치는 중 — 화면이 다시 그려진다
    expect(win.document.activeElement).toBe($(win, '#mCap'));
    expect($(win, '#mCap').value).toBe('4500');     // "4,500"으로 튀지 않는다
  });
});

describe('시나리오 10 — 부스 이름의 AI 표기가 탭과 목록 헤더에서 같다', () => {
  it('①②의 구분 머리글과 탭 이름이 AI 유무까지 정확히 같다', async () => {
    const win = await loadApp();
    const tabs = [...win.document.querySelectorAll('#tabs .tab')];
    const heads = [...win.document.querySelectorAll('#body .sec > .grp:first-child .gh b')];
    for (const [i, mark] of [[1, '①'], [2, '②']]) {
      const nick = tabs[i].textContent.slice(mark.length);
      expect(heads[i].textContent).toBe(`${mark} ${nick}`);
      expect(heads[i].textContent).not.toContain('AI');
    }
  });
});

describe('시나리오 11 — 가져오기(엑셀)로 들어온 조작된 값도 걸러낸다', () => {
  it('음수 수량은 0으로, 협의회비 지급액은 상한 규칙(40,000원 이하·500원 단위)으로 정리된다', async () => {
    const win = await loadApp();
    await importRows(win, [
      ['공통', '포켓 Wi-Fi', '코리아와이파이 5G 10GB (U50)', '5G · 10GB/일', -7, 20900, -146300],
      ['협의회비', '협의회 참석 지원', '', '15명 × 2회', '', -999999, ''],
    ]);
    expect(text(win, '#pImp')).toBe('1개 반영됨');
    expect($(win, '#body .row[data-i="0"] [data-act="q"]').value).toBe('0');     // -7 → 0
    expect($(win, '#body .row[data-i="0"] [data-act="on"]').checked).toBe(true); // 그래도 항목은 반영된다
    expect(text(win, '#mPerOut')).toBe('0원');                                   // -999999 → 0
    expect($(win, '#mN').value).toBe('15');
    expect($(win, '#mC').value).toBe('2');
  });

  it('소수 수량은 내림 처리된다(3.7 → 3)', async () => {
    const win = await loadApp();
    await importRows(win, [
      ['공통', '포켓 Wi-Fi', '코리아와이파이 5G 10GB (U50)', '5G · 10GB/일', 3.7, 20900, 77330],
    ]);
    expect(text(win, '#pImp')).toBe('1개 반영됨');
    expect($(win, '#body .row[data-i="0"] [data-act="q"]').value).toBe('3');
  });
});

describe('시나리오 13 — 인당 금액은 칸을 벗어날 때 상한·500원 단위로 정리된다', () => {
  it('50,000원을 넣고 칸을 벗어나면 40,000원으로 맞추고 근거 두 개를 건 안내창을 띄운다', async () => {
    const win = await loadApp();
    await type(win, '#mCap', '50000');
    await commit(win, '#mCap');
    expect($(win, '#mCap').value).toBe('40,000');
    expect($(win, '#mask').classList.contains('on')).toBe(true);
    expect(text(win, '#dlgT')).toBe('인당 지원금액을 초과하였습니다 !');
    expect(win.document.querySelectorAll('#dlgRefs a')).toHaveLength(2);
    await tick();
  });
});

describe('시나리오 12 — 아티팩트 흔적이 없다(2026-09-25 대표 결정으로 제거)', () => {
  /* 대표님: "아티팩트 빼 버려. 웹사이트만 남겨 놓자." 열리는 경로는 호스팅·내려받은 파일·
   * 카톡 미리보기 셋뿐이다. 아티팩트로 보내는 단추나 아티팩트에서만 돌던 분기가 다시 들어오면
   * 여기서 막는다 — 아티팩트 페이지 자체가 지워지므로, 남은 단추는 빈 페이지로 간다. */
  it('카톡 카드(#nojs) 단추는 Safari·Chrome 둘뿐이고, 둘 다 호스팅 주소로 간다', async () => {
    const win = await loadApp();
    const links = [...win.document.querySelectorAll('#nojs .btns a')];
    expect(links.map(a => a.getAttribute('aria-label'))).toEqual(['Safari에서 열기', 'Chrome에서 열기']);
    expect(links.map(a => a.getAttribute('href'))).toEqual([
      'x-safari-https://calc.edutogether.kr/',
      'googlechromes://calc.edutogether.kr/',
    ]);
  });

  it('문서 어디에도 claude.ai 주소·아티팩트 전용 요소가 없다', async () => {
    const win = await loadApp();
    const html = win.document.documentElement.outerHTML;
    expect(html.length).toBeGreaterThan(10000); // 문서를 제대로 읽었는지부터
    expect(html).not.toMatch(/claude\.ai|artifact|아티팩트|claude\.use/i);
    for (const id of ['dlgL', 'dlgCopy', 'dlgOpen']) expect(win.document.getElementById(id)).toBeNull();
  });
});

describe('시나리오 13 — JS 가 도는 화면에서 카톡 카드(#nojs)가 한 장면도 안 보인다', () => {
  /* 2026-09-26 대표님이 녹화로 찾음: 느린 폰에서 React 판이 첫 화면 직후 약 0.1초 카드를 보였다.
   * 카드 바로 뒤 스크립트만 믿으면 카드를 읽고 그 스크립트에 닿기 전 화면이 그려질 때 카드가 보인다.
   * 그래서 js 표시를 <head> 에서 달고 CSS 가 카드를 처음부터 숨긴다. 실제 장면 검사는
   * scripts/verify/nojs-flash.mjs(느린 폰·매 장면 기록), 여기서는 그 장치가 빠지지 않았는지만 본다. */
  it('js 표시는 카드보다 앞(<head>)에서 달리고, html.js 면 카드를 숨기는 규칙이 있다', () => {
    const head = HTML.slice(0, HTML.indexOf('</head>'));
    expect(head).toMatch(/<script>document\.documentElement\.classList\.add\('js'\)<\/script>/);
    expect(HTML).toMatch(/html\.js \.nojs\{display:none !important\}/);
  });
});

describe('시나리오 14 — 자릿수가 아주 긴 숫자가 합계를 ∞·NaN 으로 만들지 않는다 (보안 지적 대응)', () => {
  const HUGE = '1' + '0'.repeat(400);   // parseInt 가 Infinity 를 돌려주는 길이

  it('#q= 의 수량·인원·횟수가 천문학적이어도 합계가 숫자로 찍힌다', async () => {
    const q = encodeState({ v: 1, a: [[0, HUGE, 1], [1, HUGE, 1]], m: [HUGE, HUGE, 40000, 1000, 0, 40000] });
    const win = await loadApp('q=' + q);
    expect(text(win, '#tot')).toMatch(/^[0-9,]+원$/);
    expect($(win, '#sum').innerHTML).not.toMatch(/NaN|∞|Infinity/);
  });

  it('가져오기(엑셀)의 수량·인원·횟수가 천문학적이어도 합계가 숫자로 찍힌다', async () => {
    const win = await loadApp();
    await importRows(win, [
      ['공통', '포켓 Wi-Fi', '코리아와이파이 5G 10GB (U50)', '5G · 10GB/일', 1e308, 20900, 0],
      ['협의회비', '협의회 참석 지원', '', `${HUGE}명 × ${HUGE}회`, '', 20000, ''],
    ]);
    expect(text(win, '#pImp')).toBe('1개 반영됨');
    expect(text(win, '#tot')).toMatch(/^[0-9,]+원$/);
    expect($(win, '#sum').innerHTML).not.toMatch(/NaN|∞|Infinity/);
  });
});

describe('시나리오 15 — 정상 길이를 한참 넘는 #q= 는 읽지 않는다 (보안 지적 대응)', () => {
  it('짧은 주소는 반영되고, 같은 값이 든 아주 긴 주소는 무시된다', async () => {
    const plain = await loadApp();
    const base = text(plain, '#tot');

    const short = await loadApp('q=' + encodeState({ v: 1, a: [[0, 7, 1]] }));
    expect(text(short, '#tot')).not.toBe(base);                       // 반영됐다

    const filler = Array(2000).fill([0, 0, 0]);
    const long = encodeState({ v: 1, a: [[0, 7, 1], ...filler] });
    expect(long.length).toBeGreaterThan(4096);
    const win = await loadApp('q=' + long);
    expect(text(win, '#tot')).toBe(base);                             // 읽지 않았다 — 기본 화면 그대로
  });
});

describe('시나리오 16 — 너무 큰 파일은 가져오기가 읽지 않는다 (보안 지적 대응)', () => {
  it('10MB 를 넘는 파일은 엑셀 해석을 시작하지 않고 안내창을 띄운다', async () => {
    const win = await loadApp();
    let read = 0;
    win.XLSX = { read: () => { read++; return { SheetNames: ['S'], Sheets: { S: {} } }; }, utils: { sheet_to_json: () => [] } };
    const input = $(win, '#fImp');
    const file = { name: 'big.xlsx', size: 11 * 1024 * 1024, arrayBuffer: async () => new ArrayBuffer(0) };
    Object.defineProperty(input, 'files', { configurable: true, value: [file] });
    input.dispatchEvent(new win.Event('change', { bubbles: true }));
    await tick();
    expect(read).toBe(0);
    expect(text(win, '#dlgT')).toBe('파일이 너무 커요');
    expect($(win, '#mask').classList.contains('on')).toBe(true);
  });
});

describe('시나리오 17 — 칸에 직접 친 아주 긴 숫자도 합계를 ∞·NaN 으로 만들지 않는다 (보안 지적 대응)', () => {
  it('수량·인원·횟수·지급액 칸에 400자리 숫자를 쳐도 합계가 숫자로 찍힌다', async () => {
    const HUGE = '9'.repeat(400);
    const win = await loadApp();
    await type(win, '#body .row[data-i="0"] [data-act="q"]', HUGE);
    await type(win, '#mN', HUGE);
    await type(win, '#mC', HUGE);
    await click(win, '#mMan');
    await type(win, '#mPer', HUGE);
    expect(text(win, '#tot')).toMatch(/^[0-9,]+원$/);
    expect($(win, '#sum').innerHTML).not.toMatch(/NaN|∞|Infinity/);
  });

  it('보통 값은 그대로다 — 수량 12 를 치면 12 로 계산된다', async () => {
    const win = await loadApp();
    await type(win, '#body .row[data-i="0"] [data-act="q"]', '12');
    expect($(win, '#body .row[data-i="0"] [data-act="q"]').value).toBe('12');
  });
});
