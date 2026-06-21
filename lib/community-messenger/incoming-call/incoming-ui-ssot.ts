/**
 * 수신 통화 UI SSOT — 카카오톡/텔레그램식 단일 경계.
 *
 * | 앱 상태 | UI | 담당 |
 * |---------|-----|------|
 * | Foreground unlocked (앱 안) | compact top banner | Web `IncomingCallBanner` |
 * | Lock / screen off / background | full-screen + notification | Native `IncomingCallActivity` |
 *
 * DO NOT: foreground FCM 에서 `ForegroundIncomingCallActivity` 를 띄우지 않는다 (Web 배너와 이중 UI).
 * DO NOT: `/calls/:id` ringing 에서 `IncomingCallView` 벨 UI — CallClient 전용 connecting 만.
 */

export const INCOMING_UI_FOREGROUND_SURFACE = "web_top_banner" as const;
export const INCOMING_UI_LOCK_SURFACE = "native_fullscreen" as const;

/** @deprecated ForegroundIncomingCallActivity pill — push delivery must not launch in foreground unlocked. */
export const INCOMING_UI_DEPRECATED_FOREGROUND_NATIVE_PILL = "native_foreground_pill" as const;
