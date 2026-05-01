"use client";

import { runSingleFlight } from "@/lib/http/run-single-flight";

function isPushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

function detectPlatform(): "pwa" | "web" {
  if (typeof window === "undefined") return "web";
  const m = window.matchMedia?.("(display-mode: standalone)");
  if (m?.matches) return "pwa";
  return (window.navigator as Navigator & { standalone?: boolean }).standalone === true ? "pwa" : "web";
}

/**
 * VAPID 기반 Web Push 구독 등록 (알림 설정·온보딩 공통).
 * 브라우저/OS 권한은 호출 전에 이미 granted 여야 한다.
 */
export async function registerWebPushSubscriptionFromClient(): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!isPushSupported()) {
    return { ok: false, error: "unsupported" };
  }
  if (Notification.permission !== "granted") {
    return { ok: false, error: "permission_not_granted" };
  }

  const vapidRes = await runSingleFlight("me:push:vapid-key:get", () =>
    fetch("/api/me/push/vapid-key", { credentials: "include" })
  );
  const vapidJson = (await vapidRes.clone().json().catch(() => ({}))) as { publicKey?: string | null };
  const key = typeof vapidJson.publicKey === "string" ? vapidJson.publicKey.trim() : "";
  if (!key) {
    return { ok: false, error: "vapid_missing" };
  }

  try {
    const { urlBase64ToUint8Array } = await import("@/lib/push/url-base64-to-uint8array");
    const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
    await reg.update().catch(() => undefined);
    const ready = await navigator.serviceWorker.ready;
    const sub = await ready.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(key) as BufferSource,
    });
    const platform = detectPlatform();
    const res = await fetch("/api/me/push/subscribe", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...sub.toJSON(),
        platform,
        device_name: typeof navigator.userAgent === "string" ? navigator.userAgent.slice(0, 200) : undefined,
      }),
    });
    const j = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
    if (!res.ok || !j?.ok) {
      return { ok: false, error: typeof j?.error === "string" ? j.error : "subscribe_failed" };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "unknown" };
  }
}
