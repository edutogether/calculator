# RUNBOOK — InKY Calculator

> 이 저장소에서 되풀이하는 일을 **그대로 따라 하면 끝나는 순서**로 적는다. 명령은 복사해서 바로 돌릴 수 있게 쓰고,
> 단계마다 «됐는지 확인하는 법»을 붙인다. 무엇을 지켜야 하는지는 `_docs/RULES.md`, 함정이 생긴 사연은
> `.claude/rules/app.md`에 있다 — 이 문서는 «어떻게 하나»만 다룬다(원본 양식: `D:\Projects\_shared\doc-kit\`).
> 일을 시작할 때 그 일의 절을 열고, 첫 진행 설명과 완료 보고에 «읽은 것: RUNBOOK §1»을 적는다.
> 검사기는 자잘하게 고치는 동안 돌리지 않는다 — 한 덩어리가 끝나면 «이제 검사기를 한 번에 돌리겠습니다»라고 알리고 한 번 돌린다.

## 목차

| 일 | 언제 하나 | 절 |
|---|---|---|
| 개발 서버 · 로컬 확인 | 코드를 고칠 때 | §1 |
| 검사 전체 돌리기 | 한 덩어리 작업이 끝났을 때 | §2 |
| 화면 대조(전환 전 원본과 비교) | 화면 · 동작을 바꾸지 않는 수정을 증명할 때 | §3 |
| 배포 | 검사를 통과한 변경을 라이브에 올릴 때 | §4 |
| 배포 뒤 확인 | 배포가 끝난 직후 | §5 |
| CSP 해시 갱신 | `index.html` 인라인 블록이나 번들이 바뀌었을 때 | §6 |
| 의존성 · Node · 도구 판 올리기 | «지난 판을 남기지 않는다» 점검 때 | §7 |
| 보안 알림 대응 | Dependabot · CodeQL · 비밀 스캔 알림이 떴을 때 | §8 |
| 롤백 | 라이브 화면이 잘못됐을 때 | §9 |
| 운영 종료 정리 | Bumm님이 사이트 종료를 정하실 때 | §10 |

## 1. 개발 서버 · 로컬 확인

- **언제**: 코드를 고치는 동안
- **시작 전에 읽을 규칙**: `RULES.md` R-4 · R-5 · R-6
- **순서**
  1. `npm ci` → **확인**: `found 0 vulnerabilities`
  2. `npm run dev` → **확인**: 터미널에 로컬 주소가 뜨고 화면이 열린다
  3. 배포 산출물 그대로 보려면 `npm run build` → **확인**: `dist/index.html` 한 파일(+ `dist/og.jpg`)만 생긴다
- **끝나면 남길 것**: 한 가지 일이 한 커밋(커밋 메시지 끝에 `(지시 Bumm M/D)`). 작업 중간 저장용 커밋을 만들지 않는다.
- **막히면**: 화면이 통째로 비면 CSP 해시 불일치부터 본다(§6).

## 2. 검사 전체 돌리기

- **언제**: 한 덩어리 작업이 끝났을 때(글자 하나 고치는 동안에는 그 자리만 열어 본다)
- **시작 전에 읽을 규칙**: `RULES.md` R-5 · R-6 · R-7 · R-11~R-13 · R-18 · R-20 · R-24~R-26 · R-28
- **순서**
  1. «이제 검사기를 한 번에 돌리겠습니다»라고 알린다.
  2. 아래를 한 줄로 돌린다 → **확인**: 끝까지 오류 없이 나온다(vitest `Tests N passed (N)`, 각 `check-*`가 «통과»)

     ```bash
     npm ci && npm run typecheck && npm run lint && npm run build && node scripts/check-csp.js && node scripts/check-xlsx.js && node scripts/check-recommended.js && node scripts/check-signs.js && node scripts/check-contrast.js && npm test && node scripts/check-og.js && npm audit
     ```

  3. 움직임 · 카톡 카드도 건드렸다면 `npm run verify:motion` · `npm run verify:nojs-flash`
- **끝나면 남길 것**: 완료 보고에 «규칙 N개 · 검사기 통과 N · 빨간불 시험 함 · 직접 열어 본 것 N»
- **막히면**: 실패한 검사기 이름이 곧 어긴 규칙이다(`RULES.md` «검사» 칸에서 찾는다). 판을 낮추거나 검사를 끄지 않고 원인을 고친다.

## 3. 화면 대조(전환 전 원본과 비교)

- **언제**: 화면 · 동작을 바꾸지 않는 수정(의존성 올리기 · 리팩터)을 증명할 때. 약 30분 걸린다.
- **시작 전에 읽을 규칙**: `RULES.md` R-4
- **순서**
  1. `npm run build`
  2. `npm run verify -- run dist` → **확인**: `차이 169건 / 파일 502개`와 같다(160은 `<head>` 속성 차이 = SheetJS 스크립트 주소 · 파비콘, 나머지는 고친 결함 시나리오). 숫자가 늘면 새 차이다.
  3. 도구 자체 점검은 `npm run verify:selftest` → **확인**: `변이 11/11 모두 잡음`
- **끝나면 남길 것**: `.verify/`는 gitignore된 작업 폴더라 지워도 된다.
- **막히면**: 외부 폰트처럼 밖에서 오는 것이 흔들리면 `npm run verify -- stability`로 도구가 흔들리는지 먼저 본다(0건이어야 함).

## 4. 배포

- **언제**: §2를 통과한 변경을 라이브에 올릴 때(`main`에 합치면 자동 배포)
- **시작 전에 읽을 규칙**: `RULES.md` R-5 · R-6 · R-27 · R-36 · R-37
- **순서**
  1. 가지를 만들어 커밋하고 푸시한다 → `gh pr create --base main` → **확인**: PR 검사 `check`와 CodeQL이 모두 success(**대기열에 있는 채로 병합하지 않는다**)
  2. 사용자에게 보이는 변화가 있으면 팀장에게 «배포 직전 한 줄»을 보낸다.
  3. `gh pr merge <번호> --merge` → 배포 워크플로가 돈다 → **확인**: 잡 4개(`changes` · `test` · `deploy` · `live`)가 success, 문서만 바뀐 커밋이면 `deploy` · `live`가 skipped(정상)
  4. 배포 로그에서 `found 2 files`를 본다(그 이상이면 의도치 않은 파일이 딸려간 것).
  5. 합쳐진 가지를 지운다(`claude/cloud-session-setup`만 남긴다).
- **끝나면 남길 것**: `_docs/CHANGELOG.md` 한 줄. 공개 저장소이므로 보안 세부는 «보안 강화»까지만.
- **막히면**: 워크플로가 success인 것은 배포됐다는 뜻이 아니다 — `deploy` 잡의 conclusion을 본다.

## 5. 배포 뒤 확인

- **언제**: 배포가 끝난 직후
- **시작 전에 읽을 규칙**: `RULES.md` R-24 · R-28 · R-35 · R-38
- **순서**
  1. `curl -s https://calc.edutogether.kr/ | sha256sum` → **확인**: 로컬 `sha256sum dist/index.html`과 같다(번들이 안 바뀐 변경이면 직전 값 그대로)
  2. `node D:/Projects/_shared/ops/smoke-check.mjs _docs/ops/smoke.json` → **확인**: `결과: PASS`
  3. `node scripts/check-headers.js https://calc.edutogether.kr/` → **확인**: CSP · `no-cache` 등 보안 헤더
  4. `node scripts/verify/motion.mjs https://calc.edutogether.kr` → **확인**: «두 조건이 같고 움직임이 살아 있다»
  5. 세션 자체 브라우저로 라이브를 열어 화면 · 콘솔을 보고, 확인한 탭은 닫는다(소리 끔).
  6. 열린 알림: code-scanning · dependabot · secret-scanning 각각 `gh api "repos/edutogether/calculator/<종류>/alerts?state=open" --jq length` → **확인**: 셋 다 0
- **끝나면 남길 것**: 팀장 보고에 라이브 sha 앞 12자리 · smoke 결과.
- **막히면**: 화면이 안 바뀌어 보이면 버전 값을 만들지 말고 응답 헤더부터 본다(R-35).

## 6. CSP 해시 갱신

- **언제**: `index.html`의 인라인 `<style>`/`<script>`가 바뀌었거나 번들이 바뀐 빌드(react · vite 판올림 포함)
- **시작 전에 읽을 규칙**: `RULES.md` R-5 · R-6
- **순서**
  1. `npm run build && node scripts/check-csp.js` → 해시가 어긋나면 «이 값을 넣으세요»와 «남아 있는 해시»를 알려 준다.
  2. `firebase.json`의 CSP에서 옛 해시를 알려 준 새 값으로 바꾼다 → `node scripts/check-csp.js` → **확인**: `CSP 검사 통과`
- **끝나면 남길 것**: 같은 커밋에 함께 넣는다(해시만 따로 나중에 고치지 않는다).
- **막히면**: 어긋난 채 배포하면 라이브가 통째로 죽는다 — 검사가 배포를 막는 것이 정상이다.

## 7. 의존성 · Node · 도구 판 올리기

- **언제**: «지난 판을 남기지 않는다»(R-32) 점검 때 — Node · `firebase-tools`(워크플로 `firebaseToolsVersion`) · 액션(전체 SHA 고정) · 개발 의존성
- **시작 전에 읽을 규칙**: `RULES.md` R-4 · R-6 · R-32
- **순서**
  1. 되돌릴 태그를 먼저 찍는다: `git tag -a inky-calculator-freeze-<날짜>-pre-<작업> -m "…"` 후 푸시
  2. 최신 판 확인: `npm outdated`, `npm view firebase-tools version`, 액션은 `gh api repos/<소유자>/<이름>/releases/latest`
  3. `npm update`(주 버전은 `npm install --save-dev <패키지>@^<주 버전>`) → §2 전체 검사 → **확인**: 모두 통과, `npm audit` 0건
  4. 번들이 바뀌었으면 §6(CSP 해시)과 §3(화면 대조: 169건 그대로)
  5. 워크플로 `node-version` · `firebaseToolsVersion` · 액션 SHA를 바꿔 PR → §4
- **끝나면 남길 것**: `_docs/CHANGELOG.md` 한 줄(되돌릴 태그 이름 포함)
- **막히면**: 판을 낮춰서 통과시키지 않는다. 원인을 찾아 고친다. 상류가 고친 뒤 `overrides` 같은 임시 장치는 걷어낸다.

## 8. 보안 알림 대응

- **언제**: Dependabot · CodeQL · 비밀 스캔 알림, 또는 팀장이 보안 스캔 지적을 전달했을 때
- **시작 전에 읽을 규칙**: `RULES.md` R-26 · R-27 · R-36
- **순서**
  1. 알림을 손으로 닫지 않는다. 먼저 실제로 닿는 경로인지(배포물에 들어가는가) 판정한다.
  2. 의존성이면 §7로 올리고, 코드면 고치는 시험을 먼저 만들어 실패를 확인한 뒤 고친다.
  3. 의존성 그래프가 갱신됐는지: `gh api repos/edutogether/calculator/dependency-graph/sbom --jq '.sbom.packages|length'`
  4. 병합 · 배포(§4, §5)
- **끝나면 남길 것**: CHANGELOG에는 «보안 강화» 수준으로만. 세부는 팀장 비공개 원장에만 보고한다.
- **막히면**: 고친 뒤에도 알림이 열려 있으면 GitHub 쪽 재평가가 늦은 것일 수 있다 — 손으로 닫지 말고 팀장에게 알린다.

## 9. 롤백

- **언제**: 라이브 화면이 잘못됐을 때
- **시작 전에 읽을 규칙**: `RULES.md` R-5 · R-27
- **순서**: 상세는 [`_docs/ops/rollback.md`](ops/rollback.md) — 방법 A(Firebase 콘솔 릴리스 기록의 «롤백», 1분)와 방법 B(`git revert` 후 배포, 평소 기본).
  A로 되돌렸다면 반드시 B로 git도 맞춘다 → **확인**: §5
- **끝나면 남길 것**: CHANGELOG 한 줄, 팀장 보고.
- **막히면**: 콘솔 작업은 Bumm님이 직접 하셔야 한다 — 팀장에게 한 줄 보고한다.

## 10. 운영 종료 정리

- **언제**: Bumm님이 사이트 종료를 정하실 때. 원래 기한은 2026-11-15였으나 2026-11-26 확인 시 사이트와 저장소는 열려 있다. 예약 작업은 보고형이며 콘솔 작업은 Bumm님이 직접 한다.
- **시작 전에 읽을 규칙**: `RULES.md` R-31 · R-33
- **순서**
  1. 행사 전후에 Firebase 콘솔에서 하루 전송량을 한 번 본다(R-31).
  2. Firebase Hosting 사이트를 내린다 → 커스텀 도메인 연결을 푼다 → **가비아 DNS의 `calc.edutogether.kr` 레코드를 삭제한다**(남기면 제3자가 서브도메인을 가로챈다).
  3. 저장소를 아카이브한다.
  4. → **확인**: `curl -sI https://calc.edutogether.kr/`가 더 이상 우리 화면을 주지 않는다.
- **끝나면 남길 것**: CHANGELOG 마지막 줄, 팀장 보고.
- **막히면**: 푸시만으로 자동 배포가 돌아 닫은 서비스가 되살아날 수 있다 — 닫은 뒤에는 `main`에 푸시하기 전에 팀장에게 먼저 확인한다.

## 따로 있는 상세 런북

- [`_docs/ops/rollback.md`](ops/rollback.md) — 배포 롤백 두 방법(콘솔 즉시 되돌리기 · git revert)
- `_docs/ops/smoke.json` — 배포 뒤 smoke-check가 읽는 화면 선언(화면 문구를 바꾸면 같은 커밋에서 고친다)
