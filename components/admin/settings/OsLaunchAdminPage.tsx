"use client";

/**
 * 앱 진입 어드민 v3 §5 (Owner 2026-11-17 「v3대로 진행」) — 「OS 시작 화면 · 첫 진입 화면」 한 화면.
 * 왼쪽 = R17-OS "OS 시작 화면" (TRUE Android SplashScreen / iOS LaunchScreen) · 오른쪽 = 첫 진입 화면(`FirstEntrySurfaceCard`).
 *
 * OS 시작 화면은 BUILD-TIME ONLY: 지금 앱(저장소 빌드 값) vs 다음 빌드(대기 값, DB).
 * 저장해도 설치된 앱은 바뀌지 않는다 — `npm run os-launch:pull` + 네이티브 빌드로만 반영. 배경색 + 가운데 로고 1개만.
 * 로고 올리기는 공통 그림 칸(`AdminImageSlot` · `OS_LOGO_SLOT` = 서버 검사와 같은 규격) → 기존 서버 업로드 API.
 */

import { useCallback, useEffect, useState } from "react";
import { AdminCard } from "@/components/admin/AdminCard";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import {
  OS_LAUNCH_ANDROID_LOGO_WIDTH_RATIO,
  OS_LAUNCH_IOS_LOGO_WIDTH_PT,
  normalizeOsLaunchHex,
} from "@/lib/os-launch/contract";
import { formatAdminManilaDateTime } from "@/lib/admin/metrics/manila-period";
import { formatAdminNumber } from "@/lib/admin/ui-standard/admin-format";
import {
  OS_LAUNCH_COLOR_PICKER_FALLBACK,
  OS_LAUNCH_DEFAULT_BACKGROUND,
} from "@/lib/admin/platform/platform-launch-default-colors";
import { AdminActionButton } from "@/components/admin/ui/AdminActionButton";
import { AdminToneBadge } from "@/components/admin/ui/AdminToneBadge";
import { useAdminRouteAction } from "@/components/admin/access/use-admin-route-access";
import { confirmAdminAction } from "@/lib/admin/operator-ux/admin-confirm-action";
import { adminActionLevel } from "@/lib/admin/operator-ux/admin-action-levels";
import {
  AdminErrorState,
  AdminLoadingState,
  AdminResultBanner,
} from "@/components/admin/ui/AdminStateViews";
import { adminSafeErrorCode, type AdminLoadFailure } from "@/lib/admin/admin-load-failure";
import { ADMIN_CHECKER_BG, AdminImageSlot } from "@/components/admin/media/AdminImageSlot";
import { OS_LOGO_SLOT } from "@/lib/admin/media/image-slot-spec";
import type { AppEntryOverviewInstalls } from "@/lib/admin/app-entry/overview-types";
import { FirstEntrySurfaceCard } from "@/components/admin/settings/StartupConfigAdminPage";

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
  /** GET 에만 있음 (PUT·로고 응답에는 없음 — 기존 값 유지) */
  installs?: AppEntryOverviewInstalls;
};

type ApiError = { ok: false; error?: string };

/**
 * 로고 검사 거부 코드 (`checkOsLaunchLogo`). 같은 이름을 다른 업로드 화면도 쓰므로
 * `os_launch_logo_` 를 붙여 오류 문구 맵에서 이 화면 전용 문구(투명 PNG·크기 조건)를 고른다.
 */
const OS_LAUNCH_LOGO_REJECT_CODES = new Set<string>([
  "no_alpha",
  "not_png",
  "too_small",
  "too_big_dimensions",
  "too_large",
  "empty",
]);

/**
 * 미리보기 축척 (기기 실제 배치 비율):
 * - Android 12+ SplashScreen 아이콘 칸 288dp(아이콘 배경 없음) · 기준 폭 412dp 폰 · 로고 = 아이콘 칸의 44%
 *   · 안전 원 = 아이콘 칸 지름의 2/3 (바깥은 기기 마스크로 잘릴 수 있음)
 * - iOS LaunchScreen 로고 폭 106pt · 기준 폭 390pt 폰
 */
const ANDROID_SPLASH_ICON_DP = 288;
const ANDROID_REF_WIDTH_DP = 412;
const ANDROID_SAFE_CIRCLE_RATIO = 2 / 3;
const IOS_REF_WIDTH_PT = 390;
const ANDROID_LOGO_SHARE_OF_SCREEN = (ANDROID_SPLASH_ICON_DP / ANDROID_REF_WIDTH_DP) * OS_LAUNCH_ANDROID_LOGO_WIDTH_RATIO;
const IOS_LOGO_SHARE_OF_SCREEN = OS_LAUNCH_IOS_LOGO_WIDTH_PT / IOS_REF_WIDTH_PT;

const pct = (n: number) => `${(n * 100).toFixed(2)}%`;

function PhonePreview({ color, logoUrl, logoShare }: { color: string; logoUrl: string | null; logoShare: number }) {
  return (
    <div
      className="relative mx-auto flex aspect-[9/19.5] w-[120px] items-center justify-center overflow-hidden rounded-[18px] border-4 border-sam-fg"
      style={{ backgroundColor: color }}
      aria-hidden
    >
      {logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- signed / static preview URL
        <img src={logoUrl} alt="" style={{ width: pct(logoShare) }} className="h-auto" />
      ) : null}
    </div>
  );
}

/** 로고 칸(= Android 아이콘 칸) + 점선 안전 원 · 투명한 곳은 격자 */
function SafeCirclePreview({ logoUrl }: { logoUrl: string | null }) {
  return (
    <div
      className="relative flex h-[140px] w-[140px] shrink-0 items-center justify-center overflow-hidden rounded-ui-rect border border-sam-border"
      style={{ background: ADMIN_CHECKER_BG }}
      aria-hidden
      data-os-launch-safe-circle="1"
    >
      <span
        className="absolute rounded-full border-2 border-dashed border-sam-fg"
        style={{ width: pct(ANDROID_SAFE_CIRCLE_RATIO), height: pct(ANDROID_SAFE_CIRCLE_RATIO) }}
      />
      {logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- signed / static preview URL
        <img src={logoUrl} alt="" style={{ width: pct(OS_LAUNCH_ANDROID_LOGO_WIDTH_RATIO) }} className="relative h-auto" />
      ) : null}
    </div>
  );
}

export function OsLaunchAdminPage() {
  const { t, language } = useI18n();
  const ko = language !== "en";
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [installs, setInstalls] = useState<AppEntryOverviewInstalls | null>(null);
  const [color, setColor] = useState(OS_LAUNCH_DEFAULT_BACKGROUND);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<"save" | "upload" | "reset" | null>(null);
  /** OS 시작 화면 저장·로고 업로드 = ads 키 (접근표 action — API 403 과 같은 판정) */
  const adminAction = useAdminRouteAction("/admin/platform-promotion/os-start");
  const writeBlocked = busy !== null || !adminAction.allowed;
  const [loadErr, setLoadErr] = useState<AdminLoadFailure | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [result, setResult] = useState<{ ok: true; message: string } | { ok: false; code: string } | null>(null);

  const apply = useCallback((json: Snapshot) => {
    setSnap(json);
    if (json.installs) setInstalls(json.installs);
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

  /** 공통 그림 칸 1차 검사를 통과한 파일만 들어온다 → 확인창 → 기존 서버 업로드(2차 검사) */
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
      if (!confirmed.ok) return;
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
        } else {
          const code = json.error ?? "";
          fail(OS_LAUNCH_LOGO_REJECT_CODES.has(code) ? `os_launch_logo_${code}` : code);
        }
      } catch {
        fail("network_error");
      } finally {
        setBusy(null);
      }
    },
    [apply, fail, ko, t]
  );

  const normalizedColor = normalizeOsLaunchHex(color);
  const pendingLogoUrl = snap?.pending?.logoUrl ?? snap?.build.logoUrl ?? null;
  const usingBuildLogo = !snap?.pending?.logo;
  const previewColor = normalizedColor ?? snap?.build.backgroundColor ?? OS_LAUNCH_DEFAULT_BACKGROUND;
  const nextLogoSha = snap?.pending?.logo?.sha256 ?? snap?.build.logo.sha256 ?? "";
  const nextLogoChanged = Boolean(snap?.pending?.logo && snap.pending.logo.sha256 !== snap.build.logo.sha256);

  const installedLines = (() => {
    if (!installs || !installs.ok) return [t("admin_app_entry_os_installed_unknown")];
    const lines: string[] = [];
    for (const [platform, rows] of [
      ["Android", installs.android],
      ["iOS", installs.ios],
    ] as const) {
      const top = rows[0];
      if (top) {
        lines.push(
          t("admin_app_entry_os_installed_value", {
            platform,
            version: top.version === "unknown" ? t("admin_app_entry_ov_installs_unknown_version") : top.version,
            devices: formatAdminNumber(top.devices),
          })
        );
      }
    }
    return lines.length ? lines : [t("admin_app_entry_ov_installs_empty")];
  })();

  return (
    <div className="space-y-4">
      <AdminPageHeader titleKey="admin_menu_app_entry_os_first_entry" description={t("admin_app_entry_os_page_desc")} />

      <div className="grid items-start gap-4 lg:grid-cols-2">
        <AdminCard>
          <div className="space-y-4" data-app-entry-os-start="1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="sam-text-title font-semibold text-sam-fg">{t("admin_os_launch_title")}</h2>
              <AdminToneBadge tone="waiting">{t("admin_app_entry_os_build_badge")}</AdminToneBadge>
            </div>
            <div className="space-y-1">
              <p className="sam-text-body text-sam-fg">{t("admin_os_launch_apply_note")}</p>
              <p className="text-[13px] text-sam-muted">{t("admin_os_launch_unsupported")}</p>
            </div>

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
              <>
                <div className="space-y-2">
                  <p className="sam-text-body font-medium text-sam-fg">{t("admin_os_launch_logo")}</p>
                  <AdminImageSlot
                    spec={OS_LOGO_SLOT}
                    currentUrl={pendingLogoUrl}
                    currentLabel={
                      usingBuildLogo ? t("admin_os_launch_logo_current_build") : t("admin_app_entry_os_logo_pending")
                    }
                    disabled={writeBlocked}
                    onAccept={(file) => upload(file)}
                  />
                  {!usingBuildLogo ? (
                    <AdminActionButton
                      variant="secondary"
                      type="button"
                      disabled={writeBlocked || !normalizedColor}
                      onClick={() => void put("reset")}
                    >
                      {t("admin_os_launch_reset_logo")}
                    </AdminActionButton>
                  ) : null}
                  {busy === "upload" ? (
                    <p className="text-[13px] text-sam-muted">{t("admin_os_launch_uploading")}</p>
                  ) : null}
                </div>

                <div className="flex flex-wrap items-start gap-4">
                  <figure className="space-y-1">
                    <SafeCirclePreview logoUrl={pendingLogoUrl} />
                    <figcaption className="max-w-[140px] text-[12px] text-sam-muted">
                      {t("admin_app_entry_os_safe_circle")}
                    </figcaption>
                  </figure>
                  <figure className="space-y-1" data-os-launch-preview="android">
                    <PhonePreview color={previewColor} logoUrl={pendingLogoUrl} logoShare={ANDROID_LOGO_SHARE_OF_SCREEN} />
                    <figcaption className="max-w-[120px] text-[12px] text-sam-muted">
                      {t("admin_app_entry_os_android_caption", {
                        percent: Math.round(OS_LAUNCH_ANDROID_LOGO_WIDTH_RATIO * 100),
                      })}
                    </figcaption>
                  </figure>
                  <figure className="space-y-1" data-os-launch-preview="ios">
                    <PhonePreview color={previewColor} logoUrl={pendingLogoUrl} logoShare={IOS_LOGO_SHARE_OF_SCREEN} />
                    <figcaption className="max-w-[120px] text-[12px] text-sam-muted">
                      {t("admin_app_entry_os_ios_caption", { pt: OS_LAUNCH_IOS_LOGO_WIDTH_PT })}
                    </figcaption>
                  </figure>
                </div>
                <p className="text-[12px] text-sam-muted">{t("admin_os_launch_preview_note")}</p>

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
                      disabled={writeBlocked}
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
                      disabled={writeBlocked || !normalizedColor}
                      onClick={() => void put("save")}
                    >
                      {busy === "save" ? t("admin_os_launch_saving") : t("admin_os_launch_save")}
                    </AdminActionButton>
                  </div>
                </div>

                {!adminAction.allowed && adminAction.reason ? (
                  <p className="text-[13px] text-sam-muted" data-admin-action-denied="1">
                    {adminAction.reason}
                  </p>
                ) : null}

                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="sam-text-body font-semibold text-sam-fg">{t("admin_app_entry_os_compare_title")}</h3>
                    <AdminToneBadge tone={snap.pendingChanged ? "warning" : "neutral"}>
                      {snap.pendingChanged ? t("admin_os_launch_status_changed") : t("admin_os_launch_status_same")}
                    </AdminToneBadge>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-[13px]" data-os-launch-compare="1">
                      <thead>
                        <tr className="border-b border-sam-border text-left text-sam-muted">
                          <th className="py-1 pr-2 font-medium" />
                          <th className="py-1 pr-2 font-medium">{t("admin_os_launch_background")}</th>
                          <th className="py-1 pr-2 font-medium">{t("admin_os_launch_snapshot_logo")}</th>
                          <th className="py-1 font-medium">{t("admin_app_entry_os_col_installed")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr className="border-b border-sam-border-soft align-top">
                          <td className="py-1.5 pr-2 font-medium">{t("admin_app_entry_os_row_current")}</td>
                          <td className="py-1.5 pr-2 font-mono">{snap.build.backgroundColor}</td>
                          <td className="py-1.5 pr-2 font-mono">{snap.build.logo.sha256.slice(0, 12)}</td>
                          <td className="py-1.5">
                            {installedLines.map((line) => (
                              <div key={line}>{line}</div>
                            ))}
                          </td>
                        </tr>
                        <tr className="align-top">
                          <td className="py-1.5 pr-2 font-medium">{t("admin_app_entry_os_row_next")}</td>
                          <td className="py-1.5 pr-2 font-mono">
                            {snap.pending?.backgroundColor ?? snap.build.backgroundColor}
                          </td>
                          <td className="py-1.5 pr-2 font-mono">
                            {nextLogoChanged
                              ? t("admin_app_entry_os_logo_changed", { sha: nextLogoSha.slice(0, 12) })
                              : nextLogoSha.slice(0, 12)}
                          </td>
                          <td className="py-1.5">{t("admin_app_entry_os_next_not_built")}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                  {installs && installs.ok ? (
                    <p className="text-[12px] text-sam-muted">
                      {t("admin_app_entry_os_installed_note", { days: installs.windowDays })}
                    </p>
                  ) : null}
                  <p className="text-[12px] text-sam-muted">
                    {t("admin_os_launch_snapshot_source")}:{" "}
                    {snap.build.appliedFromAdmin
                      ? formatAdminManilaDateTime(snap.build.appliedFromAdmin.updatedAt)
                      : t("admin_os_launch_snapshot_source_repo")}
                    {snap.pending?.updatedAt
                      ? ` · ${t("admin_os_launch_last_saved")}: ${formatAdminManilaDateTime(snap.pending.updatedAt)}`
                      : ""}
                  </p>
                </div>
              </>
            )}
            {result && snap ? <AdminResultBanner ko={ko} result={result} onClose={() => setResult(null)} /> : null}
          </div>
        </AdminCard>

        <FirstEntrySurfaceCard />
      </div>

      <AdminCard title={t("admin_os_launch_dev_title")}>
        <ol className="list-decimal space-y-1 px-4 sam-text-body text-sam-fg">
          <li>{t("admin_os_launch_dev_step1")}</li>
          <li>{t("admin_os_launch_dev_step2")}</li>
          <li>{t("admin_os_launch_dev_step3")}</li>
        </ol>
      </AdminCard>
    </div>
  );
}
