import { registerPlugin } from "@capacitor/core";
import { resolveCapacitorShellPlatform } from "@/lib/platform/capacitor-native";
import {
  nativeRouteModeValue,
  type DibayAppRouteOrientationMode,
} from "@/lib/device/dibay-orientation-policy";

/**
 * Admin v4 §2-2 B·C — native `DibayAppOrientation` plugin wrapper.
 * Web / old app binaries without the plugin: silent no-op (never throws).
 */
export const DIBAY_APP_ORIENTATION_PLUGIN_ID = "DibayAppOrientation";

type DibayAppOrientationPlugin = {
  setRouteMode(options: { mode: "admin" | "default" }): Promise<unknown>;
};

const DibayAppOrientation = registerPlugin<DibayAppOrientationPlugin>(DIBAY_APP_ORIENTATION_PLUGIN_ID);

type WindowWithCapacitorHeaders = Window & {
  Capacitor?: { PluginHeaders?: Array<{ name?: string }> };
};

/** false when the native shell reports plugin headers that do not include this plugin (old binary). */
function nativePluginMayExist(): boolean {
  if (typeof window === "undefined") return false;
  const headers = (window as WindowWithCapacitorHeaders).Capacitor?.PluginHeaders;
  if (!Array.isArray(headers)) return true;
  return headers.some((header) => header?.name === DIBAY_APP_ORIENTATION_PLUGIN_ID);
}

/** Returns true when the native plugin accepted the mode. */
export async function setDibayAppRouteOrientationMode(mode: DibayAppRouteOrientationMode): Promise<boolean> {
  const shell = resolveCapacitorShellPlatform();
  if (shell !== "android" && shell !== "ios") return false;
  if (!nativePluginMayExist()) return false;
  try {
    await DibayAppOrientation.setRouteMode({ mode: nativeRouteModeValue(mode) });
    return true;
  } catch {
    return false;
  }
}
