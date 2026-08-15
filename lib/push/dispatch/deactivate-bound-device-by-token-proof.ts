import type { SupabaseClient } from "@supabase/supabase-js";
import type { PushEnvironment } from "@/lib/push/push-environment";

export type DeactivateBoundDeviceByTokenProofInput = {
  deviceId: string;
  pushToken: string;
  pushProvider?: string | null;
  environment: PushEnvironment;
};

export type DeactivateBoundDeviceByTokenProofResult =
  | { ok: true; deactivated: number }
  | { ok: false; error: "invalid_proof" | "no_matching_device" };

/**
 * Session-missing logout cleanup — ownership proof is device_id + push_token match.
 * Never trusts device_id alone (service-role arbitrary row wipe forbidden).
 */
export async function deactivateBoundDeviceByTokenProof(
  svc: SupabaseClient,
  input: DeactivateBoundDeviceByTokenProofInput,
): Promise<DeactivateBoundDeviceByTokenProofResult> {
  const deviceId = String(input.deviceId ?? "").trim();
  const pushToken = String(input.pushToken ?? "").trim();
  const pushProvider = String(input.pushProvider ?? "").trim().toLowerCase() || "fcm";
  if (!deviceId || !pushToken) {
    return { ok: false, error: "invalid_proof" };
  }

  const now = new Date().toISOString();
  const { data, error } = await svc
    .from("user_devices")
    .update({ is_active: false, updated_at: now })
    .eq("device_id", deviceId)
    .eq("push_token", pushToken)
    .eq("push_provider", pushProvider)
    .eq("environment", input.environment)
    .eq("is_active", true)
    .select("id");

  if (error) {
    throw error;
  }

  const deactivated = Array.isArray(data) ? data.length : 0;
  if (deactivated < 1) {
    return { ok: false, error: "no_matching_device" };
  }
  return { ok: true, deactivated };
}
