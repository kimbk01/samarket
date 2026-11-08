"use client";

import { useCallback, useEffect, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { AdminActionButton } from "@/components/admin/ui/AdminActionButton";
import { formatAdminManilaDateTime } from "@/lib/admin/metrics/manila-period";
import { adminActionLevel } from "@/lib/admin/operator-ux/admin-action-levels";
import { confirmAdminAction } from "@/lib/admin/operator-ux/admin-confirm-action";
import {
  APP_RELEASE_ADMIN_SCREEN_OUTDATED,
  appReleaseConfirmText,
} from "@/lib/app-releases/app-release-notify-policy";

type Row = {
  id: string;
  platform: string;
  version_name: string;
  version_code: number | null;
  released_at: string;
  source: string;
  rollout_status: string | null;
  notified_at: string | null;
};

/** 출시 무음 감지 상태 + 수동 동기화·발송 확정 (시안/전체화면 Host 비변경). */
export function AdminAppReleasesStatus() {
  const { t, language } = useI18n();
  const ko = language !== "en";
  const [rows, setRows] = useState<Row[] | null>(null);
  const [playKey, setPlayKey] = useState<boolean | null>(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState<"sync" | "notify" | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const reload = useCallback(() => {
    setFailed(false);
    void fetch("/api/admin/app-releases", { credentials: "include", cache: "no-store" })
      .then((r) => r.json().catch(() => null))
      .then((j: { ok?: boolean; releases?: Row[]; playKeyConfigured?: boolean } | null) => {
        if (!j?.ok) {
          setFailed(true);
          return;
        }
        setRows(j.releases ?? []);
        setPlayKey(j.playKeyConfigured === true);
      })
      .catch(() => setFailed(true));
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  async function runSync() {
    setBusy("sync");
    setMessage(null);
    try {
      const r = await fetch("/api/admin/app-releases/sync", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "collect_only" }),
      });
      const j = (await r.json().catch(() => null)) as {
        ok?: boolean;
        error?: string;
        results?: { platform: string; inserted: number; error?: string }[];
      } | null;
      if (!j?.ok) {
        setMessage(t("admin_app_sync_failed", { errorText: errorText(j?.error, r.status) }));
        return;
      }
      const summary = (j.results ?? [])
        .map((x) => `${x.platform}: +${x.inserted}${x.error ? ` err=${x.error}` : ""}`)
        .join(" · ");
      setMessage(
        t("admin_app_synced_no_notifications_sent", { summary })
      );
      reload();
    } catch {
      setMessage(t("admin_app_sync_request_failed"));
    } finally {
      setBusy(null);
    }
  }

  function errorText(code: string | undefined, status: number): string {
    if (code === APP_RELEASE_ADMIN_SCREEN_OUTDATED) {
      return t("admin_app_admin_screen_is_outdated_refresh_page");
    }
    if (code === "confirm_text_mismatch") return t("admin_app_version_text_does_not_match");
    if (code === "reason_required") return t("admin_app_enter_reason_2_characters");
    return code ?? String(status);
  }

  async function loadNotifyPreview(
    releaseId: string
  ): Promise<{ confirmText: string; eligible: boolean; targetCount: number; maxPerRun: number } | null> {
    try {
      const r = await fetch(`/api/admin/app-releases/notify?releaseId=${encodeURIComponent(releaseId)}`, {
        credentials: "include",
        cache: "no-store",
      });
      const j = (await r.json().catch(() => null)) as {
        ok?: boolean;
        confirmText?: string;
        eligible?: boolean;
        targetCount?: number;
        maxPerRun?: number;
      } | null;
      if (!j?.ok || typeof j.confirmText !== "string" || typeof j.targetCount !== "number") return null;
      return {
        confirmText: j.confirmText,
        eligible: j.eligible === true,
        targetCount: j.targetCount,
        maxPerRun: typeof j.maxPerRun === "number" ? j.maxPerRun : 0,
      };
    } catch {
      return null;
    }
  }

  async function runNotify(row: Row, label: string) {
    const releaseId = row.id;
    setBusy("notify");
    setMessage(null);
    const preview = await loadNotifyPreview(releaseId);
    setBusy(null);
    if (preview && !preview.eligible) {
      setMessage(t("admin_app_this_release_cannot_be_notified"));
      return;
    }
    const confirmText = preview?.confirmText ?? appReleaseConfirmText(row);
    const countLine = preview
      ? t("admin_app_estimated_targets_outdated_users_already_notified", { targetCount: preview.targetCount, maxPerRun: preview.maxPerRun })
      : t("admin_app_estimated_targets_unavailable");
    const confirmed = await confirmAdminAction({
      level: adminActionLevel("appReleaseNotify"),
      ko,
      title: label,
      description: t("admin_app_target_version_confirm_only_if_production", { confirmText: String(confirmText), countLine }),
      confirmLabel: t("admin_app_confirm_notify"),
      retypeValue: confirmText,
    });
    if (!confirmed.ok) return;
    setBusy("notify");
    setMessage(null);
    try {
      const r = await fetch("/api/admin/app-releases/notify", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ releaseId, confirm: true, reason: confirmed.reason, confirmText }),
      });
      const j = (await r.json().catch(() => null)) as {
        ok?: boolean;
        error?: string;
        created?: number;
        attempted?: number;
        incomplete?: boolean;
      } | null;
      if (!j?.ok) {
        setMessage(t("admin_app_notify_failed", { errorText: errorText(j?.error, r.status) }));
        return;
      }
      setMessage(
        t("admin_app_notify_result", { attempted: j.attempted ?? 0, created: j.created ?? 0 }) +
          (j.incomplete ? ` ${t("admin_app_notify_run_again")}` : "")
      );
      reload();
    } catch {
      setMessage(t("admin_app_notify_request_failed"));
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="space-y-2 rounded-ui-rect border border-sam-border bg-sam-surface p-4 text-sm" data-admin-app-releases>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold text-sam-fg">{t("admin_app_app_release_detect")}</h2>
        <AdminActionButton variant="secondary" disabled={busy != null} onClick={() => void runSync()}>
          {busy === "sync" ? (t("admin_app_syncing")) : t("admin_app_sync_now")}
        </AdminActionButton>
      </div>
      <p className="sam-text-helper text-sam-muted">
        {t("admin_app_every_6h_checks_play_production_only")}
      </p>
      {playKey === false ? (
        <p className="sam-text-helper text-sam-warning">
          {t("admin_app_no_google_play_key_android_auto")}
        </p>
      ) : null}
      {message ? <p className="sam-text-helper text-sam-fg">{message}</p> : null}
      {failed ? (
        <p className="sam-text-helper text-sam-danger">{t("admin_app_failed_to_load")}</p>
      ) : rows == null ? null : rows.length === 0 ? (
        <p className="sam-text-helper text-sam-muted">{t("admin_app_nothing_collected_yet")}</p>
      ) : (
        <ul className="divide-y divide-sam-border">
          {rows.map((r) => {
            const label = `${r.platform} ${r.version_name}${r.version_code != null ? ` (${r.version_code})` : ""}`;
            const canConfirm = !r.notified_at && (r.platform !== "android" || r.version_code != null);
            return (
              <li key={r.id || `${r.platform}-${r.version_name}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-1.5">
                <span className="font-medium text-sam-fg">{label}</span>
                <span className="sam-text-helper text-sam-muted">{r.source}</span>
                <span className="sam-text-helper text-sam-muted">{r.rollout_status ?? "—"}</span>
                <span className="sam-text-helper text-sam-muted">{formatAdminManilaDateTime(r.released_at)}</span>
                <span className="sam-text-helper text-sam-muted">
                  {r.notified_at ? (t("admin_app_notified")) : t("admin_app_pending")}
                </span>
                {canConfirm ? (
                  <AdminActionButton
                    variant="ghost"
                    size="sm"
                    disabled={busy != null}
                    onClick={() => void runNotify(r, label)}
                  >
                    {t("admin_app_confirm_notify")}
                  </AdminActionButton>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
