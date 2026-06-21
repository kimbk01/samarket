/**
 * 수신 통화 UI SSOT — `incoming-call-lane.ts` 가 surface 단일 결정.
 *
 * | 앱 상태 | UI | 담당 |
 * |---------|-----|------|
 * | 앱 안 ringing | `CommunityMessengerIncomingCallUi` + `IncomingCallSurface` | Global controller |
 * | Lock / background | native fullscreen | `IncomingCallActivity` |
 * | 수락 후 | call_screen | `CommunityMessengerCallClient` |
 *
 * DO NOT: foreground FCM → native pill (Web 배너와 이중 UI).
 * DO NOT: `/calls/:id` ringing → `IncomingCallView` 전체화면.
 */

export const INCOMING_UI_FOREGROUND_SURFACE = "web_top_banner" as const;
export const INCOMING_UI_LOCK_SURFACE = "native_fullscreen" as const;

export type { IncomingCallLaneSurface } from "@/lib/community-messenger/incoming-call/incoming-call-lane";
export { resolveIncomingCallLane } from "@/lib/community-messenger/incoming-call/incoming-call-lane";
