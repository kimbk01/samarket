"use client";

import { useCallback, useEffect, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
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
  const { t } = useI18n();
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
      setHint(t("settings_web_push_err_unsupported"));
      return;
    }
    setBusy((prev) => (prev ? prev : true));
    try {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") {
        setHint(t("settings_web_push_err_permission"));
        return;
      }

      const reg = await registerWebPushSubscriptionFromClient();
      if (!reg.ok) {
        setHint(
          reg.error === "vapid_missing"
            ? t("settings_web_push_err_no_vapid")
            : reg.error === "table_missing" || reg.error === "subscribe_failed"
              ? t("settings_web_push_err_migration")
              : reg.error === "permission_not_granted"
                ? t("settings_web_push_err_permission")
                : t("settings_web_push_err_register_failed")
        );
        return;
      }
      refresh();
    } catch (e) {
      setHint(e instanceof Error ? e.message : t("settings_web_push_err_register_generic"));
    } finally {
      setBusy((prev) => (prev ? false : prev));
    }
  }, [refresh, t]);

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
      setHint(e instanceof Error ? e.message : t("settings_web_push_err_unregister_failed"));
    } finally {
      setBusy((prev) => (prev ? false : prev));
    }
  }, [refresh, t]);

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
          <span className="text-[14px] font-medium text-sam-fg">{t("settings_web_push_title")}</span>
          <p className="mt-0.5 text-[11px] leading-snug text-sam-muted">{t("settings_web_push_desc")}</p>
          {!supported ? (
            <p className="mt-1 text-[11px] leading-snug text-amber-800">{t("settings_web_push_unsupported_env")}</p>
          ) : null}
          {status?.table_missing ? (
            <p className="mt-1 text-[11px] leading-snug text-amber-800">{t("settings_web_push_no_table")}</p>
          ) : null}
          {!status?.vapid_configured ? (
            <p className="mt-1 text-[11px] leading-snug text-sam-muted">{t("settings_web_push_no_vapid")}</p>
          ) : null}
          {status?.vapid_configured && !status?.web_push_enabled ? (
            <p className="mt-1 text-[11px] leading-snug text-sam-muted">{t("settings_web_push_enabled_hint")}</p>
          ) : null}
          {hint ? <p className="mt-1 text-[11px] leading-snug text-red-600">{hint}</p> : null}
          {supported && canRegister ? (
            <p className="mt-1 text-[11px] leading-snug text-sam-muted">
              {t("settings_web_push_devices", { count: String(count) })}
              {Notification.permission === "granted" ? t("settings_web_push_perm_granted") : ""}
              {Notification.permission === "denied" ? t("settings_web_push_perm_denied") : ""}
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
            {busy ? t("settings_web_push_busy") : t("settings_web_push_register")}
          </button>
          <button
            type="button"
            disabled={busy || count < 1}
            onClick={() => void unregisterPush()}
            className="rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-1.5 text-[12px] text-sam-fg disabled:opacity-40"
          >
            {t("settings_web_push_unregister")}
          </button>
        </div>
      </div>
    </div>
  );
}
