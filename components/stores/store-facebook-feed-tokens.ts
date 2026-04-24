/**
 * 매장 피드 레거시 export.
 * 전역 `sam-*` 토큰만 사용해 다른 화면과 동일한 표면을 유지한다.
 */
export const FB = {
  canvas: "bg-sam-app",
  card: "sam-card",
  cardFlat: "sam-card",
  name: "sam-text-card-title",
  body: "sam-text-body",
  meta: "sam-text-helper",
  metaSm: "sam-text-xxs",
  link: "font-medium text-sam-primary",
  divider: "border-sam-border",
  hairline: "border-sam-border",
  searchWell: "rounded-sam-md border border-sam-border bg-sam-surface",
  primaryBtn: "sam-btn-primary",
  secondaryBtn: "sam-btn-secondary",
} as const;
