"use client";

import Image from "next/image";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { DibayOverlayRoot, useOverlayTitleIds } from "@/components/ui/dibay-overlay/DibayOverlayRoot";
import { DIBAY_APP_ICON_512_PATH, dibayBrandAssetUrl } from "@/lib/brand/brand-asset-paths";
import { formatInstalledVersionLabel } from "@/lib/platform/format-installed-version-label";
import {
  formatUpdateDownloadSizeMb,
  type UpdateScreenError,
  type UpdateScreenState,
} from "@/lib/platform/android-play-update-screen-model";
import { Sam } from "@/lib/ui/css-vars";

export type AndroidPlayUpdateScreenProps = {
  /** null = closed. */
  screen: UpdateScreenState | null;
  /** A Play call is running (start / install) — buttons are disabled. */
  busy: boolean;
  onUpdate: () => void;
  onLater: () => void;
  onClose: () => void;
  onInstall: () => void;
  onDetails: () => void;
};

/**
 * Full-screen update screen (Owner 2026-11-03 · 페이스북 형태): one screen from 「업데이트」 to
 * install — logo, title, then a progress bar whose label / percent changes per step.
 * Steps & transitions: `lib/platform/android-play-update-screen-model.ts` (state lives in the Host).
 * Android back = 「나중에」/「닫기」 (non-forced); swallowed on a forced update and while installing.
 */
export function AndroidPlayUpdateScreen({
  screen,
  busy,
  onUpdate,
  onLater,
  onClose,
  onInstall,
  onDetails,
}: AndroidPlayUpdateScreenProps) {
  const { safeT } = useI18n();
  const { titleId } = useOverlayTitleIds("android-update");

  const step = screen?.step ?? "intro";
  const forced = screen?.forced === true;
  const dismissible = Boolean(screen) && !forced && step !== "installing" && !busy;
  const onBack = step === "intro" ? onLater : step === "ready" ? onLater : onClose;

  const errorText = (error: UpdateScreenError | null): string | null => {
    if (error === "blocked_by_call") {
      return safeT("settings_version_blocked_by_call");
    }
    if (error === "start_failed") {
      return safeT("settings_version_start_failed");
    }
    if (error === "install_failed") {
      return safeT("settings_version_install_failed");
    }
    if (error === "download_failed") {
      return safeT("settings_update_screen_download_failed");
    }
    return null;
  };

  const later = safeT("settings_version_install_later");
  const error = errorText(screen?.error ?? null);
  const showProgress = step === "preparing" || step === "downloading" || step === "installing";

  const progressLabel =
    step === "downloading"
      ? safeT("settings_update_screen_downloading")
      : step === "installing"
        ? safeT("settings_update_screen_installing")
        : safeT("settings_update_screen_preparing");
  const percent = step === "downloading" ? (screen?.percent ?? null) : null;

  const payload = screen?.payload ?? null;
  const installedLabel = formatInstalledVersionLabel(payload?.installedVersionName, payload?.installedVersionCode);
  const sizeLabel = formatUpdateDownloadSizeMb(payload?.totalBytesToDownload);
  const newBuild =
    payload?.availableVersionCode != null && payload.availableVersionCode > 0 ? payload.availableVersionCode : null;

  return (
    <DibayOverlayRoot
      open={Boolean(screen)}
      onClose={onBack}
      dismissible={dismissible}
      placement="full"
      zRole="sheet"
      labelledBy={titleId}
      stageClassName="!p-0"
      stageStyle={{ top: 0, bottom: 0, height: "auto" }}
    >
      <div
        className="flex h-full min-h-0 w-full flex-col bg-sam-surface px-5 text-sam-fg"
        style={{
          paddingTop: "var(--safe-top, 0px)",
          paddingBottom: "max(1rem, var(--safe-bottom, 0px))",
        }}
        data-testid="android-play-update-screen"
        data-step={step}
        data-forced={forced ? "true" : "false"}
      >
        <div className="flex h-12 shrink-0 items-center justify-end">
          {!forced && (step === "intro" || step === "ready") ? (
            <button
              type="button"
              className="min-h-[44px] px-1 text-[15px] text-sam-muted disabled:opacity-50"
              onClick={onLater}
              disabled={busy}
            >
              {later}
            </button>
          ) : null}
        </div>

        <Image
          src={dibayBrandAssetUrl(DIBAY_APP_ICON_512_PATH)}
          alt=""
          width={88}
          height={88}
          unoptimized
          priority
          className={`mx-auto block shrink-0 rounded-[20px] ${showProgress ? "mt-[12vh]" : "mt-[6vh]"}`}
        />

        {showProgress ? (
          <div className="mt-[18vh]">
            <div
              className="relative h-[3px] w-full overflow-hidden bg-sam-primary-soft"
              role="progressbar"
              aria-label={progressLabel}
              aria-valuemin={percent != null ? 0 : undefined}
              aria-valuemax={percent != null ? 100 : undefined}
              aria-valuenow={percent ?? undefined}
              data-testid="android-play-update-progress"
            >
              {percent != null ? (
                <span
                  className="absolute inset-y-0 left-0 bg-sam-primary transition-[width] duration-300"
                  style={{ width: `${percent}%` }}
                />
              ) : (
                <span className="android-update-indeterminate absolute inset-y-0 w-1/6 bg-sam-primary" />
              )}
            </div>
            <div className="mt-5 flex min-h-[44px] items-center gap-4 text-[16px] text-sam-muted">
              <span className="min-w-0 flex-1" id={titleId}>
                {progressLabel}
              </span>
              {percent != null ? (
                <span className="tabular-nums" data-testid="android-play-update-percent">
                  {percent}%
                </span>
              ) : null}
              {!forced && step !== "installing" ? (
                <button
                  type="button"
                  className="min-h-[44px] font-semibold text-sam-primary"
                  onClick={onClose}
                >
                  {safeT("settings_update_screen_close")}
                </button>
              ) : null}
            </div>
            {screen?.waitingForCall ? (
              <p className="mt-2 text-[13px] text-sam-muted" data-testid="android-play-update-wait-call">
                {safeT("settings_update_screen_wait_call")}
              </p>
            ) : null}
          </div>
        ) : (
          <>
            <h1 id={titleId} className="mt-5 text-center text-[22px] font-extrabold tracking-[-0.3px]">
              {step === "ready"
                ? safeT("settings_update_screen_ready_title")
                : safeT("settings_update_screen_title")}
            </h1>
            <p className="mx-auto mt-2 max-w-[22rem] text-center text-[15px] leading-relaxed text-sam-fg">
              {step === "ready"
                ? safeT("settings_update_screen_ready_desc")
                : forced
                  ? safeT("settings_update_screen_desc_forced")
                  : safeT("settings_update_screen_desc")}
            </p>
            {step === "intro" && sizeLabel ? (
              <p className="mt-1 text-center text-[13px] text-sam-fg" data-testid="android-play-update-size">
                {safeT("settings_update_screen_size")}:{" "}
                {sizeLabel}
              </p>
            ) : null}
            {step === "intro" && (installedLabel || newBuild != null) ? (
              <p
                className="mt-3 text-center text-[13px] tabular-nums text-sam-muted"
                data-testid="android-play-update-versions"
              >
                {installedLabel ? (
                  <>
                    {safeT("settings_version_current_label")}{" "}
                    <span className="font-semibold text-sam-fg">{installedLabel}</span>
                  </>
                ) : null}
                {installedLabel && newBuild != null ? " · " : null}
                {newBuild != null ? (
                  <>
                    {safeT("settings_version_new_build_label")}{" "}
                    <span className="font-semibold text-sam-fg">{newBuild}</span>
                  </>
                ) : null}
              </p>
            ) : null}
            {step === "intro" && !forced ? (
              <button
                type="button"
                className="mx-auto mt-3 block min-h-[44px] text-[14px] font-semibold text-sam-primary"
                onClick={onDetails}
              >
                {safeT("settings_update_screen_details")}
              </button>
            ) : null}
          </>
        )}

        <div className="min-h-0 flex-1" />

        {error ? (
          <p
            className="mb-3 text-center text-[13px] text-[color:var(--overlay-danger)]"
            role="alert"
            data-testid="android-play-update-error"
          >
            {error}
          </p>
        ) : null}

        {step === "intro" || step === "ready" ? (
          <button
            type="button"
            className={`${Sam.btn.primaryCombo} h-12 w-full shrink-0 rounded-ui-rect text-[17px] font-bold`}
            onClick={step === "ready" ? onInstall : onUpdate}
            disabled={busy}
            data-testid="android-play-update-cta"
          >
            {step === "ready"
              ? safeT("settings_update_screen_install")
              : error
                ? safeT("settings_update_screen_retry")
                : safeT("settings_version_update_button")}
          </button>
        ) : null}
      </div>
    </DibayOverlayRoot>
  );
}
