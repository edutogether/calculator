# 배포 롤백 절차

배포된 `index.html`이 잘못됐을 때 이전 상태로 되돌리는 절차. 두 방법이 있고, **상황에 따라
고른다** — 둘 다 실사용자에게 영향이 없어야 하는 급한 상황을 전제로 한다.

## 방법 A — Firebase 콘솔에서 즉시 되돌리기 (가장 빠름, 1분 이내)

CI를 기다리지 않고 **이전에 배포했던 파일을 그대로 다시 서빙**하는 방법이다. 화면이 완전히
깨져서 당장 되돌려야 할 때 쓴다.

1. [Firebase 콘솔 → Hosting](https://console.firebase.google.com/project/inky-calculator/hosting/sites/inky-calculator) → `inky-calculator` 사이트의 **릴리스 기록**을 연다.
2. 지금 문제가 없었던 마지막 릴리스를 찾는다(배포 시각으로 구분한다).
3. 그 행의 **⋮(더보기) → 롤백**을 누른다.

**주의**: 이 방법은 **`firebase.json`에 지금 적혀 있는 헤더·CSP 설정과 무관하게, 그 시점에
배포됐던 파일 그대로**를 되돌린다 — `git`의 상태와는 별개다. 롤백 후에는 반드시 **방법 B로
git도 그 시점에 맞춰 되돌려서** 다음 배포가 롤백을 다시 덮어쓰지 않게 한다.

## 방법 B — git revert 로 되돌리기 (기록이 깨끗하게 남음, CI 한 번 더 돈다)

**정상적인 상황이라면 이 방법을 기본으로 쓴다.** 배포 워크플로(CSP·부호·대비·vitest 검사)를
다시 통과시키면서 되돌리므로, 되돌린 결과 자체가 다시 검증된다.

```bash
# 1. 되돌릴 커밋을 찾는다
git log --oneline

# 2. 커밋 하나를 되돌릴 때
git revert <되돌릴 커밋의 해시>

# 3. 여러 커밋을 한 번에 되돌릴 때(가장 오래된 것..가장 최신 것 범위)
git revert --no-commit <가장_오래된_커밋>^..<가장_최신_커밋>
git commit -m "revert: <이유> (승인 Bumm M/D)"

# 4. push 하면 firebase-hosting.yml 워크플로가 검사를 돌리고 다시 배포한다
git push origin main
```

되돌린 뒤에는 평소와 같이 라이브를 확인한다:

```bash
curl -s -o /dev/null -w "%{http_code}\n" https://calc.edutogether.kr/
node scripts/check-headers.js https://calc.edutogether.kr/
```

## 참고 — freeze 태그로 되돌아가기

각 freeze 태그는 "그 시점까지의 변경이 전부 검증된 상태"를 표시한다(`.claude/rules/app.md`
"검증용으로 띄운 것은 끝나면 끈다" 절이 아니라 별도 관례). 태그 시점 전체로 되돌리려면:

```bash
git diff <freeze-태그-이름> -- index.html   # 지금과 그 시점의 차이를 먼저 본다
git revert --no-commit <freeze-태그-이름>..HEAD
git commit -m "revert: <freeze-태그-이름> 시점으로 되돌림 (승인 Bumm M/D)"
git push origin main
```

## React 전환(2026-09-25)을 통째로 되돌릴 때

전환 직전 지점은 **`calculator-freeze-20260925-pre-react-after-artifact`**(원격에 있다)다.
그 뒤 커밋을 한꺼번에 되돌리면 빌드 없는 `index.html` 한 파일 구조로 돌아간다 — `firebase.json`의
`public`도 `"."`으로, CSP 해시도 그 시점 값으로 함께 돌아가므로 따로 고칠 것이 없다.

```bash
git revert --no-commit calculator-freeze-20260925-pre-react-after-artifact..HEAD
git commit -m "revert: React 전환 되돌림 — <이유> (승인 Bumm M/D)"
git push origin main
```

급하면 방법 A(콘솔 롤백)로 먼저 전환 전 릴리스를 서빙하고, 그다음 위 revert 로 git 을 맞춘다.
전환 전후의 차이는 `index.html` 소스끼리가 아니라 **배포 산출물끼리** 보아야 한다 —
`npm run verify -- run dist`(대조 도구)가 그 일을 한다.

## 하지 말 것

- **`git reset --hard` + `push --force`로 main 이력을 지우지 않는다.** 이 저장소는 단일
  트렁크 직접 커밋 방식(`_shared/CONVENTIONS.md` §6.1)이라, 이력을 지우면 다른 세션·팀장이
  보던 커밋 참조가 끊긴다. 되돌릴 때도 **새 커밋으로 되돌린다(revert)**.
- **`firebase.json`의 CSP 해시만 손으로 옛 값으로 되돌리지 않는다.** `index.html`과
  `firebase.json`은 항상 짝을 맞춰 되돌려야 한다 — `node scripts/check-csp.js`가 그 짝이
  맞는지 배포 전에 검사한다.
