#!/usr/bin/env node
/* 돈의 부호가 뒤집히지 않았는지 배포 전에 검사한다.
 *
 * 2026-09-09에 '남는 예산'이 **돈이 남는데도 마이너스**로 나왔다. 계산은 맞았고
 * (남는 예산 = 배정 예산 − 견적 합계) **표시할 때 `-`를 하드코딩**해 둔 것이 원인이었다.
 * 한 번만 눈으로 봤으면 보였을 값이라, 다시는 그렇게 나가지 않도록 여기서 막는다.
 *
 * 앱이 실제로 쓰는 signed()·rateClass()(src/money.ts)를 그대로 불러와 확인한다
 * (Node 24 는 .ts 를 그대로 실행한다). 화면 코드는 src/App.tsx, 색 규칙(CSS)은 index.html 에서 읽는다:
 *   남을 때 +, 딱 맞을 때 부호 없음, 넘칠 때 −.
 *
 * 실행: node scripts/check-signs.js
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const ROOT = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const html = read('index.html');   // CSS(색 규칙)
const view = read('src/App.tsx'); // 화면을 그리는 코드

(async () => {
  const { signed, rateClass } = await import('../src/money.ts');
  if (typeof signed !== 'function' || typeof rateClass !== 'function') {
    console.error('src/money.ts 에서 signed()·rateClass() 를 찾지 못했습니다 — 부호·색을 정하는 곳이 바뀌었습니다.');
    console.error('  돈 표기를 다른 방식으로 바꿨다면 이 검사도 그에 맞게 고치세요. 지우지는 마세요.');
    process.exit(1);
  }

  const cases = [
    ['남을 때는 +',        15988,  '+15,988원'],
    ['딱 맞으면 부호 없음',    0,  '0원'],
    ['넘치면 −',          -15988, '−15,988원'],
    ['큰 금액도 자릿점',  1500000, '+1,500,000원'],
  ];

  const problems = [];
  console.log('돈 부호 검사 — signed()');
  for (const [what, input, want] of cases) {
    const got = signed(input);
    console.log('  ' + String(input).padStart(9) + ' → ' + got.padEnd(14) + '  ' + what);
    if (got !== want) problems.push(what + ': ' + input + ' → "' + got + '" (기대 "' + want + '")');
  }

  /* 화면 쪽도 함께 본다 — 남는 쪽에 경고색(.no)이 붙어 있으면 돈이 남는 정상 상태가
     빨간 경고로 보인다. 그것도 이번에 고친 것이라 다시 들어오지 않게 막는다. */
  const sum = view.match(/남는 예산<\/span><span class(?:Name)?="v ([a-z]+)"/);
  if (!sum) problems.push("'남는 예산' 줄을 찾지 못했습니다 — 합계 표시가 바뀌었습니다.");
  else if (sum[1] !== 'ok') problems.push("'남는 예산'에 경고색이 붙어 있습니다 (class=\"v " + sum[1] + '"). 남는 것은 정상 상태입니다.');

  const over = view.match(/예산 초과<\/span><span class(?:Name)?="v ([a-z]+)"/);
  if (!over) problems.push("'예산 초과' 줄을 찾지 못했습니다.");
  else if (over[1] !== 'no') problems.push("'예산 초과'에 경고색이 없습니다 (class=\"v " + over[1] + '").');

  /* 화면에 같은 집행률이 보이면 색도 같아야 한다.
     화면은 소수 1자리로 반올림해 보여 주는데 판정을 원값으로 하면, 99.974% 와 100% 가
     **둘 다 화면에 "100.0%" 로 찍히면서 색은 초록/빨강으로 갈린다**(실제로 그랬다).
     그리고 정확히 100% 는 초록이어야 한다 — 예산을 다 쓴 것은 최선이지 경고가 아니다. */
  console.log('\n집행률 색 — 화면 표시값과 색이 어긋나지 않는지');
  if (rateClass(100) !== ' r-good')
    problems.push('정확히 100% 가 초록이 아닙니다 (' + rateClass(100).trim() + '). 예산을 다 쓴 것은 최선입니다.');
  if (rateClass(100.1) !== ' r-over')
    problems.push('100.1% 가 빨강이 아닙니다 (' + rateClass(100.1).trim() + ').');

  /* 0~130% 를 잘게 훑어 **화면에 같은 값으로 찍히는 것끼리** 색이 갈리는지 본다. */
  const seen = new Map(); let clash = 0;
  for (let v = 0; v <= 130.0001; v += 0.01) {
    const shown = v.toFixed(1), cls = rateClass(v);
    if (!seen.has(shown)) seen.set(shown, cls);
    else if (seen.get(shown) !== cls) {
      if (clash++ === 0) problems.push('화면에 "' + shown + '%" 로 같이 보이는데 색이 갈립니다 — '
        + seen.get(shown).trim() + ' vs ' + cls.trim() + '. 판정을 표시값(소수 1자리) 기준으로 하세요.');
    }
  }
  console.log('  표시값 ' + seen.size + '가지를 훑어 색이 갈리는 곳: ' + clash + '건');
  console.log('  100.0% → ' + rateClass(100).trim() + '   99.974% → ' + rateClass(99.974).trim()
    + '   100.1% → ' + rateClass(100.1).trim());

  /* 집행률 색과 게이지 막대 색이 같은 구간·같은 색을 쓰는지.
     전에는 막대만 `pct>92` 라는 다른 규칙을 써서, 98.9%에서 숫자는 초록인데 막대는 주황이었다 —
     같은 화면이 같은 사실을 두고 다른 말을 하고 있었다. 규칙이 두 곳에 적히면 또 어긋난다. */
  console.log('\n집행률 색 ↔ 게이지 막대 색');
  const bands = ['r-over', 'r-good', 'r-warn', 'r-low'];
  for (const b of bands) {
    const text = html.match(new RegExp('\\.sum \\.rate\\.' + b + '\\{color:var\\((--[a-z0-9]+)\\)'));
    const bar = html.match(new RegExp('\\.gauge\\.' + b + '\\s*i\\{background:var\\((--[a-z0-9]+)\\)'));
    if (!text) { problems.push('집행률의 ' + b + ' 색 규칙을 찾지 못했습니다.'); continue; }
    if (!bar) { problems.push('게이지 막대의 ' + b + ' 색 규칙을 찾지 못했습니다 — 두 색이 갈라졌습니다.'); continue; }
    const same = text[1] === bar[1];
    console.log('  ' + b.padEnd(8) + ' 집행률 ' + text[1].padEnd(8) + ' / 막대 ' + bar[1].padEnd(8) + (same ? ' 일치' : ' ✘ 다름'));
    if (!same) problems.push(b + ' 의 색이 다릅니다 — 집행률 ' + text[1] + ' vs 게이지 ' + bar[1] + '.');
  }
  if (!/'gauge'\s*\+\s*rateClass\(rate\)/.test(view))
    problems.push('게이지가 rateClass() 를 쓰지 않습니다 — 색 판정이 두 군데로 갈라졌습니다.');
  if (/pct>92|\.gauge\.w\b|\.gauge\.o\b/.test(html + view))
    problems.push('게이지에 옛 규칙(pct>92 / .gauge.w / .gauge.o)이 남아 있습니다.');

  if (problems.length) {
    console.error('\n부호 검사 실패\n');
    problems.forEach(p => console.error('  - ' + p));
    process.exitCode = 1;
    return;
  }
  console.log('\n부호 검사 통과 — 남으면 +, 넘치면 −, 색도 상태를 따라갑니다.');
})();
