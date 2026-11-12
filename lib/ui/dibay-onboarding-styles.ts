import { OverlayUi } from "@/lib/ui/dibay-overlay-contract";
import { MYPAGE_HOME_OUTLINE_BTN_CLASS } from "@/lib/ui/mypage-home-styles";

/**
 * 인증 온보딩(약관·@아이디) 화면 전용 — 전역 `--sam-*` 토큰만 사용 (P2-15 UX: 브랜드 팔레트 제거).
 * 파일명은 import 경로 호환을 위해 유지한다.
 */
export const DIBAY_ONBOARDING_PAGE_BG_CLASS = "min-h-screen bg-sam-app";

/** 온보딩 팝업 제목·설명·안내·오류 = 팝업 SSOT 글자·색 (다크모드에도 흰 팝업 위 고정색) — 팝업 SSOT T2 */
export const DIBAY_ONBOARDING_TITLE_CLASS = OverlayUi.title;

export const DIBAY_ONBOARDING_DESC_CLASS = `${OverlayUi.body} ${OverlayUi.bodySecondary} !mt-2`;

export const DIBAY_ONBOARDING_STEP_BADGE_CLASS =
  "inline-flex min-h-[24px] items-center justify-center rounded-full bg-sam-primary-soft px-2.5 text-[11px] font-bold tracking-wide text-sam-primary";

export const DIBAY_ONBOARDING_NOTICE_CLASS =
  "rounded-[length:var(--overlay-radius-md)] border border-[color:color-mix(in_srgb,var(--overlay-primary)_20%,transparent)] bg-[color:var(--sm-color-primary-soft)] px-4 py-3 text-[length:var(--overlay-body-2-size)] leading-snug text-[color:var(--overlay-text-primary)]";

export const DIBAY_ONBOARDING_CHECKBOX_PANEL_CLASS =
  "space-y-3 rounded-ui-rect border border-sam-border bg-sam-surface-muted p-4";

export const DIBAY_ONBOARDING_INPUT_CLASS =
  "min-h-[44px] flex-1 rounded-ui-rect border border-sam-border bg-sam-surface px-3 text-[15px] text-sam-fg outline-none transition-shadow placeholder:text-sam-meta focus:border-sam-primary focus:ring-2 focus:ring-sam-primary/15";

/** 온보딩 팝업(약관·@ID) 주 버튼 = 팝업 SSOT 주 버튼 (48 · 반경 12 · 15/600 · 다크모드 고정색) — 팝업 SSOT T2 */
export const DIBAY_ONBOARDING_PRIMARY_BTN = `${OverlayUi.btn.primary} !flex-none`;

export const DIBAY_ONBOARDING_SECONDARY_BTN = `${MYPAGE_HOME_OUTLINE_BTN_CLASS} min-h-[44px] shrink-0 px-3 text-[13px]`;

export const DIBAY_ONBOARDING_CONSENT_DONE_CLASS =
  "flex items-center justify-center gap-1.5 rounded-ui-rect border border-sam-primary-border bg-sam-primary-soft px-3 py-2 text-[12px] font-medium text-sam-primary";

/** 약관 화면 본문 라벨·링크·오류 — sam 토큰 */
export const DIBAY_ONBOARDING_LABEL_CLASS = "text-[14px] leading-snug text-sam-fg";
export const DIBAY_ONBOARDING_LINK_CLASS = "font-medium text-sam-primary underline";
export const DIBAY_ONBOARDING_CHECKBOX_CLASS = "mt-1 h-4 w-4 accent-[var(--sam-primary)]";
export const DIBAY_ONBOARDING_ERROR_CLASS = `${OverlayUi.caption} !text-[color:var(--overlay-danger)]`;
