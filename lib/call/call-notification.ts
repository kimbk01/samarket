/**
 * 웹: 포그라운드는 인앱 오버레이 우선, 백그라운드 탭은 Notification API 보조.
 * 실제 Web Push(SW `push`)는 서버 VAPID 페이로드와 함께 `public/sw.js` 에서 처리.
 */

"use client";

/** 이 탭에서 연 수신 통화 알림 — 링 종료 시 스크립트로 닫기 */
const localIncomingCallNotificationsBySessionId = new Map<string, Notification>();

export type LocalIncomingCallNotificationInput = {
  sessionId: string;
  peerLabel: string;
  callKind: "voice" | "video";
  /** 관리자 `suppress_incoming_local_notifications` — 이 탭의 로컬 Notification 생략(Web Push 는 서버에서 동일 플래그로 차단) */
  suppressed?: boolean;
};

function defaultCallDeepLink(sessionId: string): string {
  return `/community-messenger/calls/${encodeURIComponent(sessionId)}`;
}

/**
 * 탭이 숨겨진 경우에만 로컬 알림(브라우저 Notification).
 * 포그라운드에서는 호출하지 않는 것을 권장(전역 오버레이와 중복 방지).
 */
export function showLocalIncomingCallNotificationIfEligible(input: LocalIncomingCallNotificationInput): boolean {
  if (typeof window === "undefined") return false;
  if (input.suppressed) return false;
  if (window.document.visibilityState === "visible" && !window.document.hidden) return false;
  if (!("Notification" in window)) return false;
  if (Notification.permission !== "granted") return false;

  const title = input.callKind === "video" ? "영상 통화" : "음성 통화";
  const body = `${input.peerLabel}님의 전화`;
  const url = defaultCallDeepLink(input.sessionId);
  const sid = String(input.sessionId ?? "").trim();
  if (!sid) return false;

  try {
    closeLocalIncomingCallNotification(sid);
    const n = new Notification(title, {
      body,
      tag: `samarket-incoming-call-${sid}`,
      data: { url, sessionId: sid, kind: input.callKind },
    });
    localIncomingCallNotificationsBySessionId.set(sid, n);
    const dropIfCurrent = () => {
      if (localIncomingCallNotificationsBySessionId.get(sid) === n) {
        localIncomingCallNotificationsBySessionId.delete(sid);
      }
    };
    n.onclose = dropIfCurrent;
    n.onclick = () => {
      dropIfCurrent();
      try {
        window.focus();
      } catch {
        /* ignore */
      }
      window.location.assign(url);
    };
  } catch {
    return false;
  }
  return true;
}

/** 같은 탭에서 생성한 수신 통화 로컬 알림 닫기 */
export function closeLocalIncomingCallNotification(sessionId: string): void {
  if (typeof window === "undefined") return;
  const sid = sessionId.trim();
  if (!sid) return;
  const n = localIncomingCallNotificationsBySessionId.get(sid);
  if (!n) return;
  localIncomingCallNotificationsBySessionId.delete(sid);
  try {
    n.close();
  } catch {
    /* ignore */
  }
}

export function messengerCallNotificationDeepLink(sessionId: string): string {
  return defaultCallDeepLink(sessionId);
}
