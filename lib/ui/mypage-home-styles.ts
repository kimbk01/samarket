import { MAIN_BOTTOM_NAV_ORBIT_BODY_CLEARANCE_CLASS } from "@/lib/layout/main-bottom-nav-hub-clearance";
import { MYPAGE_GUTTER_X_CLASS } from "@/lib/ui/mypage-responsive-breakpoints";


/** 내정보 홈 — 프로필 편집과 동일 크림 배경 */
export const MYPAGE_HOME_PAGE_BG_CLASS = "min-h-0 bg-sam-app";

/** 내정보 홈 — 하단 탭 clearance(`MAIN_BOTTOM_NAV_ORBIT_BODY_CLEARANCE_CLASS`) re-export */
export { MAIN_BOTTOM_NAV_ORBIT_BODY_CLEARANCE_CLASS as MYPAGE_HOME_BOTTOM_NAV_CLEARANCE_CLASS };

/**
 * 내정보 홈 본문 — 창 전체 폭 (가로 폭 감사 B2, Owner 2026-11-16 「둘 다 진행」). 예전 40rem 1열은 태블릿 가로·Mac 에서
 * 좌우 빈 띠(태블릿 실측 좌우 각 203px)를 만들었다. 넓은 화면 배치는 `MYPAGE_HOME_WIDE_FLOW_CLASS`(md 2열)가 맡는다.
 * 하위 화면(`MyScreen`)은 B3 — 내용 폭 40rem 유지, 배경만 창 전체.
 * 하단 여백은 clearance + 셸 `pb-0` 로 한 번만.
 */
export const MYPAGE_HOME_BODY_CLASS =
  `mx-auto w-full min-w-0 max-w-none ${MYPAGE_GUTTER_X_CLASS} pt-2 ${MAIN_BOTTOM_NAV_ORBIT_BODY_CLEARANCE_CLASS}`;

/**
 * 내정보 홈 카드 흐름 — 휴대폰 1열(기존 `MYPAGE_HOME_MENU_FLOW_CLASS` 와 같음), 768 이상 2열 격자.
 * 프로필·필수 정보는 나란히, 세 번째 칸부터(지금 상태 줄·배너·메뉴 격자)와 하나뿐인 카드(재로그인)는 한 줄 전체.
 */
export const MYPAGE_HOME_WIDE_FLOW_CLASS =
  "flex w-full min-w-0 flex-col gap-2 md:grid md:grid-cols-2 md:items-start md:[&>*:nth-child(n+3)]:col-span-2 md:[&>*:only-child]:col-span-2";

export const MYPAGE_HOME_CARD_CLASS =
  "overflow-hidden rounded-ui-rect border border-sam-border-soft bg-sam-surface";

/** 프로필 카드 — 대표 주소 행과 동일 좌측 그린 액센트 */
export const MYPAGE_HOME_PROFILE_CARD_CLASS =
  "overflow-hidden rounded-ui-rect border border-sam-primary/22 bg-sam-surface shadow-[inset_3px_0_0_0_var(--sam-primary)]";

export const MYPAGE_HOME_SECTION_LABEL_CLASS =
  "text-[11px] font-bold uppercase tracking-[0.08em] text-sam-muted";

export const MYPAGE_HOME_SECTION_HEADER_CLASS =
  "border-b border-sam-border-soft px-4 py-2.5 md:px-5";

export const MYPAGE_HOME_PROFILE_NAME_CLASS =
  "text-[20px] font-bold leading-tight tracking-tight text-sam-fg";

export const MYPAGE_HOME_HANDLE_CLASS =
  "font-mono text-[12px] font-medium leading-snug tabular-nums text-sam-muted/90";

export const MYPAGE_HOME_BODY_TEXT_CLASS =
  "text-[13px] font-normal leading-snug text-sam-muted";

export const MYPAGE_HOME_MENU_TITLE_CLASS = "truncate text-[15px] font-semibold leading-snug text-sam-fg";

export const MYPAGE_HOME_META_TEXT_CLASS =
  "text-[14px] font-medium leading-snug text-sam-muted";

export const MYPAGE_HOME_STAT_LABEL_CLASS =
  "line-clamp-2 text-[11px] font-semibold uppercase tracking-wide text-sam-muted";

export const MYPAGE_HOME_STAT_VALUE_CLASS =
  "mt-1 text-[18px] font-bold leading-tight tabular-nums text-sam-fg";

export const MYPAGE_HOME_STAT_VALUE_ACCENT_CLASS =
  "mt-1 text-[18px] font-bold leading-tight tabular-nums text-sam-primary";

export const MYPAGE_HOME_ROW_CLASS =
  "flex min-h-[52px] w-full min-w-0 items-center gap-3 px-4 transition-colors hover:bg-sam-app/60 active:bg-sam-pressed-surface md:px-5";

/** 매장 CTA 등 — Overlay pressed scale 0.98 정렬 */
export const MYPAGE_HOME_ROW_PRESS_CLASS =
  "touch-manipulation transition-transform duration-100 ease-out active:scale-[0.98] motion-reduce:transition-none motion-reduce:active:scale-100";

/** 매장 진입 탭 직후~라우트 전환 전 선택(armed) 톤 */
export const MYPAGE_HOME_ROW_ARMED_CLASS = "bg-sam-pressed-surface";

export const MYPAGE_HOME_ROW_DIVIDER_CLASS = "border-t border-sam-border-soft";

export const MYPAGE_HOME_ICON_WRAP_CLASS =
  "flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-sam-icon-surface text-sam-primary";

export const MYPAGE_HOME_CHEVRON_CLASS = "h-[18px] w-[18px] shrink-0 text-sam-muted/45";

export const MYPAGE_HOME_ADDRESS_ROW_CLASS =
  "flex w-full min-w-0 items-start gap-2 rounded-ui-rect border border-sam-primary/18 bg-sam-pressed-surface/70 px-3 py-2.5 text-left transition-colors hover:border-sam-primary/30 hover:bg-sam-pressed-surface active:bg-sam-icon-surface/80";

export const MYPAGE_HOME_CARD_PAD_CLASS = "p-4 md:p-5";

export const MYPAGE_HOME_CARD_FOOTER_CLASS =
  "flex min-h-[52px] items-stretch gap-2 border-t border-sam-border-soft px-4 py-3 md:px-5";

export const MYPAGE_HOME_OUTLINE_BTN_CLASS =
  "inline-flex min-h-[40px] flex-1 items-center justify-center rounded-ui-rect border border-sam-primary/25 bg-sam-surface px-3 text-[13px] font-semibold text-sam-primary transition-colors hover:bg-sam-pressed-surface active:bg-sam-icon-surface";

export const MYPAGE_HOME_GHOST_BTN_CLASS =
  "inline-flex min-h-[40px] flex-1 items-center justify-center gap-1.5 rounded-ui-rect px-3 text-[13px] font-medium text-sam-muted transition-colors hover:bg-sam-app hover:text-sam-danger active:bg-sam-surface-muted";

export const MYPAGE_HOME_DANGER_TEXT_CLASS = "text-sam-danger";

export const MYPAGE_HOME_STAT_GRID_CLASS = "grid grid-cols-2 gap-px bg-sam-icon-surface/60 md:grid-cols-5";

export const MYPAGE_HOME_QUICK_GRID_CLASS = "grid grid-cols-5 gap-px bg-sam-icon-surface/60";

export const MYPAGE_HOME_QUICK_ICON_CELL_CLASS =
  "flex min-h-[88px] flex-col items-center justify-center gap-1.5 bg-sam-surface px-1 py-3 text-center transition-colors hover:bg-sam-app/50 active:bg-sam-pressed-surface";

export const MYPAGE_HOME_QUICK_ICON_WRAP_CLASS =
  "flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-sam-icon-surface text-sam-primary";

export const MYPAGE_HOME_QUICK_ICON_LABEL_CLASS =
  "line-clamp-2 text-[10px] font-semibold leading-tight text-sam-fg";

export const MYPAGE_HOME_STAT_CELL_CLASS =
  "flex min-h-[76px] flex-col justify-center bg-sam-surface px-3 py-3 transition-colors hover:bg-sam-app/50 active:bg-sam-pressed-surface";

/** 내정보 홈 — 언어 세그먼트(한글/English) */
export const MYPAGE_HOME_SEGMENT_WRAP_CLASS =
  "inline-flex shrink-0 rounded-ui-rect border border-sam-primary/18 bg-sam-app p-0.5";

export const MYPAGE_HOME_SEGMENT_BTN_CLASS =
  /** 터치 영역 44px 이상 (S12) */
  "min-h-[44px] min-w-[56px] rounded-ui-rect px-2.5 text-[12px] font-semibold leading-none transition-colors";

/** 주 버튼 위 글자 = `--sam-icon-on-primary`(크림) — `text-white` 하드코딩 제거(§1.1) */
export const MYPAGE_HOME_SEGMENT_BTN_ACTIVE_CLASS = "bg-sam-primary text-[var(--sam-icon-on-primary)] shadow-sm";

export const MYPAGE_HOME_SEGMENT_BTN_INACTIVE_CLASS = "text-sam-muted hover:bg-sam-surface/70 hover:text-sam-fg";
