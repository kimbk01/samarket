/** DIBAY Call UI 2026 — Web presentation tokens (mirrors `app/samarket-components.css` :root). */
export const CALL_UI_PRIMARY = "#00754A";
export const CALL_UI_PRIMARY_PRESSED = "#006241";
export const CALL_UI_BACKGROUND = "#FFFFFF";
export const CALL_UI_DARK_BG = "#121212";
export const CALL_UI_DARK_CARD = "#1F1F1F";
export const CALL_UI_DANGER = "#D93025";

export const CALL_UI_BUTTON_SIZE_PX = 56;
export const CALL_UI_BUTTON_SIZE_MIN_PX = 52;
export const CALL_UI_BUTTON_SIZE_MAX_PX = 64;
export const CALL_UI_BUTTON_GAP_PX = 12;
export const CALL_UI_TOUCH_MIN_PX = 48;

/** Foreground compact incoming call banner — 2026 Starbucks palette. */
export const INCOMING_CALL_PRIMARY_HEX = CALL_UI_PRIMARY;
export const INCOMING_CALL_BANNER_BG_CLASS = "bg-[#00754A]";
export const INCOMING_CALL_BANNER_BORDER_CLASS = "border-[#006241]/40";

/**
 * DIBAY Call in-app notice — same geometry/token family as IncomingCallBanner.
 * Product SSOT for transient Call notices (not full call shells).
 */
export const CALL_IN_APP_NOTICE_RADIUS_CLASS = "rounded-[20px]";
export const CALL_IN_APP_NOTICE_HEIGHT_CLASS = "min-h-[72px] sm:min-h-[76px]";
export const CALL_IN_APP_NOTICE_SHADOW_CLASS = "shadow-[0_8px_24px_rgba(0,0,0,0.2)]";
export const CALL_IN_APP_NOTICE_PAD_X_CLASS = "px-3";
export const CALL_IN_APP_NOTICE_TOP_CLASS =
  "top-[max(8px,var(--safe-top,env(safe-area-inset-top)))]";
/** Below incoming accept banner (z-1290) when both could exist; above CallScreen/dock. */
export const CALL_IN_APP_NOTICE_Z_CLASS = "z-[1285]";
export const CALL_IN_APP_NOTICE_INFO_BG_CLASS = INCOMING_CALL_BANNER_BG_CLASS;
export const CALL_IN_APP_NOTICE_INFO_BORDER_CLASS = INCOMING_CALL_BANNER_BORDER_CLASS;
export const CALL_IN_APP_NOTICE_WARN_BG_CLASS = "bg-[#1F1F1F]";
export const CALL_IN_APP_NOTICE_WARN_BORDER_CLASS = "border-white/15";
export const CALL_IN_APP_NOTICE_ERROR_BG_CLASS = "bg-[#D93025]";
export const CALL_IN_APP_NOTICE_ERROR_BORDER_CLASS = "border-[#B71C1C]/40";
export const CALL_IN_APP_NOTICE_TERMINAL_BG_CLASS = INCOMING_CALL_BANNER_BG_CLASS;
export const CALL_IN_APP_NOTICE_TERMINAL_BORDER_CLASS = INCOMING_CALL_BANNER_BORDER_CLASS;
export const INCOMING_CALL_BANNER_ACCEPT_CLASS =
  "bg-[#00754A] text-white shadow-[0_10px_22px_rgba(0,117,74,0.32)] active:bg-[#006241] transition-transform duration-[80ms] active:scale-[0.93]";
export const INCOMING_CALL_BANNER_DECLINE_CLASS =
  "bg-[#D93025] text-white shadow-[0_10px_22px_rgba(217,48,37,0.28)] transition-transform duration-[80ms] active:scale-[0.93]";

/** 앱 내 전체화면 수신 벨 */
export const INCOMING_CALL_FULLSCREEN_SURFACE_CLASS =
  "bg-[radial-gradient(circle_at_50%_0%,rgba(212,233,226,0.24),transparent_34%),linear-gradient(180deg,#00754A_0%,#006241_44%,#003D29_100%)]";
export const INCOMING_CALL_FULLSCREEN_ACCEPT_BTN_CLASS =
  "bg-[#00754A] text-white shadow-[0_16px_34px_rgba(0,117,74,0.32)] ring-1 ring-[#D4E9E2]/35 active:bg-[#006241] transition-transform duration-[80ms] active:scale-[0.93]";
export const INCOMING_CALL_FULLSCREEN_DECLINE_BTN_CLASS =
  "bg-[#D93025] text-white shadow-[0_16px_34px_rgba(217,48,37,0.28)] ring-1 ring-[#F1F8F4]/18 transition-transform duration-[80ms] active:scale-[0.93]";

export const CALL_UI_PRIMARY_BTN_CLASS =
  "bg-[#00754A] text-white shadow-[0_8px_24px_rgba(0,117,74,0.28)] transition-transform duration-[80ms] active:scale-[0.93] active:bg-[#006241] disabled:opacity-50";

export const CALL_UI_DANGER_BTN_CLASS =
  "bg-[#D93025] text-white shadow-[0_8px_24px_rgba(217,48,37,0.28)] transition-transform duration-[80ms] active:scale-[0.93] disabled:opacity-50";

export const CALL_UI_CALL_LIST_ROW_CLASS =
  "bg-white dark:bg-[#1F1F1F] border-b border-sam-border dark:border-white/10";

export const CALL_UI_CALL_LIST_ROW_ACTIVE_CLASS = "active:bg-sam-primary-soft dark:active:bg-white/5";

export function triggerIncomingCallBannerHaptic(ms = 12): void {
  if (typeof navigator === "undefined" || !("vibrate" in navigator)) return;
  try {
    navigator.vibrate(ms);
  } catch {
    /* ignore */
  }
}
