/**
 * Capacitor bridge for DibayPlayInAppUpdate (Android Play In-App Updates).
 * iOS / web: all methods no-op or return null — never call Play APIs there.
 */
import { registerPlugin, type PluginListenerHandle } from "@capacitor/core";
import {
  isCapacitorBridgeReady,
  isCapacitorNativePlatform,
  resolveCapacitorShellPlatform,
  waitForCapacitorBridgeReady,
} from "@/lib/platform/capacitor-native";
import type {
  AndroidPlayUpdateInfo,
  PlayInstallStatus,
  PlayUpdateAvailability,
} from "@/lib/platform/android-play-in-app-update-policy";

export const DIBAY_PLAY_IN_APP_UPDATE_PLUGIN_ID = "DibayPlayInAppUpdate";

export type AndroidInstalledVersion = {
  versionName: string;
  versionCode: number;
  packageName: string;
};

export type AndroidPlayUpdateFlowResult = {
  ok: boolean;
  status: "accepted" | "canceled" | "failed" | string;
  flowType?: string;
  resultCode?: number;
};

type DibayPlayInAppUpdatePlugin = {
  getInstalledVersion(): Promise<AndroidInstalledVersion>;
  getUpdateInfo(): Promise<Record<string, unknown>>;
  startFlexibleUpdate(): Promise<AndroidPlayUpdateFlowResult>;
  startImmediateUpdate(): Promise<AndroidPlayUpdateFlowResult>;
  completeFlexibleUpdate(): Promise<{ ok: boolean }>;
  addListener(
    eventName: "installStatus" | "flexibleUpdateDownloaded",
    listenerFunc: (event: Record<string, unknown>) => void
  ): Promise<PluginListenerHandle>;
};

const Plugin = registerPlugin<DibayPlayInAppUpdatePlugin>(DIBAY_PLAY_IN_APP_UPDATE_PLUGIN_ID);

function isAndroidNativeShell(): boolean {
  return isCapacitorNativePlatform() && resolveCapacitorShellPlatform() === "android";
}

async function ensureAndroidBridgeReady(): Promise<boolean> {
  if (!isAndroidNativeShell()) return false;
  if (isCapacitorBridgeReady()) return true;
  return waitForCapacitorBridgeReady({ timeoutMs: 3_500 });
}

function asNumber(v: unknown): number | undefined {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim()) {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return undefined;
}

function asString(v: unknown): string | undefined {
  return typeof v === "string" ? v : undefined;
}

function asBoolean(v: unknown): boolean | undefined {
  return typeof v === "boolean" ? v : undefined;
}

export function normalizePlayUpdateInfo(raw: Record<string, unknown>): AndroidPlayUpdateInfo {
  return {
    updateAvailability: (asString(raw.updateAvailability) ?? "UNKNOWN") as PlayUpdateAvailability,
    installStatus: (asString(raw.installStatus) ?? "UNKNOWN") as PlayInstallStatus,
    availableVersionCode: asNumber(raw.availableVersionCode),
    installedVersionCode: asNumber(raw.installedVersionCode),
    flexibleAllowed: asBoolean(raw.flexibleAllowed),
    immediateAllowed: asBoolean(raw.immediateAllowed),
    callInProgress: asBoolean(raw.callInProgress),
    updatePriority: asNumber(raw.updatePriority),
  };
}

export async function getAndroidInstalledVersion(): Promise<AndroidInstalledVersion | null> {
  if (!(await ensureAndroidBridgeReady())) return null;
  try {
    const raw = await Plugin.getInstalledVersion();
    const versionCode = asNumber(raw?.versionCode);
    if (versionCode == null) return null;
    return {
      versionName: typeof raw.versionName === "string" ? raw.versionName : "",
      versionCode,
      packageName: typeof raw.packageName === "string" ? raw.packageName : "",
    };
  } catch {
    return null;
  }
}

export async function getAndroidPlayUpdateInfo(): Promise<
  | { ok: true; info: AndroidPlayUpdateInfo }
  | { ok: false; error: string; code?: string }
> {
  if (!(await ensureAndroidBridgeReady())) {
    return { ok: false, error: "android_bridge_unavailable", code: "not_android" };
  }
  try {
    const raw = await Plugin.getUpdateInfo();
    return { ok: true, info: normalizePlayUpdateInfo(raw ?? {}) };
  } catch (e) {
    const err = e as { message?: string; code?: string };
    return {
      ok: false,
      error: typeof err?.message === "string" && err.message.trim() ? err.message : "update_info_failed",
      code: typeof err?.code === "string" ? err.code : undefined,
    };
  }
}

export async function startAndroidFlexibleUpdate(): Promise<
  | { ok: true; result: AndroidPlayUpdateFlowResult }
  | { ok: false; error: string; code?: string }
> {
  if (!(await ensureAndroidBridgeReady())) {
    return { ok: false, error: "android_bridge_unavailable", code: "not_android" };
  }
  try {
    const result = await Plugin.startFlexibleUpdate();
    return { ok: true, result };
  } catch (e) {
    const err = e as { message?: string; code?: string };
    return {
      ok: false,
      error: typeof err?.message === "string" && err.message.trim() ? err.message : "flexible_start_failed",
      code: typeof err?.code === "string" ? err.code : undefined,
    };
  }
}

export async function startAndroidImmediateUpdate(): Promise<
  | { ok: true; result: AndroidPlayUpdateFlowResult }
  | { ok: false; error: string; code?: string }
> {
  if (!(await ensureAndroidBridgeReady())) {
    return { ok: false, error: "android_bridge_unavailable", code: "not_android" };
  }
  try {
    const result = await Plugin.startImmediateUpdate();
    return { ok: true, result };
  } catch (e) {
    const err = e as { message?: string; code?: string };
    return {
      ok: false,
      error: typeof err?.message === "string" && err.message.trim() ? err.message : "immediate_start_failed",
      code: typeof err?.code === "string" ? err.code : undefined,
    };
  }
}

export async function completeAndroidFlexibleUpdate(): Promise<
  | { ok: true }
  | { ok: false; error: string; code?: string }
> {
  if (!(await ensureAndroidBridgeReady())) {
    return { ok: false, error: "android_bridge_unavailable", code: "not_android" };
  }
  try {
    await Plugin.completeFlexibleUpdate();
    return { ok: true };
  } catch (e) {
    const err = e as { message?: string; code?: string };
    return {
      ok: false,
      error: typeof err?.message === "string" && err.message.trim() ? err.message : "complete_failed",
      code: typeof err?.code === "string" ? err.code : undefined,
    };
  }
}

export async function addAndroidPlayInstallStatusListener(
  listener: (event: {
    installStatus: PlayInstallStatus;
    bytesDownloaded?: number;
    totalBytesToDownload?: number;
  }) => void
): Promise<PluginListenerHandle | null> {
  if (!(await ensureAndroidBridgeReady())) return null;
  try {
    return await Plugin.addListener("installStatus", (event) => {
      listener({
        installStatus: (asString(event.installStatus) ?? "UNKNOWN") as PlayInstallStatus,
        bytesDownloaded: asNumber(event.bytesDownloaded),
        totalBytesToDownload: asNumber(event.totalBytesToDownload),
      });
    });
  } catch {
    return null;
  }
}

export async function addAndroidFlexibleDownloadedListener(
  listener: () => void
): Promise<PluginListenerHandle | null> {
  if (!(await ensureAndroidBridgeReady())) return null;
  try {
    return await Plugin.addListener("flexibleUpdateDownloaded", () => {
      listener();
    });
  } catch {
    return null;
  }
}

/** @capacitor/app App.getInfo — installed versionName / build(versionCode). Android-focused helper. */
export async function getCapacitorAppInstalledVersion(): Promise<{
  versionName: string;
  versionCode: number | null;
} | null> {
  if (!isCapacitorNativePlatform()) return null;
  try {
    const { App } = await import("@capacitor/app");
    const info = await App.getInfo();
    const versionName = typeof info.version === "string" ? info.version.trim() : "";
    const buildRaw = typeof info.build === "string" ? info.build.trim() : "";
    const versionCode = buildRaw && Number.isFinite(Number(buildRaw)) ? Math.floor(Number(buildRaw)) : null;
    return { versionName, versionCode };
  } catch {
    return null;
  }
}
