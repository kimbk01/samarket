import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * PUSH-02 — APNs environment of ONE device token (sandbox = Xcode Run / development profile,
 * production = TestFlight·App Store). Not the same thing as `user_devices.environment`
 * (Vercel deploy stage). A mixed fleet needs the host chosen per token.
 */
export type ApnsEnvironment = "sandbox" | "production";

export function normalizeApnsEnvironment(raw: unknown): ApnsEnvironment | null {
  if (typeof raw !== "string") return null;
  const v = raw.trim().toLowerCase();
  if (v === "production") return "production";
  if (v === "sandbox" || v === "development") return "sandbox";
  return null;
}

/** Server default when the device has not reported / not yet been learned (legacy rows). */
export function defaultApnsEnvironment(): ApnsEnvironment {
  return process.env.APNS_PRODUCTION === "1" ? "production" : "sandbox";
}

export function oppositeApnsEnvironment(env: ApnsEnvironment): ApnsEnvironment {
  return env === "production" ? "sandbox" : "production";
}

export function apnsHostForEnvironment(env: ApnsEnvironment): string {
  return env === "production" ? "api.push.apple.com" : "api.sandbox.push.apple.com";
}

/**
 * Only `400 BadDeviceToken` means "token from the other environment" (Apple). 410 Unregistered and
 * DeviceTokenNotForTopic are not environment errors and are never retried on the other host.
 */
export function isApnsEnvironmentMismatch(providerResponse: Record<string, unknown> | null | undefined): boolean {
  if (!providerResponse) return false;
  return Number(providerResponse.http_status) === 400 && providerResponse.apns_reason === "BadDeviceToken";
}

/**
 * Persist the environment a token was proven to work on (best effort — a missing column or a
 * transient error must never fail the push that already succeeded).
 */
export async function rememberDeviceApnsEnvironment(
  svc: SupabaseClient,
  deviceRowId: string,
  env: ApnsEnvironment
): Promise<void> {
  try {
    const { error } = await svc.from("user_devices").update({ apns_environment: env }).eq("id", deviceRowId);
    if (error) {
      console.warn("[apns-environment] remember_failed", { deviceRowId, env, message: error.message });
    }
  } catch (e) {
    console.warn("[apns-environment] remember_failed", { deviceRowId, env, message: (e as Error).message });
  }
}
