/** 관리자 UI — 라벨 폰트 패밀리 (Tailwind) */
export const MAIN_BOTTOM_NAV_FONT_FAMILY_PRESETS: { value: string; label: string }[] = [
  { value: "", label: "기본(시스템)" },
  { value: "font-sans", label: "고딕(sans)" },
  { value: "font-serif", label: "명조(serif)" },
  { value: "font-mono", label: "고정폭(mono)" },
];

/** 라벨 글자 크기 */
export const MAIN_BOTTOM_NAV_LABEL_SIZE_PRESETS: { value: string; label: string }[] = [
  { value: "", label: "기본(11px)" },
  { value: "sam-text-xxs", label: "10–11px" },
  { value: "text-xs", label: "12px(xs)" },
  { value: "text-sm", label: "14px(sm)" },
];

/** 활성 라벨 — 굵기+색 (한 클래스 문자열) */
export const MAIN_BOTTOM_NAV_LABEL_ACTIVE_STYLE_PRESETS: { value: string; label: string }[] = [
  { value: "", label: "기본(브랜드)" },
  { value: "font-medium text-signature", label: "브랜드 보라·중간" },
  { value: "font-semibold text-signature", label: "브랜드 보라·굵게" },
  { value: "font-medium text-gray-900", label: "검정·중간" },
  { value: "font-semibold text-gray-900", label: "검정·굵게" },
  { value: "font-medium text-emerald-600", label: "초록·중간" },
  { value: "font-medium text-blue-600", label: "파랑·중간" },
  { value: "font-medium text-rose-600", label: "빨강·중간" },
];

/** 비활성 라벨 색 */
export const MAIN_BOTTOM_NAV_LABEL_INACTIVE_STYLE_PRESETS: { value: string; label: string }[] = [
  { value: "", label: "기본(#999)" },
  { value: "text-[#999999]", label: "당근형 회색" },
  { value: "text-gray-400", label: "연한 회색" },
  { value: "text-gray-500", label: "회색" },
  { value: "text-gray-600", label: "진한 회색" },
];

/** 아이콘 활성 색 */
export const MAIN_BOTTOM_NAV_ICON_ACTIVE_STYLE_PRESETS: { value: string; label: string }[] = [
  { value: "", label: "기본(브랜드)" },
  { value: "text-signature", label: "브랜드 보라" },
  { value: "text-gray-900", label: "검정" },
  { value: "text-emerald-600", label: "초록" },
  { value: "text-blue-600", label: "파랑" },
];

/** 아이콘 비활성 색 */
export const MAIN_BOTTOM_NAV_ICON_INACTIVE_STYLE_PRESETS: { value: string; label: string }[] = [
  { value: "", label: "기본(gray-400)" },
  { value: "text-gray-300", label: "아주 연함" },
  { value: "text-gray-400", label: "연함" },
  { value: "text-gray-500", label: "보통" },
];
