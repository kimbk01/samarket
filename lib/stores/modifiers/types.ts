/** 매장 상품 옵션(Modifier) — JSON·API·장바구니 공통 타입 */

export type ModifierInputType = "radio" | "checkbox" | "select" | "quantity";

export type ParsedModifierItem = {
  /** 안정 키(저장·수량 맵에 사용) */
  key: string;
  name: string;
  priceDelta: number;
  soldOut: boolean;
  defaultSelected: boolean;
};

export type ParsedOptionGroup = {
  key: string;
  label: string;
  description: string;
  sortOrder: number;
  inputType: ModifierInputType;
  /** true면 minSelect 이상 필수 */
  isRequired: boolean;
  minSelect: number;
  maxSelect: number;
  options: ParsedModifierItem[];
  /** 라이브러리 그룹 연결 시 */
  templateGroupId?: string;
};

/** UI·API 와이어 — pick: 다중 선택 그룹, qty: 수량형 그룹 */
export type ModifierSelectionsWire = {
  pick: Record<string, string[]>;
  qty: Record<string, Record<string, number>>;
};

export type OrderLineOptionsSnapshotV1 = {
  v: 1;
  summary: string;
  unit_options_delta: number;
  groups: { key: string; label: string; names: string[]; delta: number }[];
};

export type OrderLineOptionsSnapshotV2 = {
  v: 2;
  summary: string;
  /** 할인 적용 후 본품 단가(옵션 제외) */
  base_unit_after_discount: number;
  unit_options_delta: number;
  /** 라인 메모(가격 무관) — 주문 API에서 병합 */
  line_note?: string | null;
  groups: {
    key: string;
    label: string;
    input_type: ModifierInputType;
    lines: {
      item_key: string;
      name: string;
      qty: number;
      price_delta_each: number;
      line_extra: number;
    }[];
    group_extra: number;
  }[];
};
