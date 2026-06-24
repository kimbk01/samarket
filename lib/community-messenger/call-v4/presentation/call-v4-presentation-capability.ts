"use client";

import { DIBAY_CALL_PIP_PLUGIN_ID } from "@/lib/call/native/dibay-call-pip";
import { isCallV4DockEnabled, isCallV4PipEnabled } from "@/lib/community-messenger/call-v4/call-v4-phase6-flags";
import type {
  CallV4PresentationCapability,
  CallV4PresentationCapabilitySnapshot,
  CallV4PresentationPlatform,
} from "@/lib/community-messenger/call-v4/presentation/call-v4-presentation-types";
import {
  isCapacitorNativePlatform,
  resolveCapacitorShellPlatform,
} from "@/lib/platform/capacitor-native";

function readPluginHeaders(): Array<{ name: string }> | null {
  if (typeof window === "undefined") return null;
  const headers = (window as Window & { Capacitor?: { PluginHeaders?: Array<{ name: string }> } }).Capacitor
    ?.PluginHeaders;
  return Array.isArray(headers) ? headers : null;
}

export function resolveCallV4PresentationPlatform(): CallV4PresentationPlatform {
  const shell = resolveCapacitorShellPlatform();
  if (shell === "android") return "android";
  if (shell === "ios") return "ios";
  if (isCapacitorNativePlatform()) {
    if (typeof navigator !== "undefined" && /android/i.test(navigator.userAgent)) return "android";
    if (typeof navigator !== "undefined" && /iPad|iPhone|iPod/i.test(navigator.userAgent)) return "ios";
  }
  return "web";
}

/** iOS native PiP — capability probe only; fallback remains mini dock. */
export function detectCallV4IosNativePipAvailable(): boolean {
  if (resolveCallV4PresentationPlatform() !== "ios" || !isCallV4PipEnabled()) return false;
  const headers = readPluginHeaders();
  return Boolean(headers?.some((header) => header.name === DIBAY_CALL_PIP_PLUGIN_ID));
}

export function resolveCallV4PresentationCapabilities(): CallV4PresentationCapability[] {
  const platform = resolveCallV4PresentationPlatform();
  const caps: CallV4PresentationCapability[] = [];

  if (isCallV4DockEnabled()) {
    if (platform === "web") caps.push("web_floating_dock");
    if (platform === "ios") caps.push("ios_dock_fallback");
    if (platform === "android") caps.push("web_floating_dock");
  }

  if (!isCallV4PipEnabled()) return caps;

  if (platform === "android") {
    caps.push("android_os_pip");
    return caps;
  }

  if (platform === "ios") {
    if (detectCallV4IosNativePipAvailable()) caps.push("ios_native_pip");
    if (!caps.includes("ios_dock_fallback") && isCallV4DockEnabled()) caps.push("ios_dock_fallback");
    return caps;
  }

  return caps;
}

export function readCallV4PresentationCapabilitySnapshot(): CallV4PresentationCapabilitySnapshot {
  const platform = resolveCallV4PresentationPlatform();
  const capabilities = resolveCallV4PresentationCapabilities();
  const iosNativePipAvailable = detectCallV4IosNativePipAvailable();
  return {
    platform,
    capabilities,
    iosNativePipAvailable,
    floatingDock: capabilities.includes("web_floating_dock") || capabilities.includes("ios_dock_fallback"),
    osPipBridge: platform === "android" && capabilities.includes("android_os_pip"),
  };
}

export function supportsCallV4FloatingDock(): boolean {
  return readCallV4PresentationCapabilitySnapshot().floatingDock;
}

export function supportsCallV4AndroidOsPipBridge(): boolean {
  return readCallV4PresentationCapabilitySnapshot().osPipBridge;
}
