"use client";

import { registerPlugin, type PluginListenerHandle } from "@capacitor/core";
import { isCapacitorNativePlatform } from "@/lib/platform/capacitor-native";

export const DIBAY_CALL_PIP_PLUGIN_ID = "DibayCallPip";

export type DibayCallPipAction = "restore" | "mute" | "end";

export type DibayCallPipPlugin = {
  isPipSupported(): Promise<{ supported: boolean }>;
  enterCallPip(options: {
    callId: string;
    isVideo?: boolean;
    muted?: boolean;
    cameraOff?: boolean;
    displayName?: string;
  }): Promise<{ ok: boolean }>;
  exitCallPip(options: { callId?: string }): Promise<{ ok: boolean }>;
  addListener(
    eventName: "pipModeChanged",
    listener: (event: { inPipMode: boolean; callId?: string | null }) => void
  ): Promise<PluginListenerHandle>;
  addListener(
    eventName: "pipAction",
    listener: (event: { action: DibayCallPipAction; callId?: string | null }) => void
  ): Promise<PluginListenerHandle>;
};

const DibayCallPip = registerPlugin<DibayCallPipPlugin>(DIBAY_CALL_PIP_PLUGIN_ID);

function invokeNative<T>(method: keyof DibayCallPipPlugin, options?: Record<string, unknown>): Promise<T | null> {
  if (!isCapacitorNativePlatform()) return Promise.resolve(null);
  const cap = (typeof window !== "undefined" ? window : undefined) as Window & {
    Capacitor?: { nativePromise?: (plugin: string, methodName: string, options?: unknown) => Promise<unknown> };
  };
  const nativePromise = cap?.Capacitor?.nativePromise;
  if (typeof nativePromise === "function") {
    return nativePromise(DIBAY_CALL_PIP_PLUGIN_ID, method, options ?? {}) as Promise<T>;
  }
  const plugin = DibayCallPip as unknown as Record<string, (opts: unknown) => Promise<T>>;
  const fn = plugin[method as string];
  if (typeof fn === "function") {
    return fn(options ?? {});
  }
  return Promise.resolve(null);
}

export async function isDibayNativeCallPipSupported(): Promise<boolean> {
  const result = await invokeNative<{ supported: boolean }>("isPipSupported");
  return result?.supported ?? false;
}

export async function enterDibayNativeCallPip(options: {
  callId: string;
  isVideo?: boolean;
  muted?: boolean;
  cameraOff?: boolean;
  displayName?: string;
}): Promise<boolean> {
  const sid = options.callId.trim();
  if (!sid) return false;
  const result = await invokeNative<{ ok: boolean }>("enterCallPip", {
    callId: sid,
    isVideo: options.isVideo ?? false,
    muted: options.muted ?? false,
    cameraOff: options.cameraOff ?? false,
    displayName: options.displayName ?? "",
  });
  return result?.ok ?? false;
}

export async function exitDibayNativeCallPip(callId?: string): Promise<boolean> {
  const sid = callId?.trim() ?? "";
  const result = await invokeNative<{ ok: boolean }>("exitCallPip", sid ? { callId: sid } : {});
  return result?.ok ?? false;
}

export async function subscribeDibayCallPipModeChanged(
  listener: (event: { inPipMode: boolean; callId?: string | null }) => void
): Promise<() => void> {
  if (!isCapacitorNativePlatform()) return () => {};
  try {
    const handle = await DibayCallPip.addListener("pipModeChanged", listener);
    return () => {
      void handle.remove();
    };
  } catch {
    return () => {};
  }
}

export async function subscribeDibayCallPipAction(
  listener: (event: { action: DibayCallPipAction; callId?: string | null }) => void
): Promise<() => void> {
  if (!isCapacitorNativePlatform()) return () => {};
  try {
    const handle = await DibayCallPip.addListener("pipAction", listener);
    return () => {
      void handle.remove();
    };
  } catch {
    return () => {};
  }
}
