/* 시작. 빌드하면 이 번들이 index.html 의 원래 자리에 클래식 인라인 스크립트로 들어가(vite.config.mts)
 * 문서를 읽는 도중 그 자리에서 곧바로 실행된다 — 전환 전과 같은 시점이다.
 *
 * 첫 진입 : 권장 물품 구성 그대로에서 자동 계산을 한 번만 돌려 지급액을 정하고, 그 값을 고정한다.
 * 그 뒤로는 물품을 바꿔도 협의회비가 뒤에서 따라오지 않는다 — 사람이 바꾼 것만 화면에 남는다.
 * 주소로 들어온 견적(#q=)은 보낸 사람의 설정을 그대로 살린다(자동/직접 여부까지). */
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { M, refresh } from './model.ts';
import { applyState } from './share-state.ts';
import { App } from './App.tsx';

const got = location.hash.startsWith('#q=') ? applyState(location.hash.slice(3)) : false;
refresh();                        // 첫 render() — 자동이면 지급액이 자동 계산 값으로 정해진다
if (!got) M.auto = false;         // 주소로 들어온 게 아니면 그 값에서 고정
const man0 = !M.auto;             // 「직접 입력」 쪽이 선택된 채로 시작하는지
refresh();                        // 두 번째 render()

// 문서를 읽는 도중 그 자리에서 다 그린다(flushSync) — 첫 화면이 그려지기 전에 계산기가 채워져 있게.
const root = createRoot(document.getElementById('body') as HTMLElement);
flushSync(() => root.render(<App man0={man0} meet0={!!(got && got.meet)} />));
