/* 견적 상태를 주소(#q=…)에 싣고 되살린다. 「공유하기」가 보내는 주소가 이것이다.
 *
 * ⚠ 이 인코딩은 **이미 카카오톡으로 나간 링크**가 기대는 형식이다 — 필드 순서
 * ({v,a,m}, a 는 [선택, 수량, 켜짐], m 은 [인원, 횟수, 상한, 절사, 자동, 지급액])와
 * 인코딩(JSON → UTF-8 → base64 URL-safe, 끝의 = 없음)을 바꾸면 옛 링크가 깨진다. */
import { M, D } from './model.ts';
import { fixPer, int0 } from './money.ts';

export function stateStr(): string {
  const a = D.map(it => [it.sel, it.qty, it.on ? 1 : 0]);
  const j = JSON.stringify({ v: 1, a, m: [M.n, M.c, M.cap, M.unit, M.auto ? 1 : 0, M.per] });
  return btoa(String.fromCharCode(...new TextEncoder().encode(j)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/* #q= 는 남이 만든 주소일 수 있다(공유받은 링크를 손으로 고쳐 붙여넣는 것도 포함) — 그 안의
   숫자를 그대로 믿지 않는다. 문자열·음수·소수·범위 밖 값이 들어와도 화면 계산이 깨지지 않도록,
   입력칸에 사람이 직접 칠 때와 같은 규칙으로 정리한다: 수량·인원·횟수는 "0 이상 정수",
   인당 금액류는 그 규칙에 더해 fixPer()로 상한·절사 단위까지 맞춘다. 절사 단위는 500·1,000
   두 값만 허용한다. (2026-09-10 처리 — 고치기 전에는 render() 가 TypeError 로 죽었다)

   되살렸으면 협의회 설정이 들어 있었는지를 함께 돌려준다 — 들어 있었으면 화면 쪽이 입력칸
   (인원·횟수·인당 상한)을 그 값으로 다시 채운다. 못 읽으면 false. 읽다가 중간에 깨지면
   거기까지 바뀐 것은 그대로 두고 false 다(원래 동작 그대로). */
export function applyState(str: string): false | { meet: boolean } {
  try {
    const b = atob(str.replace(/-/g, '+').replace(/_/g, '/'));
    const u = Uint8Array.from(b, c => c.charCodeAt(0));
    const o = JSON.parse(new TextDecoder().decode(u));
    if (!o || !o.a) return false;
    o.a.forEach((v: unknown[], i: number) => {
      if (!D[i]) return;
      D[i].sel = Math.min(int0(v[0]), D[i].o.length - 1); D[i].qty = int0(v[1]); D[i].on = !!v[2];
    });
    if (o.m) {
      M.n = int0(o.m[0]); M.c = int0(o.m[1]); M.cap = fixPer(int0(o.m[2]));
      M.unit = o.m[3] === 500 ? 500 : 1000; M.auto = !!o.m[4]; M.per = fixPer(int0(o.m[5]));
      return { meet: true };
    }
    return { meet: false };
  } catch (_) { return false; }
}
