/** 한 품목의 살 수 있는 상품 하나. */
export interface Option {
  t: string;   // 상품 이름
  s: string;   // 규격·사양
  p: number;   // 단가(원)
  u?: string;  // 구매 링크
  d?: 1;       // 권장 상품
}

/** 데이터에 적힌 그대로의 품목. */
export interface ItemData {
  g: string;        // 구분(공통 / ① … ④ 부스 이름)
  n: string;        // 품목 이름
  q: number;        // 권장 수량
  note?: string;    // 제품 고르기 창의 부제
  off?: 1;          // 처음에 꺼 둔다
  use?: number[];   // 공통 품목을 나눠 쓰는 부스(booths 의 번호)
  up?: number;      // 한 개에 든 낱개 수(부스로 나눌 때 곱한다)
  du?: string;      // 부스 몫의 단위(기본 '개')
  o: Option[];
}

/** 화면에서 쓰는 품목 — 데이터에 켜짐·선택·수량·부스 몫을 더한 것. */
export interface Item extends ItemData {
  on: boolean;
  sel: number;
  qty: number;
  id: number;
  sh?: Record<number, number>;  // 부스별 몫(use 가 있을 때만)
  lastQ?: number;               // 몫을 마지막으로 나눌 때의 수량
}

/** 협의회비 설정. */
export interface Meet {
  n: number;      // 인원
  c: number;      // 횟수
  cap: number;    // 인당 상한
  unit: number;   // 절사 단위(500·1000)
  auto: boolean;  // 지급액을 자동 계산으로 따라가게 둘지
  per: number;    // 인당 지급액
}
