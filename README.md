# InKY Calculator

제4회 인천어린이청소년영화제(InKY) **부스 물품 구매 견적 계산기**.
필요한 물품을 골라 수량을 정하면 예산 **1,500,000원** 안에 들어오는지 바로 계산해 준다.

- **라이브**: https://calc.edutogether.kr
- **구성**: React 19 + TypeScript + Vite(2026-09-25 전환). 소스는 `src/`, 빌드하면 `dist/index.html`
  **한 파일**에 로직·스타일이 전부 인라인으로 들어간다 — 내려받은 파일 하나만 열어도 돈다.
  배포 산출물은 그 파일과 카카오톡 공유 카드 이미지 `og.jpg` 둘이다.
- **개발**: `npm ci` → `npm run dev`. 검사 명령은 [AGENTS.md](AGENTS.md)의 "명령" 절.
- **배포**: `main`에 push하면 GitHub Actions가 검사·빌드한 뒤 Firebase Hosting에 반영한다.

## 기능

- 물품 항목 on/off, 상품 선택, 수량 조정 → 합계와 예산 잔액 실시간 계산
- 견적 상태를 주소(`#q=…`)에 담아 그대로 공유 — 링크를 열면 같은 견적이 복원된다
- 「공유하기」는 윈도우·휴대폰의 공유창을 띄워 그 주소를 보낸다
- 엑셀(xlsx)로 저장, 인쇄(프린터를 PDF로 고르면 PDF로 저장)

## 실운영 상태 (2026-10-10 종합감사 10/10 기준)

- **자동으로 도는 것**: `main`에 push하면 `test`(설치·빌드·검사, 비밀 없음) → `deploy`(산출물만 받아 Firebase에 배포) → `live`(라이브 헤더·공유 카드 확인)가 차례로 돈다.
  PR을 열면 같은 검사가 `pr-check.yml`로 돈다. GitHub이 CodeQL·Dependabot 보안 알림·비밀 스캔(푸시 차단 포함)을 상시 감시한다.
- **사람이 주기적으로 할 일**: **없음.** (견적 값은 행사 준비에 따라 사용자가 계산기에서 직접 고른다.)
- **문제가 생기면 어디부터**: ① `node scripts/check-headers.js https://calc.edutogether.kr/` ② GitHub Actions의 최근 실행 ③ 화면이 통째로 비면 CSP 해시 불일치부터
  의심한다(`.claude/rules/app.md`). 되돌리기는 [`_docs/ops/rollback.md`](_docs/ops/rollback.md) — Firebase 콘솔 릴리스 기록의 «롤백»이 1분 안에 끝난다.
- **끝나는 날**: 행사 **2026-11-14**, 사이트는 **2026-11-15**에 내린다(아래).

## ⚠️ 운영 기간

**2026-11-15까지만 운영한다.** 그날 예약 작업이 저장소를 아카이브한다. Firebase Hosting 사이트와
`calc.edutogether.kr` DNS 레코드도 함께 정리해야 한다.
그 이후로는 유지보수하지 않는다.

## 이 저장소를 고칠 때

수정 전에 반드시 [AGENTS.md](AGENTS.md)를 읽을 것 — CSP 해시 갱신, 카톡 미리보기 대응 등
**실제로 사고가 났던 함정들**이 정리돼 있다.
