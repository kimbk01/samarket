"use client";

import { registerPlugin } from "@capacitor/core";
import {
  isCapacitorBridgeReady,
  isCapacitorNativePlatform,
  waitForCapacitorBridgeReady,
} from "@/lib/platform/capacitor-native";

export const NATIVE_PUSH_REGISTER_PLUGIN_ID = "NativePushRegister";

export type NativePushRegisterInput = {
  platform: string;
  device_id: string;
  push_token: string;
  push_provider: string;
  app_version?: string;
  user_id?: string;
};

export type NativePushRegisterResult = {
  ok: boolean;
  http_status?: number;
  error?: string;
  device_row_id?: string | null;
};

type NativePushRegisterPlugin = {
  registerPushDevice(input: NativePushRegisterInput): Promise<NativePushRegisterResult>;
};

const NativePushRegister = registerPlugin<NativePushRegisterPlugin>(NATIVE_PUSH_REGISTER_PLUGIN_ID);

export async function registerPushDeviceViaNative(
  input: NativePushRegisterInput,
): Promise<NativePushRegisterResult> {
  if (!isCapacitorNativePlatform()) {
    return { ok: false, error: "not_native" };
  }
  if (!isCapacitorBridgeReady()) {
    await waitForCapacitorBridgeReady();
  }
  try {
    const result = await NativePushRegister.registerPushDevice(input);
    return {
      ok: result.ok === true,
      http_status: typeof result.http_status === "number" ? result.http_status : undefined,
      error: typeof result.error === "string" ? result.error : undefined,
      device_row_id:
        typeof result.device_row_id === "string" ? result.device_row_id : result.device_row_id ?? null,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("UNIMPLEMENTED") || message.includes("not implemented")) {
      return { ok: false, error: "plugin_unavailable" };
    }
    return { ok: false, error: message || "native_register_failed" };
  }
}
