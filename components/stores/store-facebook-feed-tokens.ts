/**
 * 매장 피드·카드 UI — delivery / dibay 토큰 단일 소스.
 * Facebook-blue·회색 hex 직접 사용 금지 — 이 파일 또는 `stores-home-ui` 경유.
 */
export const FB = {
  canvas: "bg-[color:var(--delivery-bg)] text-[color:var(--delivery-text-main)]",
  card: "rounded-[var(--delivery-radius)] border border-[color:var(--delivery-border)] bg-[color:var(--delivery-bg-card)]",
  cardFlat:
    "rounded-[var(--delivery-radius)] border border-[color:var(--delivery-border)] bg-[color:var(--delivery-bg-card)]",
  name: "text-[18px] font-bold leading-[var(--delivery-lh-section-title)] text-[color:var(--delivery-text-main)]",
  body: "text-[14px] font-normal leading-[var(--delivery-lh-body)] text-[color:var(--delivery-text-main)]",
  meta: "text-[13px] font-normal leading-[var(--delivery-lh-sub)] text-[color:var(--delivery-text-sub)]",
  metaSm: "text-[12px] font-medium leading-[var(--delivery-lh-caption)] text-[color:var(--delivery-text-muted)]",
  link: "font-semibold text-[color:var(--delivery-primary)]",
  divider: "border-[color:var(--delivery-border)]",
  hairline: "border-[color:var(--delivery-border)]",
  searchWell:
    "h-12 rounded-[var(--delivery-radius-pill)] border border-[color:var(--delivery-border)] bg-[color:var(--delivery-bg-card)]",
  primaryBtn: "delivery-btn-primary",
  secondaryBtn: "delivery-btn-outline",

  /** 카드 터치·프레스 */
  cardPress: "active:bg-[color:var(--delivery-bg-soft)]",

  /** 프로필/메뉴 썸네일 타일 */
  menuTile: "rounded-[10px] bg-[color:var(--delivery-bg-thumb)]",
  menuTileMore:
    "rounded-[10px] bg-[color:var(--delivery-bg-soft)] text-[color:var(--delivery-text-main)] transition-[transform,opacity,background-color] duration-120 active:scale-[0.98] active:bg-[color:var(--delivery-bg-muted)]",

  /** 이미지 없을 때 플레이스홀더 — dibay green */
  placeholderHero:
    "flex h-full w-full items-center justify-center bg-[color:var(--delivery-primary)] text-[color:var(--dibay-cream)]",
  thumbMuted: "bg-[color:var(--delivery-bg-thumb)]",

  /** 배지 */
  badgeFeatured:
    "rounded-ui-rect bg-[color:var(--delivery-bg-card)]/95 px-2 py-0.5 sam-text-xxs font-semibold text-[color:var(--delivery-primary)] shadow-sm",
  badgeNeutral:
    "rounded-ui-rect bg-[color:var(--delivery-bg-card)]/95 px-2 py-0.5 sam-text-xxs font-semibold text-[color:var(--delivery-text-main)] shadow-sm",
  chip:
    "rounded-ui-rect bg-[color:var(--delivery-bg-soft)] px-2 py-0.5 sam-text-xxs font-semibold text-[color:var(--delivery-text-sub)]",

  /** 평점·거리·배달비 */
  ratingStar: "text-[color:var(--dibay-gold)]",
  ratingValue: "font-semibold text-[color:var(--delivery-text-main)]",
  ratingCount: "text-[13px] font-medium text-[color:var(--delivery-text-muted)]",
  distance: "font-semibold text-[color:var(--delivery-primary)]",
  freeDelivery: "font-semibold text-[color:var(--delivery-primary)]",
  strike: "text-[13px] font-medium text-[color:var(--delivery-text-muted)] line-through",
  priceStrong: "shrink-0 font-semibold text-[color:var(--delivery-text-main)]",

  /** 메타 행(시간·거리·최소주문) */
  metaRow: "text-[12.5px] leading-snug text-[color:var(--delivery-text-sub)]",
  metaStrong: "font-medium text-[color:var(--delivery-text-sub)]",
  metaDot: "shrink-0 text-[color:var(--delivery-text-muted)]",
  metaPayment:
    "line-clamp-2 sam-text-xxs font-medium leading-snug text-[color:var(--delivery-text-muted)]",
  metaPaymentLabel: "font-semibold text-[color:var(--delivery-text-sub)]",

  /** 리스트 행 active */
  rowActive: "active:bg-[color:var(--delivery-bg-soft)]",
} as const;
