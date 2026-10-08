# AGENTS.md — InKY Calculator

이 저장소를 고치는 **모든 도구/에이전트**(Claude Code, Codex 등)가 읽어야 하는 문서다.
클로드 코드 전용 맥락은 [CLAUDE.md](CLAUDE.md)에 더 있지만, **아래 내용은 도구와 무관하게 전부 적용된다.**
Codex 등 `.claude/`를 자동으로 읽지 않는 도구는 **[`.claude/rules/app.md`](.claude/rules/app.md)의
금지·함정 목록도 반드시 읽을 것** — 이 파일에 없는 사고 기록·이유가 그쪽에 있다.

## 저장소 요약

- **React 19 + TypeScript(strict) + Vite**(2026-09-25 전환). 소스는 `src/`, 빌드하면
  **`dist/index.html` 한 파일에 로직·스타일이 전부 인라인**으로 들어간다(+ `dist/og.jpg`).
  이 "파일 하나"는 요구사항이다 — 카톡으로 받은 HTML 파일을 내려받아 그대로 열어도 돌아야 한다.
  `build/inline-app.mts`가 번들을 `index.html`의 원래 자리(`<!--inline:app-->`)에 **클래식 인라인
  `<script>`**로 넣는다. 빌드 설정을 바꿔 `assets/*.js` 같은 별도 파일이 생기면 내려받은 파일이 빈 화면이 된다.
- CSS는 `index.html` 안의 인라인 `<style>` 그대로다(Vite가 한 글자도 바꾸지 않게 설정해 뒀다 — `vite.config.mts`).
- **라이브: https://calc.edutogether.kr** — 공식 주소다. Firebase Hosting(프로젝트·사이트 모두
  `inky-calculator`)이 서빙하고, `https://inky-calculator.web.app` 으로도 같은 것이 열린다.
- 옛 주소 `edutogether.github.io/inky-calculator`(GitHub Pages)는 **내리는 중이다.**
  코드·문서에는 더 이상 남아 있지 않다. 되살릴 일이 없다 — 새로 쓰지 말 것.
- 외부 리소스는 **`cdn.sheetjs.com`의 xlsx(0.19.3 이상 버전 고정, SRI `integrity`·`crossorigin` 걸림) + Google Fonts
  뿐이어야 한다.** html2canvas·jspdf는 PDF 기능을 없애며 함께 지웠다(되살리지 말 것). 구글
  폰트 CSS는 브라우저마다 다른 바이트를 돌려주는 리소스라 SRI를 걸 수 없다 — 걸려고 하지 말 것.
  (과거 원본에 `lc.getunicorn.org` 스크립트가 섞여 있었다 — 기기의 VPN류 앱이 주입한 것으로 추정, 제거했다.
  **주입원은 아직 이 PC에서 동작 중이다** — 이 PC의 브라우저로 페이지를 열면 지금도 그 스크립트가
  DOM에 끼어든다. 서버가 주는 파일에는 없다. 브라우저로 검증할 때 이걸 앱의 문제로 착각하지 말 것.)
- **2026-11-15까지만 운영한다.** 그날 예약 작업이 저장소를 아카이브한다. Firebase로 옮긴 뒤에는
  **Hosting 사이트와 `calc.edutogether.kr` DNS 레코드까지 함께 정리해야 한다**(남기면 서브도메인 탈취 위험).

## 이 파일이 열리는 세 가지 경로 — 전부 다르게 동작한다

| 열리는 곳 | 자바스크립트 | 파일 저장 | 인쇄 |
|---|---|---|---|
| 호스팅 웹페이지(라이브 주소) | 정상 | 정상 | 정상 |
| 내려받은 HTML 파일 직접 열기 | 정상 | 정상 | 정상 |
| **카톡 파일 미리보기** | **실행 안 됨** | — | — |

---

# 반드시 지킬 것 — 1~3번은 전부 실제로 사고가 났던 지점이다

## 1. 카톡 파일 미리보기는 자바스크립트를 아예 실행하지 않는다

카톡으로 HTML 파일을 보내면 받는 사람은 보통 **다운로드 → 미리보기**로 연다.
그 화면에서는 JS가 한 줄도 돌지 않는다. 그래서:

- 계산기 본체는 `html:not(.js)` 규칙으로 숨기고, **정적 HTML만으로 된 안내 카드(`#nojs`)** 를 보여준다.
- 그 화면용 안내는 **JS로 만들면 절대 안 뜬다.** 실제로 안내를 JS 토스트로 만들었다가 아무것도 안 보이는 사고가 났다.
  앱이 없어 링크가 안 열릴 때의 안내조차 **CSS만으로**(`:hover/:focus/:active` + `@keyframes tipPop`) 구현돼 있다.
- JS가 도는 화면에서는 이 카드를 무조건 숨긴다 — 계산기가 정상 동작하므로 필요 없다.

## 2. `#nojs` 카드의 링크에 상대 경로를 쓰면 안 된다

카드의 Safari / Chrome 단추는 **순수 `<a href>`** 이고, 전부 **절대 주소**여야 한다
(`x-safari-https://…`, `googlechromes://…` — 둘 다 호스팅 주소로 간다).
(Claude 단추도 있었는데 2026-09-25 아티팩트 사본을 없애며 뺐다 — 되살리지 말 것.)
`./` 같은 **상대 경로를 쓰면 미리보기 화면에서는 갈 곳이 없어 아무 반응도 없다.** 실제로 있었던 버그다.

## 3. 캐시 버전 값(`?v=…`)은 없어졌다 — 다시 만들지 말 것

GitHub Pages는 응답 헤더를 줄 수 없어 HTML에 `Cache-Control: max-age=600`이 붙었고,
**Safari가 특히 옛 화면을 오래 붙잡았다.** 그래서 `#nojs` 카드 링크에 `?v=YYYYMMDDx` 값을 박고
배포할 때마다 손으로 올리는 방식을 썼다. 올리는 걸 잊어 공유된 파일에서 옛 화면이 열린 적이 있다.

**Firebase Hosting으로 옮기면서 이 방식을 걷어냈다.** 이제 `firebase.json`이
`Cache-Control: no-cache`를 직접 주므로 브라우저가 매번 새로 확인한다. 손으로 관리하던 값이
사라졌으니 **다시 만들지 말 것** — 캐시 문제가 보이면 버전 값을 붙이는 게 아니라
응답 헤더를 확인한다(`node scripts/check-headers.js https://calc.edutogether.kr/`).

## 4. 인라인 블록이 바뀌면 `firebase.json`의 CSP 해시도 같이 고쳐야 한다

Firebase Hosting이 응답 헤더로 CSP를 준다. 이 앱은 CSS·JS를 밖으로 뺄 수 없어서(1번 참고 —
카톡으로 보낸 **파일 한 개**가 그대로 동작해야 한다) 인라인 블록마다 **sha256 해시**를
`firebase.json`에 적어 두는 방식을 쓴다. 그래서:

> **배포되는 `dist/index.html`의 인라인 `<style>`·`<script>`가 한 글자라도 바뀌면 해시가 달라진다.**
> `src/`의 코드를 고치면 번들(인라인 `<script>`)이 바뀌므로 **거의 매번** 해당한다.
> 갱신하지 않고 배포하면 **호스팅된 화면이 통째로 죽는다**(스크립트가 전부 차단된다).

혼자 조용히 나지 않도록 검사를 붙여 뒀다. **고친 뒤 반드시 돌릴 것** — 배포 워크플로도 이걸
먼저 돌리고 실패하면 배포를 멈춘다. 새 해시 값을 이 명령이 그대로 알려 준다.

```
npm run build && node scripts/check-csp.js
```

같은 이유로 **인라인 `style="…"` 속성과 `onclick=` 같은 인라인 핸들러를 새로 만들지 말 것.**
CSP가 차단한다. 스타일은 `<style>` 블록에 규칙으로 넣고, 핸들러는 JS에서 붙인다.
(자바스크립트가 `el.style.…`로 값을 넣는 것은 CSP 대상이 아니므로 그대로 써도 된다.)

---

## 그 밖의 주의

- **줄바꿈**: 줄바꿈은 `.gitattributes`가 **LF로 못박아** 둔다 — CSP 해시가 파일 바이트에
  걸려 있어 체크아웃 환경에 따라 CRLF가 되면 배포된 화면이 죽기 때문이다. 이 설정을 풀지 말 것.
- **견적 상태 공유**: `stateStr()`(`src/share-state.ts`)이 현재 화면 상태(항목 on/off·선택 상품·
  수량·협의회 설정)를 base64로 압축해 주소에 싣고, `applyState()`가 `#q=…`로 들어온 주소를 복원한다.
  항목 37개 기준 전체 주소 약 500자. **이미 카카오톡으로 나간 링크가 이 형식에 기댄다** — 필드 순서·
  인코딩을 바꾸지 말고, 항목(`src/data.ts`)을 끼워 넣지 말고 맨 뒤에 붙인다.
- **React로 옮기며 일부러 남긴 원래 동작**(고치려면 따로 결정하고 고친다 — `src/App.tsx` 머리말):
  입력칸·체크박스는 비제어라 사람이 친 글자가 정해진 순간(±·전체 선택·그룹 체크·가져오기)까지 남는다,
  그룹 머리 체크박스는 줄 하나를 끌 때 따라 바뀌지 않는다, `#q=`로 절사 500원이 들어와도 단위 단추는
  1,000원이 선택돼 보인다. 목록은 `_docs/intents/2026-09-25-react-ts-conversion/intent.md`에 있다.

## 명령

- 개발: `npm ci` 뒤 `npm run dev`(Vite 개발 서버). 배포 산출물은 `npm run build` → `dist/`.
- 검사(배포 워크플로가 이 순서 그대로 돈다):
  ```
  npm ci
  npm run typecheck                  # src/ 타입(tsc, strict)
  npm run lint                       # 검사·테스트·대조 도구 JS(eslint)
  npm run build                      # dist/index.html(파일 하나) + dist/og.jpg
  node scripts/check-csp.js          # dist/index.html 인라인 <style>/<script> 해시가 firebase.json과 맞는지
  node scripts/check-xlsx.js         # 엑셀 라이브러리가 0.19.3 이상·SRI·CSP 호스트 하나로 고정돼 있는지(PR은 --live로 실제 파일까지)
  node scripts/check-recommended.js  # 첫 화면(권장안)이 상한·목표선을 지키는지
  node scripts/check-signs.js        # 돈 부호(+/−)·집행률/게이지 색 판정
  node scripts/check-contrast.js     # 캡션 글자가 WCAG AA 대비를 지키는지
  npm test                            # tests/scenarios.test.js — dist/index.html을 jsdom에서 화면으로만 다룬다
  node scripts/check-og.js           # 카카오톡 공유 카드(og:*·twitter:*) 태그가 <head>에 있는지
  ```
- **화면·동작을 바꾸지 않는 수정**(리팩터·도구 교체)이면 대조 도구로 전후를 비교한다:
  `npm run verify -- run dist` — 기준 태그의 원본과 지금 `dist/`를 같은 때에 찍어 픽셀·DOM·
  공유 주소·엑셀·인쇄 PDF까지 대조한다(`scripts/verify/`, 도구 자체 검증은 `npm run verify:selftest`).
- **`main`을 향한 PR을 열면 위 검사(빌드·`check-*`·`npm test`)가 `pr-check.yml`로 자동으로 돈다**(배포는 하지 않는다).
- 배포: `main`에 push → **Firebase Hosting**(GitHub Actions, `.github/workflows/firebase-hosting.yml`).
  잡이 셋이다 — `test`(설치·빌드·검사, 비밀 없음) → `deploy`(산출물만 받아 배포, **저장소 코드를 빌드·실행하지 않는다**) → `live`(라이브 확인).
  수동 실행으로 `main`이 아닌 가지를 골라도 `deploy`는 돌지 않는다. 이 구조를 풀어 한 잡으로 합치지 말 것.
- 손으로 배포: 위 검사를 전부 통과시킨 뒤
  `firebase deploy --only hosting --project inky-calculator`.
  배포 로그의 파일 수가 **`found 2 files`** 인지 볼 것(`index.html`·`og.jpg` 두 개만
  올라가야 한다 — 2026-09-10 카카오톡 공유 카드 추가로 1개에서 늘었다).
- 배포 뒤 확인: `node scripts/check-headers.js https://calc.edutogether.kr/`,
  `node scripts/check-og.js https://calc.edutogether.kr/`(og.jpg 실제 서빙·sha256 일치)
  보안 헤더(CSP·X-Frame-Options·X-Content-Type-Options·Referrer-Policy·Permissions-Policy·
  Strict-Transport-Security)와 `Cache-Control: no-cache` 가 실제 응답에 있는지 본다. 워크플로도 배포 직후 이걸
  돌리고, 하나라도 빠지면 배포를 실패로 표시한다 — **헤더가 이번 이전의 목적이기 때문이다.**
- **롤백이 필요하면** [`_docs/ops/rollback.md`](_docs/ops/rollback.md)를 따른다 —
  `git reset --hard`나 `push --force`를 쓰지 않는다.
- 커밋 메시지 형식: `type: 한글 설명 (승인 Bumm M/D)` — type은 feat/fix/docs/chore/refactor/test.

## 조직 공통 규칙 — 다른 도구·클라우드에서도 (D:\Projects 헌법 요약)

이 저장소만 받아서 일하는 도구(Codex 클라우드, Claude Code 클라우드, 다른 기기)는 `D:\Projects`의 공통
문서를 못 본다. 그래서 꼭 지켜야 할 것을 여기 옮겨 둔다. 원본은 `817beatles/projects`의 `_shared/constitution.md`.

- **사람**: 최종 결정권자는 **Bumm님**. 모든 답·문서·커밋은 **한국어**, 호칭은 늘 "Bumm님".
- **앱 이름**은 정식 이름 하나로만: CLASSCADE · Poster Studio · Be a Googler · Voice Cinema · Portal ·
  Codyssey · InKY Calculator · AI Ways Incheon (줄임말·별명·번역어 금지).
- **보고 경로**: 앱 담당은 팀장(Project Engineering)과만 주고받는다. Bumm님이 직접 말을 걸면 그 건만 직접 답한다.
- 🔴 **`main` 푸시 = 라이브 배포.** Codex·클라우드·다른 기기에서 한 작업은 `main`에 직접 푸시하지 않는다 —
  작업 가지 → PR로 내고, 합치는 것은 팀장 확인 뒤. 되돌리기는 CI로만(프리즈 태그 기준), 라이브에 직접 손대지 않는다.
- 🔴 **멈추고 Bumm님께 묻는 것**: 콘솔 전용 작업(Firebase/GCP), 돈이 드는 결정, 법률·정책 판단, 되돌리기 어렵거나
  파괴적인 행동, 영구 식별자(프로젝트·사이트 ID, 버킷 이름) 생성, 새 제품 방향.
- **한 번에 완성**: "일단", "차선책", "우회", "나중에" 금지. 제대로 못 하면 멈추고 보고. `TODO`/`FIXME`/`임시` 금지.
  검사를 느슨하게 하거나 빼서 통과시키지 않는다. 검사는 실제로 돌리고 종료 코드로 확인한다.
- **숨길 것**: 어드민 화면·기능은 저장소·배포·커밋 어디에도 드러내지 않는다. 비밀 키·토큰·인증 코드는 쓰지 않는다.
- **인계(도구·기기를 바꿔 가며 이어서 할 때)**: 단계를 끝낼 때마다 작업 가지에 올리고, PR 설명에
  "한 일 / 다음에 할 일 / 주의할 것"을 적는다. 같은 가지를 두 도구가 동시에 고치지 않는다 — 한쪽이 올린 뒤 이어받는다.
- **로컬(집 PC) 전용 작업** — 클라우드에서는 하지 않는다: 콘솔 작업(Firebase Hosting·DNS), 운영 데이터
  읽기·쓰기, 배포 승인, 집 PC 모니터를 쓰는 측정, **Firebase 프리뷰 채널 생성·삭제**와 **CPU 스로틀
  성능 측정**(`scripts/verify/perf.mjs`, `scripts/verify/nojs-flash.mjs` — 헤드리스 Chrome을 이 PC에서
  직접 띄운다). 클라우드는 코드 수정·타입·린트·`npm run verify`(파일 대조)·PR까지만.
