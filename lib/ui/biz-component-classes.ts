/**
 * 매장 사장님(owner) 화면 — `data-biz="1"` 스코프 + `--biz-*` 토큰.
 * 전역 `--sam-*` 와 분리해 CTA/탭만 #1C8DB8 계열로 통일합니다.
 */
export const Biz = {
  /** 페이지 캔버스 */
  appBg: "bg-[var(--biz-app-bg)]",
  /** 카드 컨테이너 (radius 16, padding 16, 흰/서피스, 약한 shadow) */
  card:
    "rounded-[16px] border border-[var(--biz-card-border)] bg-[var(--biz-card-bg)] p-4 shadow-[var(--biz-card-shadow)]",
  cardCompact: "rounded-[16px] border border-[var(--biz-card-border)] bg-[var(--biz-card-bg)] p-3 shadow-[var(--biz-card-shadow)]",
  /** Primary CTA — height 48~52, radius 14 */
  btnPrimary:
    "inline-flex min-h-[48px] min-w-0 items-center justify-center rounded-[14px] bg-[var(--biz-primary)] px-4 text-[14px] font-semibold text-white shadow-sm transition hover:bg-[var(--biz-primary-hover)] active:bg-[var(--biz-primary-active)] disabled:opacity-50",
  btnPrimaryLg:
    "inline-flex min-h-[52px] min-w-0 items-center justify-center rounded-[14px] bg-[var(--biz-primary)] px-4 text-[15px] font-semibold text-white shadow-sm transition hover:bg-[var(--biz-primary-hover)] active:bg-[var(--biz-primary-active)] disabled:opacity-50",
  btnOutline:
    "inline-flex min-h-[48px] min-w-0 items-center justify-center rounded-[14px] border border-[var(--biz-card-border)] bg-[var(--biz-card-bg)] px-4 text-[14px] font-semibold text-[var(--biz-text)] shadow-sm transition hover:border-[var(--biz-primary)] hover:text-[var(--biz-primary)] disabled:opacity-50",
  /** 탭 underline active */
  tabBase: "min-h-[48px] flex-1 border-b-2 border-transparent pb-2 pt-2 text-center text-[14px] font-medium text-[var(--biz-text-muted)] transition",
  tabActive: "border-[var(--biz-primary)] text-[var(--biz-primary)]",
  textTitle: "text-[20px] font-bold text-[var(--biz-text)]",
  textCardTitle: "text-[16px] font-semibold text-[var(--biz-text)]",
  textBody: "text-[14px] text-[var(--biz-text)]",
  textMuted: "text-[14px] text-[var(--biz-text-muted)]",
  /** 신규 주문 카드 좌측 강조 */
  newOrderAccent: "border-l-[4px] border-l-[var(--biz-primary)]",
} as const;
