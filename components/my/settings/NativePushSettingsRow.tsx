"use client";

import { useCallback, useEffect, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { isCapacitorNativePlatform } from "@/lib/platform/capacitor-native";
import {
  checkNativeNotificationPermission,
  type NativeNotificationPermissionState,
} from "@/lib/push/native/check-native-notification-permission";
import { openNativeAppSettings } from "@/lib/push/native/open-native-settings";
import { runNotificationGuideFlow } from "@/lib/permissions/permission-manager/notification-onboarding-flow";
import { syncNotificationState } from "@/lib/permissions/permission-manager/notification-permission-manager";
import { runSingleFlight } from "@/lib/http/run-single-flight";

type DeviceStatusRes = {
  ok?: boolean;
  active_count?: number;
  has_native?: boolean;
  has_voip?: boolean;
  table_missing?: boolean;
};

function permissionLabel(
  t: (key: "settings_native_push_perm_granted" | "settings_native_push_perm_denied" | "settings_native_push_perm_prompt" | "settings_native_push_perm_unknown") => string,
  state: NativeNotificationPermissionState
): string {
  if (state === "granted") return t("settings_native_push_perm_granted");
  if (state === "denied") return t("settings_native_push_perm_denied");
  if (state === "prompt") return t("settings_native_push_perm_prompt");
  return t("settings_native_push_perm_unknown");
}

export function NativePushSettingsRow({ pushEnabled }: { pushEnabled: boolean }) {
  const { t } = useI18n();
  const [loaded, setLoaded] = useState(false);
  const [status, setStatus] = useState<DeviceStatusRes | null>(null);
  const [perm, setPerm] = useState<NativeNotificationPermissionState>("unknown");
  const [busy, setBusy] = useState(false);
  const [hint, setHint] = useState<string | null>(null);

  const refresh = useCallback(() => {
    if (!isCapacitorNativePlatform()) {
      setLoaded(true);
      return;
    }
    void (async () => {
      try {
        const [permState, res] = await Promise.all([
          checkNativeNotificationPermission(),
          runSingleFlight("me:devices:status:get", () =>
            fetch("/api/me/devices/status", { credentials: "include" })
          ),
        ]);
        setPerm(permState);
        const j = (await res.json().catch(() => ({}))) as DeviceStatusRes;
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

  if (!isCapacitorNativePlatform()) return null;
  if (!loaded) {
    return (
      <div className="border-b border-sam-border-soft px-3 py-2.5">
        <div className="h-4 w-32 rounded bg-sam-surface-muted" />
      </div>
    );
  }

  const activeCount = status?.active_count ?? 0;
  const registered = (status?.has_native ?? false) && activeCount > 0 && perm === "granted";

  return (
    <div className="border-b border-sam-border-soft px-3 py-2.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <span className="text-[14px] font-medium text-sam-fg">{t("settings_native_push_title")}</span>
          <p className="mt-0.5 text-[11px] leading-snug text-sam-muted">{t("settings_native_push_desc")}</p>
          <p className="mt-1 text-[11px] leading-snug text-sam-muted">
            OS {t("settings_device_notification")}: {permissionLabel(t, perm)}
          </p>
          {status?.table_missing ? (
            <p className="mt-1 text-[11px] leading-snug text-amber-700">{t("settings_native_push_no_table")}</p>
          ) : (
            <p className="mt-1 text-[11px] leading-snug text-sam-muted">
              {registered
                ? t("settings_native_push_registered", { count: String(activeCount) })
                : t("settings_native_push_not_registered")}
              {status?.has_voip ? ` · ${t("settings_native_push_voip_ok")}` : ""}
            </p>
          )}
          {hint ? <p className="mt-1 text-[11px] leading-snug text-red-600">{hint}</p> : null}
        </div>
        <div className="flex shrink-0 flex-col gap-1.5">
          <button
            type="button"
            disabled={!pushEnabled || busy || status?.table_missing === true || perm === "granted"}
            onClick={() => {
              if (!pushEnabled || busy) return;
              setBusy(true);
              setHint(null);
              void (async () => {
                const guideResult = await runNotificationGuideFlow("settings_retry");
                await syncNotificationState();
                if (guideResult !== "granted") {
                  setHint(t("settings_native_push_err_permission"));
                }
                refresh();
                setBusy(false);
              })();
            }}
            className="rounded-ui-rect border border-sam-border px-3 py-1.5 text-[13px] font-medium text-sam-fg disabled:opacity-50"
          >
            {busy ? t("settings_native_push_busy") : t("settings_native_push_register")}
          </button>
          {perm === "denied" ? (
            <button
              type="button"
              onClick={() => void openNativeAppSettings()}
              className="rounded-ui-rect border border-sam-border px-3 py-1.5 text-[12px] text-sam-muted"
            >
              {t("settings_native_push_open_settings")}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
