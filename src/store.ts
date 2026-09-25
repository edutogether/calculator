/* 모델(model.ts 의 M·D)은 평범한 객체로 두고, 바뀔 때마다 판 번호를 올려 React 가 다시 그리게 한다.
 * commit() 은 전환 전 render() 자리 — 모델 쪽 부수효과(refresh)를 한 번 돌리고 알린다.
 * React 쪽은 useSyncExternalStore 로 이 번호를 구독한다. */
import { refresh } from './model.ts';

let version = 0;
const subs = new Set<() => void>();

export function subscribe(f: () => void): () => void {
  subs.add(f);
  return () => { subs.delete(f); };
}
export const getVersion = (): number => version;

export function commit(): void {
  refresh();
  version++;
  subs.forEach(f => f());
}
