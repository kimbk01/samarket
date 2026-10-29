/**
 * Single-flight Android Play In-App Update orchestration.
 * Default FLEXIBLE. Skips during calls. No infinite retry loops.
 * Auto FLEXIBLE start requires Host confirm (`confirmStart`).
 * Flexible install completion requires explicit user confirmation (`confirmComplete`).
 * IMMEDIATE may start without soft prompt when server policy requires it (still call-blocked).
 * "나중에" on the available dialog suppresses the same Play build for 24h (localStorage, D1).
 * "나중에" on the install-ready dialog suppresses it for this app run only (D3).
 * Play consent cancel = "나중에" for that build (U2). Confirm taps wait for a running check (U3).
 * "지금 설치" never starts a new download when the state changed (U4). Server policy is
 * fetched only when a Play flow may start (U5).
 */
import {
  completeAndroidFlexibleUpdate,
  getAndroidPlayUpdateInfo,
  startAndroidFlexibleUpdate,
  startAndroidImmediateUpdate,
} from "@/lib/platform/android-play-in-app-update";
import {
  type AndroidPlayUpdateInfo,
  decideAndroidPlayUpdateFlow,
  parseAndroidImmediateUpdateFlag,
  parseAndroidMinVersionCode,
  type AndroidUpdateFlowChoice,
  type AndroidUpdateServerPolicy,
} from "@/lib/platform/android-play-in-app-update-policy";
import {
  isCapacitorNativePlatform,
  resolveCapacitorShellPlatform,
} from "@/lib/platform/capacitor-native";
import {
  readUpdatePromptSafetyInput,
  resolveUpdatePromptSafety,
} from "@/lib/platform/android-play-update-prompt-gate";

const COOLDOWN_MS = 30 * 60 * 1000;
const MAX_AUTO_PROMPTS_PER_SESSION = 2;
const STORAGE_KEY_LAST_PROMPT_AT = "dibay.android.play_update.last_prompt_at";
const DEFERRAL_SUPPRESS_MS = 24 * 60 * 60 * 1000;
const STORAGE_KEY_DEFERRAL = "dibay.android.play_update.deferred";

let inFlightRun: Promise<AndroidPlayUpdateOrchestratorResult> | null = null;
/** Read through a function so TS does not narrow across `await`. */
function readInFlightRun(): Promise<AndroidPlayUpdateOrchestratorResult> | null {
  return inFlightRun;
}
let autoPromptCount = 0;
let lastDecisionReason: string | null = null;
/** D3: install-ready "나중에" — memory only, so the next app run re-checks real Play state. */
let installReadyDismissedThisRun = false;

type DownloadedListener = () => void;
const downloadedListeners = new Set<DownloadedListener>();

export type AndroidPlayUpdateAvailablePayload = {
  choice: "flexible";
  reason: string;
  /** Values below come only from the native plugin — never guessed. */
  availableVersionCode?: number;
  installedVersionCode?: number;
  installedVersionName?: string;
};

type AvailableListener = (payload: AndroidPlayUpdateAvailablePayload) => void;
const availableListeners = new Set<AvailableListener>();

export type AndroidPlayUpdateOrchestratorResult = {
  ran: boolean;
  reason: string;
  choice?: string;
};

/** Pure gate: auto FLEXIBLE must wait for Host "지금 업데이트" confirm. */
export function shouldAwaitUserConfirmToStart(opts: {
  manual: boolean;
  confirmStart: boolean;
  choice: AndroidUpdateFlowChoice;
}): boolean {
  if (opts.manual || opts.confirmStart) return false;
  return opts.choice === "flexible";
}

/** "나중에" record for one Play build (`versionCode` 0 = Play did not report a build). */
export type AndroidPlayUpdateDeferral = { versionCode: number; at: number };

/** Corrupt / foreign values → null (treated as not deferred). */
export function parseAndroidPlayUpdateDeferral(
  raw: string | null | undefined
): AndroidPlayUpdateDeferral | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { versionCode?: unknown; at?: unknown };
    const versionCode = parsed?.versionCode;
    const at = parsed?.at;
    if (typeof versionCode !== "number" || !Number.isFinite(versionCode) || versionCode < 0) {
      return null;
    }
    if (typeof at !== "number" || !Number.isFinite(at) || at <= 0) return null;
    return { versionCode: Math.floor(versionCode), at };
  } catch {
    return null;
  }
}

/** Pure gate: same (or older) Play build deferred within 24h → no auto available dialog. */
export function isAndroidPlayUpdateDeferred(args: {
  deferral: AndroidPlayUpdateDeferral | null;
  availableVersionCode: number | null | undefined;
  now: number;
}): boolean {
  const { deferral, now } = args;
  if (!deferral) return false;
  const age = now - deferral.at;
  if (age < 0 || age >= DEFERRAL_SUPPRESS_MS) return false;
  const available = args.availableVersionCode ?? 0;
  return available <= deferral.versionCode;
}

function readDeferral(): AndroidPlayUpdateDeferral | null {
  if (typeof window === "undefined") return null;
  try {
    return parseAndroidPlayUpdateDeferral(window.localStorage?.getItem(STORAGE_KEY_DEFERRAL));
  } catch {
    return null;
  }
}

function writeDeferral(deferral: AndroidPlayUpdateDeferral): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage?.setItem(STORAGE_KEY_DEFERRAL, JSON.stringify(deferral));
  } catch {
    // ignore
  }
}

function toAvailablePayload(
  reason: string,
  info: AndroidPlayUpdateInfo
): AndroidPlayUpdateAvailablePayload {
  return {
    choice: "flexible",
    reason,
    availableVersionCode: info.availableVersionCode,
    installedVersionCode: info.installedVersionCode,
    installedVersionName: info.installedVersionName,
  };
}

/** U5: server policy only matters when a Play flow may start. */
export function shouldFetchAndroidUpdateServerPolicy(info: AndroidPlayUpdateInfo): boolean {
  if (info.installStatus === "DOWNLOADED") return false;
  if (info.callInProgress === true) return false;
  return (
    info.updateAvailability === "UPDATE_AVAILABLE" ||
    info.updateAvailability === "DEVELOPER_TRIGGERED_UPDATE_IN_PROGRESS"
  );
}

const NO_SERVER_POLICY: AndroidUpdateServerPolicy = {
  androidMinVersionCode: null,
  androidImmediateUpdate: false,
};

function isAndroidNative(): boolean {
  return isCapacitorNativePlatform() && resolveCapacitorShellPlatform() === "android";
}

function readLastPromptAt(): number {
  if (typeof window === "undefined") return 0;
  try {
    const raw = window.sessionStorage?.getItem(STORAGE_KEY_LAST_PROMPT_AT);
    const n = raw ? Number(raw) : 0;
    return Number.isFinite(n) ? n : 0;
  } catch {
    return 0;
  }
}

function writeLastPromptAt(at: number): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage?.setItem(STORAGE_KEY_LAST_PROMPT_AT, String(at));
  } catch {
    // ignore
  }
}

export async function fetchAndroidUpdateServerPolicy(): Promise<AndroidUpdateServerPolicy> {
  const fallback: AndroidUpdateServerPolicy = {
    androidMinVersionCode: null,
    androidImmediateUpdate: false,
  };
  try {
    const res = await fetch("/api/me/settings/version", {
      credentials: "include",
      cache: "no-store",
    });
    const json = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      androidMinVersionCode?: string | number | null;
      androidImmediateUpdate?: string | boolean | null;
    };
    if (!res.ok || !json.ok) return fallback;
    const minRaw =
      json.androidMinVersionCode == null ? null : String(json.androidMinVersionCode);
    const flagRaw =
      json.androidImmediateUpdate == null
        ? null
        : typeof json.androidImmediateUpdate === "boolean"
          ? json.androidImmediateUpdate
            ? "true"
            : "false"
          : String(json.androidImmediateUpdate);
    return {
      androidMinVersionCode: parseAndroidMinVersionCode(minRaw),
      androidImmediateUpdate: parseAndroidImmediateUpdateFlag(flagRaw),
    };
  } catch {
    return fallback;
  }
}

type CheckOptions = {
  /** Manual check from Version screen — bypasses auto-prompt session cap. */
  manual?: boolean;
  /**
   * User confirmed install of an already-downloaded flexible update.
   * Without this flag, DOWNLOADED only notifies UI listeners (no auto-restart).
   */
  confirmComplete?: boolean;
  /**
   * User confirmed starting FLEXIBLE download (Host "지금 업데이트").
   * Without this on auto-check, FLEXIBLE only notifies available listeners.
   */
  confirmStart?: boolean;
};

/**
 * Resume / cold-start entry. Safe to call often — single-flight + cooldown.
 * A user confirm that lands during a running check waits for it, then runs once more
 * (the running check never opens a Play flow without confirm, so no duplicate consent UI).
 */
export async function runAndroidPlayInAppUpdateCheck(
  opts?: CheckOptions
): Promise<AndroidPlayUpdateOrchestratorResult> {
  if (!isAndroidNative()) {
    return { ran: false, reason: "not_android" };
  }
  if (inFlightRun) {
    const userConfirmed = opts?.confirmStart === true || opts?.confirmComplete === true;
    if (!userConfirmed) return { ran: false, reason: "in_flight" };
    await inFlightRun.catch(() => undefined);
    // Another run may have started while waiting — retry only once, never queue.
    if (readInFlightRun()) return { ran: false, reason: "in_flight" };
  }
  const run: Promise<AndroidPlayUpdateOrchestratorResult> = runCheckOnce(opts).finally(() => {
    if (inFlightRun === run) inFlightRun = null;
  });
  inFlightRun = run;
  return run;
}

async function runCheckOnce(opts?: CheckOptions): Promise<AndroidPlayUpdateOrchestratorResult> {
  const manual = opts?.manual === true;
  const confirmComplete = opts?.confirmComplete === true;
  const confirmStart = opts?.confirmStart === true;

  if (!manual && !confirmComplete && !confirmStart) {
    if (autoPromptCount >= MAX_AUTO_PROMPTS_PER_SESSION) {
      return { ran: false, reason: "session_prompt_cap" };
    }
    const lastAt = readLastPromptAt();
    if (lastAt > 0 && Date.now() - lastAt < COOLDOWN_MS) {
      return { ran: false, reason: "cooldown" };
    }
  }

  {
    const infoResult = await getAndroidPlayUpdateInfo();
    if (!infoResult.ok) {
      lastDecisionReason = infoResult.code ?? infoResult.error;
      return { ran: false, reason: lastDecisionReason };
    }

    const policy = shouldFetchAndroidUpdateServerPolicy(infoResult.info)
      ? await fetchAndroidUpdateServerPolicy()
      : NO_SERVER_POLICY;
    const decision = decideAndroidPlayUpdateFlow({
      info: infoResult.info,
      policy,
      blockUi: infoResult.info.callInProgress === true,
    });
    lastDecisionReason = decision.reason;

    if (confirmComplete && decision.choice !== "complete_flexible") {
      // Installed already / download gone: never turn "지금 설치" into a new download.
      const reason =
        decision.reason === "downloaded_but_ui_blocked" ? decision.reason : "install_not_ready";
      return { ran: false, reason, choice: "none" };
    }

    if (decision.choice === "none") {
      return { ran: false, reason: decision.reason, choice: "none" };
    }

    if (decision.choice === "complete_flexible") {
      if (!confirmComplete) {
        if (!installReadyDismissedThisRun) notifyDownloadedListeners();
        return { ran: false, reason: "awaiting_install_confirmation", choice: "complete_flexible" };
      }
      const completed = await completeAndroidFlexibleUpdate();
      if (!completed.ok) {
        return {
          ran: false,
          reason: completed.code ?? completed.error,
          choice: "complete_flexible",
        };
      }
      return { ran: true, reason: decision.reason, choice: "complete_flexible" };
    }

    if (decision.choice === "flexible") {
      if (
        shouldAwaitUserConfirmToStart({
          manual,
          confirmStart,
          choice: "flexible",
        })
      ) {
        if (
          isAndroidPlayUpdateDeferred({
            deferral: readDeferral(),
            availableVersionCode: infoResult.info.availableVersionCode,
            now: Date.now(),
          })
        ) {
          return { ran: false, reason: "deferred_same_build", choice: "none" };
        }
        notifyAvailableListeners(toAvailablePayload(decision.reason, infoResult.info));
        return { ran: false, reason: "awaiting_start_confirmation", choice: "flexible" };
      }
      const started = await startAndroidFlexibleUpdate();
      if (!started.ok) {
        return { ran: false, reason: started.code ?? started.error, choice: "flexible" };
      }
      if (started.result.status === "failed") {
        return { ran: false, reason: "update_flow_failed", choice: "flexible" };
      }
      if (started.result.status === "canceled") {
        // U2: user closed Play consent — same as "나중에" for this build (FLEXIBLE only).
        if (!manual) acknowledgeAndroidPlayUpdateDeferred(infoResult.info.availableVersionCode);
        return { ran: true, reason: decision.reason, choice: "flexible_canceled" };
      }
      if (!manual) {
        autoPromptCount += 1;
        writeLastPromptAt(Date.now());
      }
      return { ran: true, reason: decision.reason, choice: "flexible" };
    }

    if (decision.choice === "immediate") {
      // IMMEDIATE takes over the screen — auto start waits for the same safe moment as the
      // prompts (no intro / chat / call / checkout / write / other dialog / typing). Nothing
      // is counted, so the Host retries once the screen is safe (or on the next resume).
      if (!manual) {
        const safety = resolveUpdatePromptSafety(
          readUpdatePromptSafetyInput({
            pathname: typeof window !== "undefined" ? window.location?.pathname : null,
            callActive: infoResult.info.callInProgress === true,
            ownDialogsOpen: 0,
          })
        );
        if (!safety.safe) {
          notifyImmediateHeldListeners();
          return { ran: false, reason: `immediate_held_${safety.reason}`, choice: "immediate" };
        }
      }
      const started = await startAndroidImmediateUpdate();
      if (!started.ok) {
        // Safe recovery: never permanently block the app when IMMEDIATE fails.
        return { ran: false, reason: started.code ?? started.error, choice: "immediate" };
      }
      if (started.result.status === "failed") {
        return { ran: false, reason: "update_flow_failed", choice: "immediate" };
      }
      if (!manual) {
        autoPromptCount += 1;
        writeLastPromptAt(Date.now());
      }
      return {
        ran: true,
        reason: decision.reason,
        choice: started.result.status === "canceled" ? "immediate_canceled" : "immediate",
      };
    }

    return { ran: false, reason: "unhandled_choice", choice: decision.choice };
  }
}

/**
 * User chose "나중에" on the available-update dialog — session cooldown plus
 * 24h suppression of this Play build (a higher build prompts again).
 */
export function acknowledgeAndroidPlayUpdateDeferred(availableVersionCode?: number): void {
  const now = Date.now();
  autoPromptCount += 1;
  writeLastPromptAt(now);
  const versionCode =
    typeof availableVersionCode === "number" && Number.isFinite(availableVersionCode)
      ? Math.max(0, Math.floor(availableVersionCode))
      : 0;
  writeDeferral({ versionCode, at: now });
}

/** User chose "나중에" on the install-ready dialog — hide it for the rest of this app run. */
export function dismissAndroidFlexibleInstallReadyForThisRun(): void {
  installReadyDismissedThisRun = true;
}

export function isAndroidFlexibleInstallReadyDismissedForThisRun(): boolean {
  return installReadyDismissedThisRun;
}

export function getLastAndroidPlayUpdateDecisionReason(): string | null {
  return lastDecisionReason;
}

function notifyDownloadedListeners(): void {
  for (const listener of downloadedListeners) {
    try {
      listener();
    } catch {
      // UI listeners must not break the orchestrator.
    }
  }
}

function notifyAvailableListeners(payload: AndroidPlayUpdateAvailablePayload): void {
  for (const listener of availableListeners) {
    try {
      listener(payload);
    } catch {
      // UI listeners must not break the orchestrator.
    }
  }
}

type ImmediateHeldListener = () => void;
const immediateHeldListeners = new Set<ImmediateHeldListener>();

function notifyImmediateHeldListeners(): void {
  for (const listener of immediateHeldListeners) {
    try {
      listener();
    } catch {
      // UI listeners must not break the orchestrator.
    }
  }
}

/** Host registers to retry a held IMMEDIATE start once the screen is safe. */
export function subscribeAndroidImmediateUpdateHeld(listener: ImmediateHeldListener): () => void {
  immediateHeldListeners.add(listener);
  return () => {
    immediateHeldListeners.delete(listener);
  };
}

/** Host registers to show install-confirm dialog when flexible download is ready. */
export function subscribeAndroidFlexibleInstallReady(listener: DownloadedListener): () => void {
  downloadedListeners.add(listener);
  return () => {
    downloadedListeners.delete(listener);
  };
}

/** Host registers to show "새 업데이트 / 지금·나중에" before FLEXIBLE download starts. */
export function subscribeAndroidFlexibleUpdateAvailable(listener: AvailableListener): () => void {
  availableListeners.add(listener);
  return () => {
    availableListeners.delete(listener);
  };
}
