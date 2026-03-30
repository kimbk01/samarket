/**
 * 데모: 김치찌개 100₱ + 맵기(필수) + 추가 토핑 + 수량형 공기밥
 * 오너 화면에서 options_json 으로 붙여 넣어 테스트할 수 있는 샘플 구조입니다.
 */
export const SAMPLE_KIMCHI_OPTIONS_JSON = [
  {
    id: "grp_spice",
    nameKo: "맵기",
    description: "필수로 하나 골라 주세요",
    sortOrder: 0,
    inputType: "radio",
    isRequired: true,
    minSelect: 1,
    maxSelect: 1,
    options: [
      { id: "sp_mild", name: "순한맛", priceDelta: 0, soldOut: false, defaultSelected: false },
      { id: "sp_med", name: "보통맛", priceDelta: 0, soldOut: false, defaultSelected: true },
      { id: "sp_hot", name: "매운맛", priceDelta: 0, soldOut: false, defaultSelected: false },
      { id: "sp_xhot", name: "아주매운맛", priceDelta: 10, soldOut: false, defaultSelected: false },
    ],
  },
  {
    id: "grp_extra",
    nameKo: "추가 선택",
    description: "여러 개 선택 가능",
    sortOrder: 1,
    inputType: "checkbox",
    isRequired: false,
    minSelect: 0,
    maxSelect: 5,
    options: [
      { id: "ex_rice", name: "공기밥 추가", priceDelta: 20, soldOut: false, defaultSelected: false },
      { id: "ex_cheese", name: "치즈 추가", priceDelta: 15, soldOut: false, defaultSelected: false },
      { id: "ex_tofu", name: "두부 추가", priceDelta: 10, soldOut: false, defaultSelected: false },
      { id: "ex_egg", name: "계란 추가", priceDelta: 12, soldOut: false, defaultSelected: false },
    ],
  },
  {
    id: "grp_rice_qty",
    nameKo: "추가 공기밥",
    description: "1개당 요금이 붙습니다",
    sortOrder: 2,
    inputType: "quantity",
    isRequired: false,
    minSelect: 0,
    maxSelect: 3,
    options: [{ id: "rq_bowl", name: "공기밥 (1개당)", priceDelta: 20, soldOut: false, defaultSelected: false }],
  },
] as const;

/** 스냅샷 v2 예시 — 주문 2개, 옵션 합 145/개 */
export const SAMPLE_ORDER_OPTIONS_SNAPSHOT_V2 = {
  v: 2,
  summary:
    "맵기: 아주매운맛 (+₱10) · 추가 선택: 공기밥 추가 (+₱20), 치즈 추가 (+₱15) · 추가 공기밥: 공기밥 (1개당) ×2 (+₱40)",
  base_unit_after_discount: 100,
  unit_options_delta: 85,
  line_note: "국물 많이 주세요",
  groups: [
    {
      key: "grp_spice",
      label: "맵기",
      input_type: "radio",
      group_extra: 10,
      lines: [
        { item_key: "sp_xhot", name: "아주매운맛", qty: 1, price_delta_each: 10, line_extra: 10 },
      ],
    },
    {
      key: "grp_extra",
      label: "추가 선택",
      input_type: "checkbox",
      group_extra: 35,
      lines: [
        { item_key: "ex_rice", name: "공기밥 추가", qty: 1, price_delta_each: 20, line_extra: 20 },
        { item_key: "ex_cheese", name: "치즈 추가", qty: 1, price_delta_each: 15, line_extra: 15 },
      ],
    },
    {
      key: "grp_rice_qty",
      label: "추가 공기밥",
      input_type: "quantity",
      group_extra: 40,
      lines: [
        { item_key: "rq_bowl", name: "공기밥 (1개당)", qty: 2, price_delta_each: 20, line_extra: 40 },
      ],
    },
  ],
} as const;
