/**
 * 매장 피드 레거시 export.
 * 전역 `sam-*` 토큰만 사용해 다른 화면과 동일한 표면을 유지한다.
 */
export const FB = {
  canvas: "bg-[color:var(--delivery-bg)] text-[color:var(--delivery-text-main)]",
  card: "rounded-[var(--delivery-radius)] border border-[color:var(--delivery-border)] bg-[color:var(--delivery-bg-card)]",
  cardFlat: "rounded-[var(--delivery-radius)] border border-[color:var(--delivery-border)] bg-[color:var(--delivery-bg-card)]",
  name: "text-[18px] font-bold leading-[var(--delivery-lh-section-title)] text-[color:var(--delivery-text-main)]",
  body: "text-[14px] font-normal leading-[var(--delivery-lh-body)] text-[color:var(--delivery-text-main)]",
  meta: "text-[13px] font-normal leading-[var(--delivery-lh-sub)] text-[color:var(--delivery-text-sub)]",
  metaSm: "text-[12px] font-medium leading-[var(--delivery-lh-caption)] text-[color:var(--delivery-text-muted)]",
  link: "font-semibold text-[color:var(--delivery-primary)]",
  divider: "border-[color:var(--delivery-border)]",
  hairline: "border-[color:var(--delivery-border)]",
  searchWell: "h-12 rounded-[var(--delivery-radius-pill)] border border-[#dcdcdc] bg-white",
  primaryBtn: "delivery-btn-primary",
  secondaryBtn: "delivery-btn-outline",
} as const;
