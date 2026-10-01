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

type Snapshot = {
  ok: true;
  build: { backgroundColor: string; logoUrl: string | null; logo: { sha256: string } };
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
  const { t } = useI18n();
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [color, setColor] = useState("#075740");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<"save" | "upload" | "reset" | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const apply = useCallback((json: Snapshot) => {
    setSnap(json);
    setColor(json.pending?.backgroundColor ?? json.build.backgroundColor);
  }, []);

  const fail = useCallback(
    (error: string | undefined) => setMessage(t("admin_os_launch_error", { error: error ?? "error" })),
    [t]
  );

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/admin/os-launch", { credentials: "same-origin" });
        const json = (await res.json()) as Snapshot | ApiError;
        if (cancelled) return;
        if (json.ok) apply(json);
        else fail(json.error);
      } catch {
        if (!cancelled) fail("network");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [apply, fail]);

  const put = useCallback(
    async (kind: "save" | "reset") => {
      const normalized = normalizeOsLaunchHex(color);
      if (!normalized) {
        fail("invalid_color");
        return;
      }
      setBusy(kind);
      setMessage(null);
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
          setMessage(t("admin_os_launch_saved"));
        } else fail(json.error);
      } catch {
        fail("network");
      } finally {
        setBusy(null);
      }
    },
    [apply, color, fail, t]
  );

  const upload = useCallback(
    async (file: File) => {
      setBusy("upload");
      setMessage(null);
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
          setMessage(t("admin_os_launch_saved"));
        } else fail(json.error);
      } catch {
        fail("network");
      } finally {
        setBusy(null);
        if (fileRef.current) fileRef.current.value = "";
      }
    },
    [apply, fail, t]
  );

  const normalizedColor = normalizeOsLaunchHex(color);
  const pendingLogoUrl = snap?.pending?.logoUrl ?? snap?.build.logoUrl ?? null;
  const usingBuildLogo = !snap?.pending?.logo;

  return (
    <div className="space-y-4">
      <AdminPageHeader title={t("admin_os_launch_title")} description={t("admin_os_launch_desc")} />

      <AdminCard>
        <div className="space-y-1 px-4 py-3.5 sm:px-5">
          <p className="sam-text-body font-medium text-sam-fg">{t("admin_os_launch_apply_note")}</p>
          <p className="sam-text-body-secondary text-sam-muted">{t("admin_os_launch_unsupported")}</p>
        </div>
      </AdminCard>

      {loading || !snap ? (
        <p className="sam-text-body text-sam-muted">{loading ? t("common_loading") : message}</p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          <AdminCard title={t("admin_os_launch_current_title")}>
            <div className="space-y-3 px-4 py-4 sm:px-5">
              <StartPreview color={snap.build.backgroundColor} logoUrl={snap.build.logoUrl} />
              <dl className="sam-text-body text-sam-fg">
                <div className="flex justify-between gap-2">
                  <dt className="text-sam-muted">{t("admin_os_launch_background")}</dt>
                  <dd className="font-mono">{snap.build.backgroundColor}</dd>
                </div>
              </dl>
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
                    value={normalizedColor ?? "#000000"}
                    onChange={(e) => setColor(e.target.value.toUpperCase())}
                  />
                  <input
                    id="os-launch-color"
                    className="w-full rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2 font-mono sam-text-body text-sam-fg"
                    value={color}
                    maxLength={7}
                    onChange={(e) => setColor(e.target.value)}
                  />
                  <button
                    type="button"
                    className="sam-btn sam-btn--primary shrink-0"
                    disabled={busy !== null || !normalizedColor}
                    onClick={() => void put("save")}
                  >
                    {busy === "save" ? t("admin_os_launch_saving") : t("admin_os_launch_save")}
                  </button>
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
                  <button
                    type="button"
                    className="sam-btn sam-btn--secondary"
                    disabled={busy !== null}
                    onClick={() => fileRef.current?.click()}
                  >
                    {busy === "upload" ? t("admin_os_launch_uploading") : t("admin_os_launch_upload")}
                  </button>
                  {!usingBuildLogo ? (
                    <button
                      type="button"
                      className="sam-btn sam-btn--secondary"
                      disabled={busy !== null || !normalizedColor}
                      onClick={() => void put("reset")}
                    >
                      {t("admin_os_launch_reset_logo")}
                    </button>
                  ) : null}
                </div>
              </div>

              {snap.pending?.updatedAt ? (
                <p className="sam-text-body-secondary text-sam-muted">
                  {t("admin_os_launch_last_saved")}: {new Date(snap.pending.updatedAt).toLocaleString()}
                </p>
              ) : null}
              <p className="sam-text-body-secondary text-sam-muted">{t("admin_os_launch_preview_note")}</p>
            </div>
          </AdminCard>
        </div>
      )}

      {message && snap ? (
        <p className="sam-text-body text-sam-fg" role="status">
          {message}
        </p>
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
