/**
 * Single-flight Android Play In-App Update orchestration.
 * Default FLEXIBLE. Skips during calls. No infinite retry loops.
 * Flexible install completion requires explicit user confirmation (`confirmComplete`).
 */
import {
  completeAndroidFlexibleUpdate,
  getAndroidPlayUpdateInfo,
  startAndroidFlexibleUpdate,
  startAndroidImmediateUpdate,
} from "@/lib/platform/android-play-in-app-update";
import {
  decideAndroidPlayUpdateFlow,
  parseAndroidImmediateUpdateFlag,
  parseAndroidMinVersionCode,
  type AndroidUpdateServerPolicy,
} from "@/lib/platform/android-play-in-app-update-policy";
import {
  isCapacitorNativePlatform,
  resolveCapacitorShellPlatform,
} from "@/lib/platform/capacitor-native";

const COOLDOWN_MS = 30 * 60 * 1000;
const MAX_AUTO_PROMPTS_PER_SESSION = 2;
const STORAGE_KEY_LAST_PROMPT_AT = "dibay.android.play_update.last_prompt_at";

let inFlight = false;
let autoPromptCount = 0;
let lastDecisionReason: string | null = null;

type DownloadedListener = () => void;
const downloadedListeners = new Set<DownloadedListener>();

export type AndroidPlayUpdateOrchestratorResult = {
  ran: boolean;
  reason: string;
  choice?: string;
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

/**
 * Resume / cold-start entry. Safe to call often — single-flight + cooldown.
 */
export async function runAndroidPlayInAppUpdateCheck(opts?: {
  /** Manual check from Version screen — bypasses auto-prompt session cap. */
  manual?: boolean;
  /**
   * User confirmed install of an already-downloaded flexible update.
   * Without this flag, DOWNLOADED only notifies UI listeners (no auto-restart).
   */
  confirmComplete?: boolean;
}): Promise<AndroidPlayUpdateOrchestratorResult> {
  if (!isAndroidNative()) {
    return { ran: false, reason: "not_android" };
  }
  if (inFlight) {
    return { ran: false, reason: "in_flight" };
  }

  const manual = opts?.manual === true;
  const confirmComplete = opts?.confirmComplete === true;

  if (!manual && !confirmComplete) {
    if (autoPromptCount >= MAX_AUTO_PROMPTS_PER_SESSION) {
      return { ran: false, reason: "session_prompt_cap" };
    }
    const lastAt = readLastPromptAt();
    if (lastAt > 0 && Date.now() - lastAt < COOLDOWN_MS) {
      return { ran: false, reason: "cooldown" };
    }
  }

  inFlight = true;
  try {
    const infoResult = await getAndroidPlayUpdateInfo();
    if (!infoResult.ok) {
      lastDecisionReason = infoResult.code ?? infoResult.error;
      return { ran: false, reason: lastDecisionReason };
    }

    const policy = await fetchAndroidUpdateServerPolicy();
    const decision = decideAndroidPlayUpdateFlow({
      info: infoResult.info,
      policy,
      blockUi: infoResult.info.callInProgress === true,
    });
    lastDecisionReason = decision.reason;

    if (decision.choice === "none") {
      return { ran: false, reason: decision.reason, choice: "none" };
    }

    if (decision.choice === "complete_flexible") {
      notifyDownloadedListeners();
      if (!confirmComplete) {
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
      const started = await startAndroidFlexibleUpdate();
      if (!started.ok) {
        return { ran: false, reason: started.code ?? started.error, choice: "flexible" };
      }
      if (!manual) {
        autoPromptCount += 1;
        writeLastPromptAt(Date.now());
      }
      return {
        ran: true,
        reason: decision.reason,
        choice: started.result.status === "canceled" ? "flexible_canceled" : "flexible",
      };
    }

    if (decision.choice === "immediate") {
      const started = await startAndroidImmediateUpdate();
      if (!started.ok) {
        // Safe recovery: never permanently block the app when IMMEDIATE fails.
        return { ran: false, reason: started.code ?? started.error, choice: "immediate" };
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
  } finally {
    inFlight = false;
  }
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

/** Host registers to show install-confirm dialog when flexible download is ready. */
export function subscribeAndroidFlexibleInstallReady(listener: DownloadedListener): () => void {
  downloadedListeners.add(listener);
  return () => {
    downloadedListeners.delete(listener);
  };
}
