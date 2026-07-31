import type { SupabaseClient } from "@supabase/supabase-js";
import { filterUserDevicePushTargets } from "@/lib/push/dispatch/filter-user-device-push-targets";
import {
  resolvePushEnvironment,
  type PushEnvironment,
} from "@/lib/push/push-environment";
import type { DeliveryStatus, PushTarget } from "@/lib/push/dispatch/push-payload-types";

type WebPushRow = {
  id: string;
  endpoint: string;
  key_p256dh: string;
  key_auth: string;
  platform?: string | null;
  is_active?: boolean | null;
};

function normalizePlatform(raw: string | null | undefined): PushTarget["platform"] {
  const p = String(raw ?? "").trim().toLowerCase();
  if (p === "android") return "android";
  if (p === "ios") return "ios";
  if (p === "pwa") return "pwa";
  return "web";
}

export type LoadActivePushTargetsOptions = {
  /** Recipient fan-out mode. Canonical notification dispatch uses multi-device. */
  fcmMode?: "single_fcm" | "multi_device_fcm";
  environment?: PushEnvironment;
};

/**
 * Active push targets for a user — `user_devices` + legacy `web_push_subscriptions`.
 */
export async function loadActivePushTargets(
  svc: SupabaseClient,
  userId: string,
  options?: LoadActivePushTargetsOptions,
): Promise<PushTarget[]> {
  const uid = userId.trim();
  if (!uid) return [];
  const environment = options?.environment ?? resolvePushEnvironment();

  const targets: PushTarget[] = [];

  const { data: deviceRows, error: deviceErr } = await svc
    .from("user_devices")
    .select("id, platform, device_id, push_token, push_provider, environment, last_seen_at, updated_at")
    .eq("user_id", uid)
    .eq("is_active", true)
    .eq("environment", environment)
    .order("last_seen_at", { ascending: false })
    .order("updated_at", { ascending: false });

  if (!deviceErr && deviceRows?.length) {
    targets.push(...filterUserDevicePushTargets(deviceRows, { fcmMode: options?.fcmMode }));
  }

  const { data: webRows, error: webErr } =
    environment === "production"
      ? await svc
          .from("web_push_subscriptions")
          .select("id, endpoint, key_p256dh, key_auth, platform, is_active")
          .eq("user_id", uid)
      : { data: [] as WebPushRow[], error: null };

  if (!webErr && webRows?.length) {
    for (const row of webRows as WebPushRow[]) {
      if (row.is_active === false) continue;
      const endpoint = String(row.endpoint ?? "").trim();
      if (!endpoint) continue;
      targets.push({
        id: row.id,
        source: "web_push_subscriptions",
        push_provider: "web_push",
        push_token: endpoint,
        platform: normalizePlatform(row.platform),
        endpoint,
        key_p256dh: row.key_p256dh,
        key_auth: row.key_auth,
        environment,
      });
    }
  }

  return targets;
}

export async function insertNotificationDelivery(
  svc: SupabaseClient,
  row: {
    user_id: string;
    device_id?: string | null;
    event_type: string;
    target_type?: string | null;
    target_id?: string | null;
    status: DeliveryStatus;
    provider_response?: Record<string, unknown> | null;
    notification_event_id?: string | null;
    environment?: PushEnvironment;
  }
): Promise<string | null> {
  const { data, error } = await svc
    .from("notification_deliveries")
    .insert({
      user_id: row.user_id,
      device_id: row.device_id ?? null,
      event_type: row.event_type,
      target_type: row.target_type ?? null,
      target_id: row.target_id ?? null,
      status: row.status,
      provider_response: row.provider_response ?? null,
      notification_event_id: row.notification_event_id ?? null,
      environment: row.environment ?? resolvePushEnvironment(),
    })
    .select("id")
    .maybeSingle();

  if (error) {
    if (error.code === "23505") {
      return null;
    }
    if (error.message?.includes("does not exist") || error.code === "42P01") {
      return null;
    }
    console.error("[insertNotificationDelivery]", error.message);
    return null;
  }
  return (data as { id?: string } | null)?.id ?? null;
}
