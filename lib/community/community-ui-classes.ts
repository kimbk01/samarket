/** 필라이프 커뮤니티 UI — `data-community-ui` 스코프 CSS 변수 기반 */

export const CM_PAGE_CLASS = "cm-page min-h-screen bg-[var(--cm-page-bg)] text-[var(--cm-text)]";

export const CM_CARD_CLASS =
  "overflow-hidden rounded-[var(--cm-radius-card)] border border-[var(--cm-border)] bg-[var(--cm-card-bg)] shadow-[var(--cm-shadow-card)]";

export const CM_CARD_PAD_CLASS = "px-[18px] py-5 sm:px-5";

export const CM_FEED_CARD_CLASS = `${CM_CARD_CLASS} px-4 py-4 sm:px-[18px] sm:py-4`;

export const CM_FEED_LIST_GAP = "space-y-4";

export const CM_TITLE_CLASS =
  "border-b border-[var(--cm-border)] pb-3 text-[length:var(--cm-font-page-title)] font-bold leading-snug text-[var(--cm-text)]";

export const CM_BODY_CLASS =
  "mt-3 whitespace-pre-wrap text-[length:var(--cm-font-body)] font-normal leading-[var(--cm-lh-body)] text-[var(--cm-text-secondary)]";

export const CM_META_CLASS =
  "text-[length:var(--cm-font-meta)] font-normal leading-[1.4] text-[var(--cm-text-muted)]";

export const CM_AUTHOR_NAME_CLASS =
  "truncate text-[length:var(--cm-font-author)] font-semibold leading-snug text-[var(--cm-text)]";

export const CM_AUTHOR_HANDLE_CLASS =
  "truncate text-[length:var(--cm-font-handle)] font-medium text-[var(--cm-text-muted)]";

export const CM_BTN_TEXT_CLASS =
  "text-[length:var(--cm-font-button)] font-semibold leading-none";

export const CM_COMMENT_BODY_CLASS =
  "break-words text-[length:var(--cm-font-comment)] font-normal leading-[var(--cm-lh-comment)] text-[var(--cm-text)]";

export const CM_INPUT_CLASS =
  "min-h-11 w-full min-w-0 flex-1 rounded-[var(--cm-radius-input)] border border-[var(--cm-border)] bg-[var(--cm-card-bg)] px-4 py-2.5 text-[length:var(--cm-font-body)] text-[var(--cm-text)] outline-none placeholder:text-[var(--cm-text-muted)] focus:border-[var(--cm-primary)] focus:ring-1 focus:ring-[color-mix(in_srgb,var(--cm-primary)_25%,transparent)]";

/** 댓글·답글 한 줄 입력 — 40px 행, 상하 패딩 대칭으로 플레이스홀더/캐럿 세로 중앙 */
export const CM_COMMENT_COMPOSER_FIELD_CLASS =
  "box-border min-h-10 w-full min-w-0 flex-1 rounded-[var(--cm-radius-input)] border border-[var(--cm-border)] bg-[var(--cm-page-bg)] px-3.5 py-[9px] text-[length:var(--cm-font-body)] leading-5 text-[var(--cm-text)] outline-none placeholder:text-[var(--cm-text-muted)] focus:border-[var(--cm-primary)] focus:ring-1 focus:ring-[color-mix(in_srgb,var(--cm-primary)_25%,transparent)]";

export const CM_TEXTAREA_CLASS =
  "min-h-[10rem] w-full resize-y rounded-[var(--cm-radius-card)] border border-[var(--cm-border)] bg-[var(--cm-card-bg)] px-4 py-3 text-[length:var(--cm-font-body)] leading-[var(--cm-lh-body)] text-[var(--cm-text)] outline-none placeholder:text-[var(--cm-text-muted)] focus:border-[var(--cm-primary)] focus:ring-1 focus:ring-[color-mix(in_srgb,var(--cm-primary)_25%,transparent)]";

export const CM_BTN_PRIMARY_CLASS =
  "inline-flex items-center justify-center rounded-[var(--cm-radius-cta)] bg-[var(--cm-primary)] px-5 py-3 text-[length:var(--cm-font-button)] font-semibold text-white transition-colors hover:bg-[var(--cm-primary-hover)] disabled:cursor-not-allowed disabled:opacity-50";

export const CM_BTN_PILL_PRIMARY_CLASS =
  "inline-flex min-h-10 items-center justify-center rounded-full bg-[var(--cm-primary)] px-5 text-[length:var(--cm-font-button)] font-semibold text-white transition-colors hover:bg-[var(--cm-primary-hover)] disabled:opacity-50";

export const CM_BTN_GHOST_CLASS =
  "inline-flex items-center justify-center rounded-[var(--cm-radius-cta)] border border-[var(--cm-border)] bg-[var(--cm-card-bg)] px-4 py-2.5 text-[length:var(--cm-font-button)] font-semibold text-[var(--cm-text-secondary)]";

export const CM_SEGMENT_IDLE_CLASS =
  "rounded-full px-3 py-1.5 text-[13px] font-semibold text-[var(--cm-text-secondary)] transition-colors";

export const CM_SEGMENT_ACTIVE_CLASS =
  "rounded-full bg-[var(--cm-primary-soft)] px-3 py-1.5 text-[13px] font-semibold text-[var(--cm-primary)]";

export const CM_ACTION_BAR_BTN_CLASS =
  "flex flex-1 items-center justify-center gap-1.5 border-0 bg-transparent text-[length:var(--cm-font-button)] font-semibold text-[var(--cm-text-secondary)] transition-colors disabled:opacity-50";

export const CM_ACTION_BAR_BTN_ACTIVE_CLASS =
  "flex flex-1 items-center justify-center gap-1.5 border-0 bg-transparent text-[length:var(--cm-font-button)] font-semibold text-[var(--cm-primary)] transition-colors disabled:opacity-50";

export const CM_NEIGHBOR_PROMPT_CLASS =
  "rounded-[var(--cm-radius-card)] border border-[color-mix(in_srgb,var(--cm-primary)_18%,var(--cm-border))] bg-[var(--cm-primary-soft)] px-4 py-3.5";

export const CM_STICKY_HEADER_CLASS =
  "sticky top-0 z-30 border-b border-[var(--cm-border)] bg-[var(--cm-card-bg)]/95 backdrop-blur-sm pt-[var(--safe-top)]";

export const CM_CHIP_IDLE_CLASS =
  "shrink-0 rounded-full border border-[var(--cm-border)] bg-[var(--cm-card-bg)] px-3.5 py-2 text-[13px] font-semibold text-[var(--cm-text-secondary)]";

export const CM_CHIP_ACTIVE_CLASS =
  "shrink-0 rounded-full border border-[var(--cm-primary)] bg-[var(--cm-primary)] px-3.5 py-2 text-[13px] font-semibold text-white";

export const CM_STICKY_CTA_CLASS =
  "sticky bottom-0 z-20 border-t border-[var(--cm-border)] bg-[var(--cm-card-bg)] px-4 pb-[max(1rem,var(--safe-bottom))] pt-3";
