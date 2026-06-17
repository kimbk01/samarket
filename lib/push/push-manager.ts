/**
 * 통화·메시지 푸시 보조 — 포그라운드 여부, 태그, SW 에 알림 정리 요청.
 * 실제 Web Push 페이로드 조립은 `send-web-push-for-user` 유지.
 */

"use client";

import { closeLocalIncomingCallNotification } from "@/lib/community-messenger/call-browser-notification";

export type MessengerCallPushKind =
  | "incoming_call"
  | "missed_call"
  | "call_canceled"
  | "call_rejected"
  | "call_ended";

export const MESSENGER_CALL_PUSH_KIND = {
  incoming: "incoming_call",
  missed: "missed_call",
  canceled: "call_canceled",
  rejected: "call_rejected",
  ended: "call_ended",
} as const satisfies Record<string, MessengerCallPushKind>;

export function messengerIncomingCallNotificationTag(sessionId: string): string {
  return `samarket-incoming-call-${sessionId.trim()}`;
}

/** 인앱 오버레이가 책임질 때 로컬 알림·불필요 푸시 UI 억제에 사용 */
export function isBrowserTabForegroundForMessenger(): boolean {
  if (typeof window === "undefined") return false;
  return document.visibilityState === "visible" && !document.hidden;
}

type SwPostMessage = { type: "close_messenger_call_notifications"; sessionId: string };

/**
 * 수신 통화 알림 전부 정리: 이 탭 `Notification` · SW 등록 알림(`getNotifications`) · SW `postMessage`.
 */
export function requestCloseMessengerCallNotifications(sessionId: string): void {
  if (typeof navigator === "undefined") return;
  const sid = sessionId.trim();
  if (!sid) return;

  closeLocalIncomingCallNotification(sid);

  const tag = messengerIncomingCallNotificationTag(sid);
  if (navigator.serviceWorker?.getRegistration) {
    void navigator.serviceWorker.getRegistration().then((reg) => {
      if (!reg?.getNotifications) return;
      return reg.getNotifications({ tag }).then((list) => {
        for (const n of list) {
          try {
            n.close();
          } catch {
            /* ignore */
          }
        }
      });
    });
  }

  if (!navigator.serviceWorker?.controller) return;
  try {
    navigator.serviceWorker.controller.postMessage({
      type: "close_messenger_call_notifications",
      sessionId: sid,
    } satisfies SwPostMessage);
  } catch {
    /* ignore */
  }
}

/** 로그아웃·계정 전환 — SW 등록 알림 전부 닫기 */
export function closeAllServiceWorkerNotifications(): void {
  if (typeof navigator === "undefined") return;
  if (!navigator.serviceWorker?.getRegistration) return;
  void navigator.serviceWorker.getRegistration().then((reg) => {
    if (!reg?.getNotifications) return;
    return reg.getNotifications().then((list) => {
      for (const n of list) {
        try {
          n.close();
        } catch {
          /* ignore */
        }
      }
    });
  });
}
