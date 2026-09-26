<!-- 원본 최종 수정: 2026-09-08 · 원본 위치: D:\Projects\_shared\intent-kit\README-template.md
     원본 버전: eb0eda204b4e
     사본의 "원본 버전"이 위와 다르면 원본이 갱신된 것이다. 다만 이 파일은 통째로 덮어쓰지 않는다 —
     아래 인덱스 표는 저장소마다 내용이 다르므로 반드시 보존하고, 등급표·설명 등 나머지만 원본에 맞춘다.
     (intent-workflow.md·TEMPLATE.md는 순수 사본이라 통째로 재복사하면 된다.)
     이 스탬프 블록은 사본에도 남긴다 — 지우면 그 저장소만 드리프트를 감지할 수 없게 된다. -->

# Intent 문서

이 폴더는 이 저장소에서 진행한(또는 진행 중인) 의미 있는 작업 하나하나가 **왜** 필요했는지,
뭘 원했는지, 어떤 제약 안에서 했는지를 기록한다.

**등급 기준·상태 관리 규칙은 헌법에 있다** — `_shared/CONVENTIONS.md` §1.5(등급 0/1/2 판단 기준),
§1.6(draft → accepted → in-progress → done | dropped). 여기 다시 적지 않는다.
워크플로 규칙은 이 저장소에도 사본을 뒀다:
[`.claude/rules/intent-workflow.md`](../../.claude/rules/intent-workflow.md).

놓치기 쉬운 예외 하나만 짚어 둔다: **팀장이 지시한 작업은 그 지시 자체가 승인이므로**
`accepted`로 쓰고 바로 `in-progress`로 진행한다 — 상태를 올려 줄 때까지 기다리지 않는다.
"상태 변경은 Bumm님만"은 세션이 스스로 제안한 건에 적용된다. 근거와 전문은 §1.6에 있다.

이 앱에서 등급 판단이 특히 갈리는 지점:

- **`index.html`의 인라인 `<style>`·`<script>` 안을 고치는 것은 등급 1 이상이다.** 한 글자만 바뀌어도
  `firebase.json`의 CSP 해시가 어긋나고, 갱신하지 않고 배포하면 호스팅 화면이 통째로 죽는다.
  두 파일이 한 몸으로 움직인다(`.claude/rules/app.md` 참고).
- **`firebase.json`의 `headers`·`ignore` 변경은 등급 2다.** 보안 헤더가 이 앱 이전의 목적 자체이고,
  `ignore`를 잘못 쓰면 배포하면 안 될 파일이 공개된다(실제로 `.git`이 배포된 적이 있다).
- **밖에 박힌 주소(`#nojs` 카드의 Safari·Chrome 링크, 인쇄 안내창)를 바꾸는 것은 등급 1 이상이다.**
  이미 카카오톡으로 나간 파일들은 회수할 수 없어서, 바꾸는 순간 옛 파일과 새 파일이 갈린다.

## 인덱스

| 날짜 | 슬러그 | 등급 | 상태 | 요약 |
|---|---|---|---|---|
| 2026-09-09 | [print-share-fixes](2026-09-09-print-share-fixes/intent.md) | 2 | done | 인쇄 넘침·공유하기·부스 이름 등 라이브 확인 지시 7건 |
| 2026-09-25 | [react-ts-conversion](2026-09-25-react-ts-conversion/intent.md) | 2 | done | React + TypeScript + Vite 전환, 화면·동작 한 픽셀도 불변 |

## 폴더 규칙

- 새 intent: `_docs/intents/YYYY-MM-DD-슬러그/intent.md` (`TEMPLATE.md` 복사해서 시작)
- 등급 2는 `intent.md` → `spec.md` → `plan.md` 순으로 이어 쓴다.
- `done`/`dropped` 상태가 된 intent도 지우지 않는다 — 나중에 "왜 그때 이렇게 안 했는지"를
  다시 확인할 수 있는 유일한 기록이다. 상태는 frontmatter로만 관리하고 폴더를 옮기지 않는다.
