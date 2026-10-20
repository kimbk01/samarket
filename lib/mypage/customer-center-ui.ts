/**
 * Customer Center visual tokens — 내정보 디자인 SSOT(`app/design-tokens.css` `--sam-*`) 참조만.
 * Presentation only. Does not change content / campaign / notification authority.
 *
 * 최종 설계 S60(Part D §1.2): hex 직접 값 금지 — 시그니처 `--sam-primary`, 아이콘 원 `--sam-icon-surface`,
 * 눌림·선택 `--sam-pressed-surface`, 글자 `--sam-text-primary`/`--sam-text-secondary`, 구분선 `--sam-border-soft`,
 * 화면에 붙은 카드·섹션·칩 = `rounded-ui-rect`(4px), 원·pill 만 `rounded-full`. 카드 그림자 없음(v2 §7.2).
 */

export const CC_PRIMARY = "var(--sam-primary)";
export const CC_SECONDARY = "var(--sam-primary-hover)";
export const CC_BG = "var(--sam-pressed-surface)";
export const CC_SURFACE = "var(--sam-bg-surface)";
export const CC_TEXT = "var(--sam-text-primary)";
export const CC_TEXT_SECONDARY = "var(--sam-text-secondary)";
export const CC_BORDER = "var(--sam-border-soft)";

export const CC_PAGE_BG_CLASS = "bg-sam-app";
/** 화면 배경 — 내정보 공통 크림(`bg-sam-app`) */
export const CC_SURFACE_PAGE_CLASS = "bg-sam-app";
export const CC_PAGE_WHITE_CLASS = "bg-sam-app";
/** 허브 인사 영역 — 흰 서피스 + 옅은 테두리(그림자 없음) */
export const CC_HERO_SECTION_CLASS =
  "rounded-ui-rect border border-sam-border-soft bg-sam-surface px-4 py-8 text-center";
export const CC_CARD_CLASS = "overflow-hidden rounded-ui-rect border border-sam-border-soft bg-sam-surface";
export const CC_TITLE_CLASS = "text-[18px] font-semibold leading-snug text-sam-fg";
export const CC_HEADER_CLASS = "text-[16px] font-semibold leading-snug text-sam-fg";
export const CC_BODY_CLASS = "text-[14px] font-normal leading-relaxed text-sam-fg";
export const CC_NOTE_CLASS = "text-[12px] font-normal leading-snug text-sam-muted";
/** 게시판 전환 칩 — 선택 = 연그린 + 그린 테두리(v2.1 §3.3) */
export const CC_PILL_ACTIVE_CLASS =
  "rounded-full border border-sam-primary bg-sam-pressed-surface px-3 py-1.5 text-[12px] font-semibold text-sam-primary";
export const CC_PILL_IDLE_CLASS =
  "rounded-full border border-sam-border-soft bg-sam-surface px-3 py-1.5 text-[12px] font-semibold text-sam-muted";
export const CC_CATEGORY_CHIP_CLASS =
  "inline-flex items-center rounded-ui-rect bg-sam-pressed-surface px-1.5 py-0.5 text-[11px] font-semibold text-sam-primary";
export const CC_ICON_WELL_CLASS =
  "flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-sam-icon-surface text-sam-primary";
export const CC_PRIMARY_BTN_CLASS =
  "inline-flex min-h-11 w-full items-center justify-center rounded-ui-rect bg-sam-primary px-4 text-[14px] font-semibold text-[color:var(--sam-icon-on-primary)] disabled:opacity-45";
export const CC_SECONDARY_BTN_CLASS =
  "inline-flex min-h-11 items-center justify-center rounded-ui-rect bg-sam-pressed-surface px-4 text-[14px] font-semibold text-sam-primary";
