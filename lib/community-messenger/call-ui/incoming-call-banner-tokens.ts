/** Foreground compact incoming call banner — Android/iOS Web 동일 톤 (Starbucks 진녹). */
export const INCOMING_CALL_PRIMARY_HEX = "#006241";
export const INCOMING_CALL_BANNER_BG_CLASS = "bg-[#006241]";
export const INCOMING_CALL_BANNER_BORDER_CLASS = "border-[#004F35]/40";
export const INCOMING_CALL_BANNER_ACCEPT_CLASS =
  "bg-[#22C55E] text-white shadow-[0_10px_22px_rgba(34,197,94,0.32)]";
export const INCOMING_CALL_BANNER_DECLINE_CLASS =
  "bg-[#EF1035] text-white shadow-[0_10px_22px_rgba(239,16,53,0.28)]";

/** 앱 내 전체화면 수신 벨 — compact 배너와 동일 브랜드 그린(#006241 중심). */
export const INCOMING_CALL_FULLSCREEN_SURFACE_CLASS =
  "bg-[radial-gradient(circle_at_50%_0%,rgba(212,233,226,0.24),transparent_34%),linear-gradient(180deg,#00754A_0%,#006241_44%,#003D29_100%)]";
export const INCOMING_CALL_FULLSCREEN_ACCEPT_BTN_CLASS =
  "bg-[#22C55E] text-white shadow-[0_16px_34px_rgba(34,197,94,0.32)] ring-1 ring-[#D4E9E2]/35";
export const INCOMING_CALL_FULLSCREEN_DECLINE_BTN_CLASS =
  "bg-[#EF1035] text-white shadow-[0_16px_34px_rgba(239,16,53,0.28)] ring-1 ring-[#F1F8F4]/18";

export function triggerIncomingCallBannerHaptic(ms = 12): void {
  if (typeof navigator === "undefined" || !("vibrate" in navigator)) return;
  try {
    navigator.vibrate(ms);
  } catch {
    /* ignore */
  }
}
