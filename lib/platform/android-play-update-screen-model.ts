/**
 * Full-screen Android update screen (Owner 2026-11-03 · 페이스북 형태) — one screen from
 * 「업데이트」 to install. Pure step model: Play install events → screen step / percent / effect.
 * Design: `docs/audit/android-update-fullscreen-progress-design-2026-11-03.md`.
 */
import {
  isAndroidPlayUpdateInProgress,
  type PlayInstallStatus,
} from "@/lib/platform/android-play-in-app-update-policy";
import type { AndroidPlayUpdateAvailablePayload } from "@/lib/platform/android-play-in-app-update-orchestrator";

export type UpdateScreenStep =
  /** ① 안내 — 「업데이트」 (일반: 「나중에」). */
  | "intro"
  /** ③ 업데이트 준비 중… — Play consent / PENDING / DOWNLOADED before install. */
  | "preparing"
  /** ④ 다운로드 중… N% */
  | "downloading"
  /** ⑤ 설치 중… — completeUpdate sent, app restarts. */
  | "installing"
  /** ⑤′ 다운로드가 끝났는데 화면이 닫혀 있었음 — 「설치」 1회. */
  | "ready";

export type UpdateScreenError =
  | "blocked_by_call"
  | "start_failed"
  | "install_failed"
  | "download_failed";

export type UpdateScreenState = {
  step: UpdateScreenStep;
  /** Server policy requires the update — no 「나중에」 / 「닫기」, back is swallowed. */
  forced: boolean;
  /** 0–100 while downloading with a known total; null = indeterminate bar. */
  percent: number | null;
  /** Download finished during a call — install runs when the call ends. */
  waitingForCall: boolean;
  error: UpdateScreenError | null;
  payload: AndroidPlayUpdateAvailablePayload | null;
};

export type UpdateInstallEvent = {
  installStatus: PlayInstallStatus;
  bytesDownloaded?: number;
  totalBytesToDownload?: number;
};

export type UpdateScreenEffect = "none" | "complete" | "close";

export function createUpdateScreenState(
  step: UpdateScreenStep,
  opts?: { forced?: boolean; payload?: AndroidPlayUpdateAvailablePayload | null }
): UpdateScreenState {
  return {
    step,
    forced: opts?.forced === true,
    percent: null,
    waitingForCall: false,
    error: null,
    payload: opts?.payload ?? null,
  };
}

/** Download percent (floored, 0–100); null when Play has not reported a total yet. */
export function resolveUpdateDownloadPercent(
  bytesDownloaded: number | null | undefined,
  totalBytesToDownload: number | null | undefined
): number | null {
  if (typeof bytesDownloaded !== "number" || typeof totalBytesToDownload !== "number") return null;
  if (!Number.isFinite(bytesDownloaded) || !Number.isFinite(totalBytesToDownload)) return null;
  if (totalBytesToDownload <= 0) return null;
  return Math.min(100, Math.max(0, Math.floor((bytesDownloaded / totalBytesToDownload) * 100)));
}

/** Steps that follow a running download — they yield to a call banner as a held 「progress」. */
export function isUpdateScreenProgressStep(step: UpdateScreenStep): boolean {
  return step === "preparing" || step === "downloading";
}

/**
 * Play install event → next screen state. The screen never closes by itself except when Play
 * reports the download canceled (from the Play notification) on a non-forced update.
 * `complete` = the download finished while the screen is open → install now (no second confirm).
 */
export function reduceUpdateScreenOnInstallEvent(
  screen: UpdateScreenState,
  event: UpdateInstallEvent
): { screen: UpdateScreenState; effect: UpdateScreenEffect } {
  const status = event.installStatus;
  if (screen.step === "installing") {
    if (status === "FAILED") {
      return { screen: { ...screen, step: "ready", error: "install_failed" }, effect: "none" };
    }
    return { screen, effect: "none" };
  }
  if (status === "PENDING") {
    return {
      screen: { ...screen, step: "preparing", percent: null, error: null },
      effect: "none",
    };
  }
  if (status === "DOWNLOADING") {
    const percent = resolveUpdateDownloadPercent(event.bytesDownloaded, event.totalBytesToDownload);
    return {
      screen: {
        ...screen,
        step: "downloading",
        // Status-only reads (no byte counts) keep the last known percent.
        percent: percent ?? (screen.step === "downloading" ? screen.percent : null),
        error: null,
      },
      effect: "none",
    };
  }
  if (status === "DOWNLOADED") {
    if (screen.step === "ready") return { screen, effect: "none" };
    return {
      screen: { ...screen, step: "preparing", percent: null, error: null },
      effect: screen.waitingForCall ? "none" : "complete",
    };
  }
  if (status === "INSTALLING") {
    return { screen: { ...screen, step: "installing", percent: null, error: null }, effect: "none" };
  }
  if (status === "FAILED") {
    return {
      screen: { ...screen, step: "intro", percent: null, waitingForCall: false, error: "download_failed" },
      effect: "none",
    };
  }
  if (status === "CANCELED") {
    if (!screen.forced) return { screen, effect: "close" };
    return {
      screen: { ...screen, step: "intro", percent: null, waitingForCall: false, error: null },
      effect: "none",
    };
  }
  return { screen, effect: "none" };
}

/**
 * A status read (no event) also moves the screen forward — old binaries lose the native listener
 * after a restart. Only forward states: a stale FAILED / CANCELED from an earlier run must not
 * close a fresh download (those arrive as live events).
 */
export function shouldApplyPolledInstallStatus(status: PlayInstallStatus | null | undefined): boolean {
  if (!status) return false;
  return isAndroidPlayUpdateInProgress(status) || status === "DOWNLOADED";
}
