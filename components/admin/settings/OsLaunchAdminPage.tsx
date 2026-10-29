"use client";

/**
 * R17-OS — Admin "OS 시작 화면" (TRUE Android SplashScreen / iOS LaunchScreen).
 *
 * BUILD-TIME ONLY: CURRENT APP BUILD (repo config) vs NEXT BUILD (pending, DB).
 * Saving never changes installed apps; `npm run os-launch:pull` + native build does.
 * Capability = background color + one centered static logo. Nothing else is offered.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { AdminCard } from "@/components/admin/AdminCard";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { normalizeOsLaunchHex } from "@/lib/os-launch/contract";
import { formatAdminManilaDateTime } from "@/lib/admin/metrics/manila-period";
import {
  OS_LAUNCH_COLOR_PICKER_FALLBACK,
  OS_LAUNCH_DEFAULT_BACKGROUND,
} from "@/lib/admin/platform/platform-launch-default-colors";
import { AdminActionButton } from "@/components/admin/ui/AdminActionButton";
import { confirmAdminAction } from "@/lib/admin/operator-ux/admin-confirm-action";
import { adminActionLevel } from "@/lib/admin/operator-ux/admin-action-levels";
import {
  AdminErrorState,
  AdminLoadingState,
  AdminResultBanner,
} from "@/components/admin/ui/AdminStateViews";
import { adminSafeErrorCode, type AdminLoadFailure } from "@/lib/admin/admin-load-failure";

type Snapshot = {
  ok: true;
  build: {
    backgroundColor: string;
    logoUrl: string | null;
    logo: { sha256: string };
    appliedFromAdmin: { updatedAt: string; sha256: string | null } | null;
  };
  pending: {
    backgroundColor: string;
    logo: { sha256: string } | null;
    logoUrl: string | null;
    updatedAt: string | null;
  } | null;
  pendingChanged: boolean;
};

type ApiError = { ok: false; error?: string };

/** Logo share of screen width in the preview (≈ iOS 106pt on a 390pt-wide phone). */
const PREVIEW_LOGO_WIDTH = "27%";

function StartPreview({ color, logoUrl }: { color: string; logoUrl: string | null }) {
  return (
    <div
      className="relative mx-auto flex aspect-[9/19.5] w-[168px] items-center justify-center overflow-hidden rounded-[22px] border border-sam-border"
      style={{ backgroundColor: color }}
      aria-hidden
    >
      {logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- signed / static preview URL
        <img src={logoUrl} alt="" style={{ width: PREVIEW_LOGO_WIDTH }} className="h-auto" />
      ) : null}
    </div>
  );
}

export function OsLaunchAdminPage() {
  const { t, language } = useI18n();
  const ko = language !== "en";
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [color, setColor] = useState(OS_LAUNCH_DEFAULT_BACKGROUND);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<"save" | "upload" | "reset" | null>(null);
  const [loadErr, setLoadErr] = useState<AdminLoadFailure | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [result, setResult] = useState<{ ok: true; message: string } | { ok: false; code: string } | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const apply = useCallback((json: Snapshot) => {
    setSnap(json);
    setColor(json.pending?.backgroundColor ?? json.build.backgroundColor);
  }, []);

  /** 변경 실패 — 오류 코드만 오류 맵 문구로 표시 (예전: 「처리하지 못했습니다: {원문 코드}」). */
  const fail = useCallback(
    (error: string | undefined) => setResult({ ok: false, code: adminSafeErrorCode(error, "save_failed") }),
    []
  );

  /** 조회 실패는 오류 상태 + [새로고침] (403 은 접근 거부) — R6. */
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/admin/os-launch", { credentials: "same-origin" });
        const json = (await res.json().catch(() => ({ ok: false }))) as Snapshot | ApiError;
        if (cancelled) return;
        if (res.ok && json.ok) {
          setLoadErr(null);
          apply(json);
        } else {
          setLoadErr({
            code: adminSafeErrorCode(json.ok ? undefined : json.error, "load_failed"),
            httpStatus: res.status,
          });
        }
      } catch {
        if (!cancelled) setLoadErr({ code: "network_error" });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [apply, reloadKey]);

  const reload = useCallback(() => {
    setLoading(true);
    setLoadErr(null);
    setReloadKey((k) => k + 1);
  }, []);

  const put = useCallback(
    async (kind: "save" | "reset") => {
      const normalized = normalizeOsLaunchHex(color);
      if (!normalized) {
        fail("invalid_color");
        return;
      }
      // 설정 저장·로고 되돌리기 = L1 확인 (표준 확인창)
      const label = kind === "reset" ? t("admin_os_launch_reset_logo") : t("admin_os_launch_save");
      const confirmed = await confirmAdminAction({
        level: adminActionLevel("save"),
        ko,
        title: label,
        description: t("admin_os_launch_apply_note"),
        confirmLabel: label,
      });
      if (!confirmed.ok) return;
      setBusy(kind);
      setResult(null);
      try {
        const res = await fetch("/api/admin/os-launch", {
          method: "PUT",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ backgroundColor: normalized, resetLogo: kind === "reset" }),
        });
        const json = (await res.json()) as Snapshot | ApiError;
        if (json.ok) {
          apply(json);
          setResult({ ok: true, message: t("admin_os_launch_saved") });
        } else fail(json.error);
      } catch {
        fail("network_error");
      } finally {
        setBusy(null);
      }
    },
    [apply, color, fail, ko, t]
  );

  const upload = useCallback(
    async (file: File) => {
      // 로고 교체 = L1 확인 (표준 확인창)
      const confirmed = await confirmAdminAction({
        level: adminActionLevel("save"),
        ko,
        title: t("admin_os_launch_upload"),
        description: t("admin_os_launch_apply_note"),
        confirmLabel: t("admin_os_launch_upload"),
      });
      if (!confirmed.ok) {
        if (fileRef.current) fileRef.current.value = "";
        return;
      }
      setBusy("upload");
      setResult(null);
      try {
        const form = new FormData();
        form.append("file", file);
        const res = await fetch("/api/admin/os-launch/logo", {
          method: "POST",
          credentials: "same-origin",
          body: form,
        });
        const json = (await res.json()) as Snapshot | ApiError;
        if (json.ok) {
          apply(json);
          setResult({ ok: true, message: t("admin_os_launch_saved") });
        } else fail(json.error);
      } catch {
        fail("network_error");
      } finally {
        setBusy(null);
        if (fileRef.current) fileRef.current.value = "";
      }
    },
    [apply, fail, ko, t]
  );

  const normalizedColor = normalizeOsLaunchHex(color);
  const pendingLogoUrl = snap?.pending?.logoUrl ?? snap?.build.logoUrl ?? null;
  const usingBuildLogo = !snap?.pending?.logo;

  return (
    <div className="space-y-4">
      <AdminPageHeader titleKey="admin_menu_settings_os_start" description={t("admin_os_launch_desc")} />

      <AdminCard>
        <div className="space-y-1 px-4 py-3.5 sm:px-5">
          <p className="sam-text-body font-medium text-sam-fg">{t("admin_os_launch_apply_note")}</p>
          <p className="sam-text-body-secondary text-sam-muted">{t("admin_os_launch_unsupported")}</p>
        </div>
      </AdminCard>

      {loading ? (
        <AdminLoadingState ko={ko} />
      ) : loadErr || !snap ? (
        <AdminErrorState
          ko={ko}
          code={loadErr?.code ?? "load_failed"}
          httpStatus={loadErr?.httpStatus}
          onRetry={reload}
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          <AdminCard title={t("admin_os_launch_current_title")}>
            <div className="space-y-3 px-4 py-4 sm:px-5">
              <StartPreview color={snap.build.backgroundColor} logoUrl={snap.build.logoUrl} />
              <dl className="space-y-1 sam-text-body text-sam-fg">
                <div className="flex justify-between gap-2">
                  <dt className="text-sam-muted">{t("admin_os_launch_background")}</dt>
                  <dd className="font-mono">{snap.build.backgroundColor}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-sam-muted">{t("admin_os_launch_snapshot_logo")}</dt>
                  <dd className="font-mono">{snap.build.logo.sha256.slice(0, 12)}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-sam-muted">{t("admin_os_launch_snapshot_source")}</dt>
                  <dd>
                    {snap.build.appliedFromAdmin
                      ? formatAdminManilaDateTime(snap.build.appliedFromAdmin.updatedAt)
                      : t("admin_os_launch_snapshot_source_repo")}
                  </dd>
                </div>
              </dl>
              <div className="rounded-ui-rect border border-sam-border-soft px-3 py-2">
                <p className="sam-text-body font-medium text-sam-fg">{t("admin_os_launch_deployed_title")}</p>
                <p className="sam-text-body-secondary text-sam-muted">Android · {t("admin_os_launch_deployed_unknown")}</p>
                <p className="sam-text-body-secondary text-sam-muted">iOS · {t("admin_os_launch_deployed_unknown")}</p>
              </div>
            </div>
          </AdminCard>

          <AdminCard title={t("admin_os_launch_pending_title")}>
            <div className="space-y-4 px-4 py-4 sm:px-5">
              <StartPreview color={normalizedColor ?? snap.build.backgroundColor} logoUrl={pendingLogoUrl} />
              <p
                className={`sam-text-body-secondary font-medium ${
                  snap.pendingChanged ? "text-sam-warning" : "text-sam-muted"
                }`}
              >
                {snap.pendingChanged
                  ? t("admin_os_launch_status_changed")
                  : t("admin_os_launch_status_same")}
              </p>

              <div>
                <label className="mb-1 block sam-text-body font-medium text-sam-fg" htmlFor="os-launch-color">
                  {t("admin_os_launch_background")}
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    aria-label={t("admin_os_launch_background")}
                    className="h-10 w-12 shrink-0 cursor-pointer rounded-ui-rect border border-sam-border bg-sam-surface"
                    value={normalizedColor ?? OS_LAUNCH_COLOR_PICKER_FALLBACK}
                    onChange={(e) => setColor(e.target.value.toUpperCase())}
                  />
                  <input
                    id="os-launch-color"
                    className="w-full rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2 font-mono sam-text-body text-sam-fg"
                    value={color}
                    maxLength={7}
                    onFocus={(e) => e.currentTarget.select()}
                    onChange={(e) => setColor(e.target.value)}
                  />
                  <AdminActionButton
                    variant="primary"
                    className="shrink-0"
                    type="button"
                    disabled={busy !== null || !normalizedColor}
                    onClick={() => void put("save")}
                  >
                    {busy === "save" ? t("admin_os_launch_saving") : t("admin_os_launch_save")}
                  </AdminActionButton>
                </div>
              </div>

              <div>
                <p className="mb-1 sam-text-body font-medium text-sam-fg">{t("admin_os_launch_logo")}</p>
                <p className="mb-2 sam-text-body-secondary text-sam-muted">
                  {usingBuildLogo ? t("admin_os_launch_logo_current_build") : null}
                  {usingBuildLogo ? " · " : null}
                  {t("admin_os_launch_logo_hint")}
                </p>
                <div className="flex flex-wrap gap-2">
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/png"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) void upload(f);
                    }}
                  />
                  <AdminActionButton
                    variant="secondary"
                    type="button"
                    disabled={busy !== null}
                    onClick={() => fileRef.current?.click()}
                  >
                    {busy === "upload" ? t("admin_os_launch_uploading") : t("admin_os_launch_upload")}
                  </AdminActionButton>
                  {!usingBuildLogo ? (
                    <AdminActionButton
                      variant="secondary"
                      type="button"
                      disabled={busy !== null || !normalizedColor}
                      onClick={() => void put("reset")}
                    >
                      {t("admin_os_launch_reset_logo")}
                    </AdminActionButton>
                  ) : null}
                </div>
              </div>

              {snap.pending?.updatedAt ? (
                <p className="sam-text-body-secondary text-sam-muted">
                  {t("admin_os_launch_last_saved")}: {formatAdminManilaDateTime(snap.pending.updatedAt)}
                </p>
              ) : null}
              <p className="sam-text-body-secondary text-sam-muted">{t("admin_os_launch_preview_note")}</p>
            </div>
          </AdminCard>
        </div>
      )}

      {result && snap ? (
        <AdminResultBanner ko={ko} result={result} onClose={() => setResult(null)} />
      ) : null}

      <AdminCard title={t("admin_os_launch_dev_title")}>
        <ol className="list-decimal space-y-1 px-8 py-4 sam-text-body text-sam-fg">
          <li>{t("admin_os_launch_dev_step1")}</li>
          <li>{t("admin_os_launch_dev_step2")}</li>
          <li>{t("admin_os_launch_dev_step3")}</li>
        </ol>
      </AdminCard>
    </div>
  );
}
