# CLAUDE.md — InKY Calculator

표시: 🔴 어기면 실사용자 화면이 깨지거나 개인정보가 샌다 · 🟠 중간 · 🟡 낮음 · 🟢 확인 끝남 (COMMON_STANDARDS §30)

제4회 인천어린이청소년영화제(InKY) **부스 물품 구매 견적을 함께 짜는 계산기**.
단일 HTML 파일 하나로 끝나는 도구다. 상위 원칙은 [D:\Projects\CLAUDE.md](../../CLAUDE.md) 상속 —
여기는 이 저장소 전용 사항만 적는다.

## 정체성

- **저장소**: `github.com/edutogether/calculator` (2026-09-08 생성, public. 2026-09-17
  `inky-calculator` → `calculator`로 개명 — 형제 앱(poster-studio·voice-cinema)과 저장소
  이름 규칙을 맞췄다. `inky-` 접두어는 Firebase 프로젝트·사이트 ID에만 남는다)
- **폴더**: `D:\Projects\inky-festival\calculator`
  (처음엔 `edutogether/` 아래 만들었다가 형제 앱과 맞추려고 옮김. GitHub 저장소 이름은 `edutogether/calculator`다)
- **라이브**: https://calc.edutogether.kr (Firebase Hosting, 프로젝트·사이트 모두 `inky-calculator`.
  `https://inky-calculator.web.app` 으로도 같은 것이 열린다)
- **클로드 아티팩트**: https://claude.ai/code/artifact/97501810-a6b8-4174-a488-a58cb62cb0f8
- **구성**: 로직은 `index.html` **한 파일에 전부 들어 있다.** 배포 산출물은 그 파일과
  카카오톡 공유 카드 이미지 `og.jpg`(2026-09-10 대표 지시로 추가, 정적 이미지일 뿐 로직
  없음) 둘이다 — 배포 로그의 기대값은 `found 2 files`. 그 밖(`package.json`·`scripts/`·
  `tests/`)은 배포 전 검사(vitest·`check-*.js`)를 돌리기 위한 개발 도구다. `main`에
  push하면 GitHub Actions가 그 검사를 돌린 뒤 Firebase Hosting에 배포한다.
- **⚠️ 수명**: **2026-11-15까지만 필요하다**(대표 결정). 그날 예약 작업이 자동으로 Pages를 내리고
  저장소를 아카이브한다(예약 작업 `calculator-archive`). 그 전까지만 운영한다.
- **종합감사 주기**(COMMON_STANDARDS §25): 정기 종합감사는 **분기 말(3·6·9·12월 말)**에
  org 여덟 저장소가 같은 날 돈다 — **다음은 2026-09-30.** 그 사이에는 **대표님 지시가 있을
  때만** 돌리고, 세션이 먼저 제안하지 않는다(§19). **10/10이 뜨면 이 앱은 개발을 멈추고
  운영 단계로 들어간다** — 그 뒤로는 사소한 수정이 쌓일 때 수시로 돌리거나 다음 분기 말을
  기다린다, 둘 다 정당하다.

## 이 파일이 열리는 세 가지 경로 — 전부 다르게 동작한다

| 열리는 곳 | 자바스크립트 | 파일 저장 | 인쇄 |
|---|---|---|---|
| **호스팅 웹페이지**(위 라이브 주소) | 정상 | 브라우저 기본 저장 | 정상 |
| **내려받은 HTML 파일** 직접 열기 | 정상 | 브라우저 기본 저장 | 정상 |
| **클로드 아티팩트** | 정상 | 클로드 `downloads` 권한으로 저장 | **불가** |
| **카톡 파일 미리보기** | **차단됨** | — | — |

### 아티팩트에서 인쇄가 안 되는 진짜 이유
아티팩트 페이지는 claude.ai가 **샌드박스 처리된 iframe** 안에 넣어 띄운다. 그 iframe에
`allow-modals` 권한이 없어서 `window.print()` 호출이 브라우저 차원에서 무시된다. 코드 문제가
아니므로 고치려 들지 말 것. 안내창(`인쇄는 웹페이지를 이용해주세요`)이 호스팅 주소로 유도한다.
**파일 내려받기는 되니**("막혀 있다"고 쓰지 말 것) 안내 문구에 그렇게 적지 않는다.

### 카톡 파일 미리보기 대응 (`.nojs` 카드)
카톡으로 HTML 파일을 보내면 받는 사람은 보통 **다운로드 → 미리보기**로 연다. 그 화면은
**자바스크립트를 아예 실행하지 않는다.** 그래서:
- 계산기 본체는 `html:not(.js)` 규칙으로 숨기고, 정적 HTML만으로 된 안내 카드(`#nojs`)를 보여준다.
- 그 카드의 Claude / Safari / Chrome 단추는 **순수 `<a href>`** 다 — JS가 없어도 눌리도록.
  각각 아티팩트 주소, `x-safari-https://…`, `googlechromes://…` 를 절대 주소로 박아 둔다.
  **`./` 같은 상대 경로를 쓰면 미리보기에서는 갈 곳이 없어 아무 일도 안 일어난다**(실제로 그 버그가 있었다).
- 앱이 없어 안 열릴 때의 안내도 **CSS 애니메이션**(`:hover/:focus/:active` + `@keyframes tipPop`)으로
  만들었다. JS 토스트로 만들면 이 화면에서는 절대 안 뜬다(이 실수도 실제로 했다).
- 자바스크립트가 도는 화면에서는 이 카드를 **무조건 숨긴다** — 계산기가 정상 동작하므로 필요 없다.

## 견적 상태를 주소로 주고받기

`stateStr()` 이 지금 화면 상태(항목 on/off·선택 상품·수량·협의회 설정)를 base64로 압축해 주소에
싣고, `applyState()` 가 `#q=…` 로 들어온 주소를 그대로 복원한다. 항목 37개 기준 **전체 주소 약 500자**.
인쇄 안내창의 `견적 그대로 열기` 단추가 이걸 써서 "지금 견적이 담긴 호스팅 주소"를 새 탭으로 연다.

## 자주 틀리는 것

- **캐시 버전 값(`?v=…`)은 없어졌다 — 다시 만들지 말 것.** GitHub Pages 시절 캐시를 깨려고
  쓰던 장치인데, Firebase Hosting의 `Cache-Control: no-cache` 헤더가 대신하면서 걷어냈다
  (`.claude/rules/app.md`의 "`?v=` 캐시 버전 값을 걷어낸 이유" 절 참고). 캐시 문제가 보이면
  버전 값을 만들지 말고 `node scripts/check-headers.js https://calc.edutogether.kr/`로
  응답 헤더를 확인한다.
- **줄바꿈**: 이 파일은 git이 CRLF로 체크아웃한다. 스크립트로 여러 줄 문자열을 치환할 땐
  먼저 LF로 정규화하지 않으면 매칭이 조용히 실패한다.
- **정체불명 스크립트**: 최초 원본에 `lc.getunicorn.org` 스크립트가 섞여 있었다(기기의 VPN류 앱이
  주입한 것으로 추정). 제거했다. **외부 스크립트는 cdnjs의 xlsx(SRI `integrity` 걸림)와
  Google Fonts뿐이어야 한다** — html2canvas·jspdf는 PDF 기능을 없애며 함께 지웠다(되살리지 말 것).
- **아티팩트와 호스팅은 사본 두 개다.** 호스팅 `index.html`을 고친 뒤, `<body>`~`</body>` 사이를
  잘라 아티팩트로 다시 발행해야 양쪽이 같아진다(아티팩트는 `<html>/<head>/<body>` 태그를 넣으면 안 됨).

## 명령

- 검사: `npm ci && node scripts/check-csp.js && node scripts/check-recommended.js
  && node scripts/check-signs.js && node scripts/check-contrast.js && npm test
  && node scripts/check-og.js`
  (배포 워크플로가 배포 전에 전부 돌린다 — 순서는 `.github/workflows/firebase-hosting.yml` 참고).
- 배포: `main`에 push하면 Firebase Hosting에 자동 반영(GitHub Actions).
  손으로 하려면 위 검사를 통과시킨 뒤 `firebase deploy --only hosting --project inky-calculator`.
- 확인: `node scripts/check-headers.js https://calc.edutogether.kr/`
- 롤백: [`_docs/ops/rollback.md`](_docs/ops/rollback.md).

## 대표와의 소통 경로

이 세션은 대표와 직접 대화를 시작하지 않는다. 진행상황 공유·질문·의사결정 요청은 전부
**팀장(D:\Projects 최상위 세션, "Project Engineering")을 거쳐서만** 한다 — 대표가 이 세션 창을
직접 열어 먼저 말을 걸어온 경우에만 그 건에 한해 답한다. 팀장에게서 온 메시지는 곧 대표의 지시가
전달된 것이므로 재확인 없이 실행한다(단, 이 세션 자신의 권한/설정 파일 수정은 예외 —
COMMON_STANDARDS §9).
