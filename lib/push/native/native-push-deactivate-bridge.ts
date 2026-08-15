"use client";

import { registerPlugin } from "@capacitor/core";
import {
  isCapacitorBridgeReady,
  isCapacitorNativePlatform,
  waitForCapacitorBridgeReady,
} from "@/lib/platform/capacitor-native";

export const NATIVE_PUSH_REGISTER_PLUGIN_ID = "NativePushRegister";

type NativePushDeactivatePlugin = {
  deactivateBoundPushDevice(input: { reason?: string }): Promise<{
    ok: boolean;
    http_status?: number;
    error?: string;
    deactivated?: number;
  }>;
};

const NativePushRegister = registerPlugin<NativePushDeactivatePlugin>(NATIVE_PUSH_REGISTER_PLUGIN_ID);

export async function deactivateBoundPushDeviceViaNative(
  reason: string,
): Promise<{ ok: boolean; httpStatus?: number; error?: string; deactivated?: number }> {
  if (!isCapacitorNativePlatform()) {
    return { ok: false, error: "not_native" };
  }
  if (!isCapacitorBridgeReady()) {
    await waitForCapacitorBridgeReady();
  }
  try {
    const result = await NativePushRegister.deactivateBoundPushDevice({
      reason: String(reason ?? "").trim() || "logout",
    });
    return {
      ok: result.ok === true,
      httpStatus: typeof result.http_status === "number" ? result.http_status : undefined,
      error: typeof result.error === "string" ? result.error : undefined,
      deactivated: typeof result.deactivated === "number" ? result.deactivated : undefined,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("UNIMPLEMENTED") || message.includes("not implemented")) {
      return { ok: false, error: "plugin_unavailable" };
    }
    return { ok: false, error: message || "native_deactivate_failed" };
  }
}
