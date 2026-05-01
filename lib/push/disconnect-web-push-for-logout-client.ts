"use client";

/**
 * 디바이 앱 로그아웃 확정 시에만 호출.
 * 앱 종료·탭 전환·뒤로가기에서는 호출하지 않는다.
 * 로컬 Supabase 세션을 비우기 **전에** 인증된 요청으로 서버 구독 행을 지운다.
 */
export async function disconnectWebPushSubscriptionsForLogout(): Promise<void> {
  if (typeof window === "undefined") return;
  try {
    const reg =
      "serviceWorker" in navigator ? await navigator.serviceWorker.getRegistration().catch(() => undefined) : undefined;
    const sub = await reg?.pushManager?.getSubscription?.().catch(() => undefined);
    const endpoint = sub?.endpoint;
    await sub?.unsubscribe?.().catch(() => undefined);
    await fetch("/api/me/push/unsubscribe", {
      method: "DELETE",
      credentials: "include",
      headers: endpoint ? { "Content-Type": "application/json" } : undefined,
      body: endpoint ? JSON.stringify({ endpoint }) : undefined,
    }).catch(() => undefined);
  } catch {
    /* best-effort */
  }
}
