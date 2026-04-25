"use client";

import { useCallback, useEffect, useState } from "react";
import { runSingleFlight } from "@/lib/http/run-single-flight";

function isPushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

type StatusRes = {
  ok?: boolean;
  vapid_configured?: boolean;
  web_push_enabled?: boolean;
  subscription_count?: number;
  table_missing?: boolean;
};

export function WebPushSettingsRow({ pushEnabled }: { pushEnabled: boolean }) {
  const [loaded, setLoaded] = useState(false);
  const [status, setStatus] = useState<StatusRes | null>(null);
  const [busy, setBusy] = useState(false);
  const [hint, setHint] = useState<string | null>(null);

  const refresh = useCallback(() => {
    void (async () => {
      try {
        const res = await runSingleFlight("me:push:status:get", () =>
          fetch("/api/me/push/status", { credentials: "include" })
        );
        const j = (await res.clone().json().catch(() => ({}))) as StatusRes;
        setStatus(res.ok && j?.ok ? j : { ok: false });
      } catch {
        setStatus({ ok: false });
      } finally {
        setLoaded(true);
      }
    })();
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (!loaded) return;
    if (!pushEnabled) {
      void (async () => {
        try {
          const reg = await navigator.serviceWorker.getRegistration();
          const sub = await reg?.pushManager.getSubscription();
          await sub?.unsubscribe().catch(() => undefined);
          await fetch("/api/me/push/unsubscribe", { method: "DELETE", credentials: "include" });
        } catch {
          /* ignore */
        }
        refresh();
      })();
    }
  }, [pushEnabled, loaded, refresh]);

  const registerPush = useCallback(async () => {
    setHint(null);
    if (!isPushSupported()) {
      setHint("이 브라우저는 웹 푸시를 지원하지 않습니다.");
      return;
    }
    const vapidRes = await runSingleFlight("me:push:vapid-key:get", () =>
      fetch("/api/me/push/vapid-key", { credentials: "include" })
    );
    const vapidJson = (await vapidRes.clone().json().catch(() => ({}))) as { publicKey?: string | null };
    const key = typeof vapidJson.publicKey === "string" ? vapidJson.publicKey.trim() : "";
    if (!key) {
      setHint("서버에 VAPID 공개 키가 설정되지 않았습니다. 운영 환경에 키를 등록해 주세요.");
      return;
    }

    setBusy(true);
    try {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") {
        setHint("브라우저 알림 권한이 필요합니다.");
        return;
      }

      const { urlBase64ToUint8Array } = await import("@/lib/push/url-base64-to-uint8array");
      const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
      await reg.update().catch(() => undefined);
      const ready = await navigator.serviceWorker.ready;
      const sub = await ready.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(key) as BufferSource,
      });

      const res = await fetch("/api/me/push/subscribe", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sub.toJSON()),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j?.ok) {
        setHint(
          j?.error === "table_missing"
            ? "DB 마이그레이션(web_push_subscriptions)이 필요합니다."
            : "등록에 실패했습니다."
        );
        return;
      }
      refresh();
    } catch (e) {
      setHint(e instanceof Error ? e.message : "등록 중 오류가 났습니다.");
    } finally {
      setBusy(false);
    }
  }, [refresh]);

  const unregisterPush = useCallback(async () => {
    setHint(null);
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = await reg?.pushManager.getSubscription();
      const endpoint = sub?.endpoint;
      await sub?.unsubscribe().catch(() => undefined);
      await fetch("/api/me/push/unsubscribe", {
        method: "DELETE",
        credentials: "include",
        headers: endpoint ? { "Content-Type": "application/json" } : undefined,
        body: endpoint ? JSON.stringify({ endpoint }) : undefined,
      });
      refresh();
    } catch (e) {
      setHint(e instanceof Error ? e.message : "해제에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  }, [refresh]);

  if (!loaded) {
    return (
      <div className="border-b border-sam-border-soft px-3 py-2.5">
        <div className="h-4 w-40 rounded bg-sam-surface-muted" />
        <div className="mt-2 h-3 w-full max-w-sm rounded bg-sam-app" />
      </div>
    );
  }

  const supported = isPushSupported();
  const count = status?.subscription_count ?? 0;
  const canRegister = Boolean(status?.vapid_configured) && !status?.table_missing;

  return (
    <div className="border-b border-sam-border-soft px-3 py-2.5">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <span className="text-[14px] font-medium text-sam-fg">브라우저 푸시 (PWA)</span>
          <p className="mt-0.5 text-[11px] leading-snug text-sam-muted">
            앱을 닫아도 브라우저 알림으로 인앱 알림을 받습니다. HTTPS 또는 localhost에서 동작합니다. 상단 &quot;전체
            알림&quot;을 끄면 등록이 해제됩니다.
          </p>
          {!supported ? (
            <p className="mt-1 text-[11px] leading-snug text-amber-800">이 환경에서는 Web Push API를 사용할 수 없습니다.</p>
          ) : null}
          {status?.table_missing ? (
            <p className="mt-1 text-[11px] leading-snug text-amber-800">
              DB에 web_push_subscriptions 테이블이 없습니다. Supabase 마이그레이션을 적용해 주세요.
            </p>
          ) : null}
          {!status?.vapid_configured ? (
            <p className="mt-1 text-[11px] leading-snug text-sam-muted">
              서버에 `NEXT_PUBLIC_VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` 가 없으면 발송·등록이 되지 않습니다.
            </p>
          ) : null}
          {status?.vapid_configured && !status?.web_push_enabled ? (
            <p className="mt-1 text-[11px] leading-snug text-sam-muted">서버에서 `WEB_PUSH_ENABLED=1` 이면 실제 푸시가 발송됩니다.</p>
          ) : null}
          {hint ? <p className="mt-1 text-[11px] leading-snug text-red-600">{hint}</p> : null}
          {supported && canRegister ? (
            <p className="mt-1 text-[11px] leading-snug text-sam-muted">
              등록된 기기: {count} / 최대 10
              {Notification.permission === "granted" ? " · 알림 권한: 허용" : ""}
              {Notification.permission === "denied" ? " · 알림 권한: 거부 (브라우저 설정에서 허용해 주세요)" : ""}
            </p>
          ) : null}
        </div>
        <div className="flex shrink-0 gap-2">
          <button
            type="button"
            disabled={busy || !pushEnabled || !supported || !canRegister}
            onClick={() => void registerPush()}
            className="rounded-ui-rect bg-signature px-3 py-1.5 text-[12px] font-medium text-white disabled:opacity-40"
          >
            {busy ? "처리 중…" : "알림 허용·등록"}
          </button>
          <button
            type="button"
            disabled={busy || count < 1}
            onClick={() => void unregisterPush()}
            className="rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-1.5 text-[12px] text-sam-fg disabled:opacity-40"
          >
            등록 해제
          </button>
        </div>
      </div>
    </div>
  );
}
