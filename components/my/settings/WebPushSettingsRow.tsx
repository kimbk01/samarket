"use client";

import { useCallback, useEffect, useState } from "react";
import { runSingleFlight } from "@/lib/http/run-single-flight";
import { registerWebPushSubscriptionFromClient } from "@/lib/push/register-web-push-subscription-client";

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
        const next = (res.ok && j?.ok ? j : { ok: false }) as StatusRes;
        setStatus((prev) =>
          prev &&
          prev.ok === next.ok &&
          prev.vapid_configured === next.vapid_configured &&
          prev.web_push_enabled === next.web_push_enabled &&
          prev.subscription_count === next.subscription_count &&
          prev.table_missing === next.table_missing
            ? prev
            : next
        );
      } catch {
        setStatus((prev) => (prev?.ok === false ? prev : { ok: false }));
      } finally {
        setLoaded((prev) => (prev ? prev : true));
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
    setHint((prev) => (prev === null ? prev : null));
    if (!isPushSupported()) {
      setHint("이 브라우저는 웹 푸시를 지원하지 않습니다.");
      return;
    }
    setBusy((prev) => (prev ? prev : true));
    try {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") {
        setHint("브라우저 알림 권한이 필요합니다.");
        return;
      }

      const reg = await registerWebPushSubscriptionFromClient();
      if (!reg.ok) {
        setHint(
          reg.error === "vapid_missing"
            ? "서버에 VAPID 공개 키가 설정되지 않았습니다."
            : reg.error === "table_missing" || reg.error === "subscribe_failed"
              ? "DB 마이그레이션(web_push_subscriptions)이 필요하거나 등록에 실패했습니다."
              : reg.error === "permission_not_granted"
                ? "브라우저 알림 권한이 필요합니다."
                : "등록에 실패했습니다."
        );
        return;
      }
      refresh();
    } catch (e) {
      setHint(e instanceof Error ? e.message : "등록 중 오류가 났습니다.");
    } finally {
      setBusy((prev) => (prev ? false : prev));
    }
  }, [refresh]);

  const unregisterPush = useCallback(async () => {
    setHint((prev) => (prev === null ? prev : null));
    setBusy((prev) => (prev ? prev : true));
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
      setBusy((prev) => (prev ? false : prev));
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
