import type { SupabaseClient } from "@supabase/supabase-js";
import {
  filterUserDevicePushTargets,
  type UserDevicePushRow,
} from "@/lib/push/dispatch/filter-user-device-push-targets";
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

const USER_DEVICE_TARGET_COLUMNS =
  "id, platform, device_id, push_token, push_provider, environment, last_seen_at, updated_at";

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

  const selectDevices = (columns: string) =>
    svc
      .from("user_devices")
      .select(columns)
      .eq("user_id", uid)
      .eq("is_active", true)
      .eq("environment", environment)
      .order("last_seen_at", { ascending: false })
      .order("updated_at", { ascending: false });
  let { data: deviceRows, error: deviceErr } = await selectDevices(`${USER_DEVICE_TARGET_COLUMNS}, apns_environment`);
  if (deviceErr && /apns_environment/i.test(deviceErr.message ?? "")) {
    // PUSH-02 column not migrated yet → legacy select (server-default APNs host, as before).
    ({ data: deviceRows, error: deviceErr } = await selectDevices(USER_DEVICE_TARGET_COLUMNS));
  }

  if (!deviceErr && deviceRows?.length) {
    targets.push(
      ...filterUserDevicePushTargets(deviceRows as unknown as UserDevicePushRow[], { fcmMode: options?.fcmMode })
    );
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

type NotificationDeliveryInsertRow = {
  user_id: string;
  device_id?: string | null;
  event_type: string;
  target_type?: string | null;
  target_id?: string | null;
  status: DeliveryStatus;
  provider_response?: Record<string, unknown> | null;
  notification_event_id?: string | null;
  environment?: PushEnvironment;
};

export type NotificationDeliveryInsertResult =
  | { kind: "inserted"; id: string }
  /** 23505 on `notification_deliveries_event_device_uidx` — a row already exists for (event, device). */
  | { kind: "conflict" }
  | { kind: "error"; message: string };

export async function insertNotificationDeliveryDetailed(
  svc: SupabaseClient,
  row: NotificationDeliveryInsertRow
): Promise<NotificationDeliveryInsertResult> {
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
    if (error.code === "23505") return { kind: "conflict" };
    if (!(error.message?.includes("does not exist") || error.code === "42P01")) {
      console.error("[insertNotificationDelivery]", error.message);
    }
    return { kind: "error", message: error.message ?? String(error.code ?? "insert_failed") };
  }
  const id = (data as { id?: string } | null)?.id ?? null;
  return id ? { kind: "inserted", id } : { kind: "error", message: "insert_returned_no_id" };
}

export async function insertNotificationDelivery(
  svc: SupabaseClient,
  row: NotificationDeliveryInsertRow
): Promise<string | null> {
  const result = await insertNotificationDeliveryDetailed(svc, row);
  return result.kind === "inserted" ? result.id : null;
}

/** Provider verdicts that mean "this token will never accept a resend". */
export function isPermanentPushFailureResponse(resp: Record<string, unknown> | null | undefined): boolean {
  if (!resp) return false;
  if (resp.bad_device_token === true || resp.gone === true || resp.invalid_token === true) return true;
  const msg = String(resp.error ?? "").toLowerCase();
  return msg.includes("not_registered") || msg.includes("notregistered") || msg.includes("subscription_gone");
}

export type NotificationDeliveryReclaimResult =
  | { kind: "reclaimed"; id: string; attempt: number }
  /** Existing row already reached the provider (sent / opened / dismissed) — never resend. */
  | { kind: "already_sent" }
  /** Existing row is `pending`: another invocation is sending, or crashed mid-send. Never resend. */
  | { kind: "in_flight" }
  | { kind: "permanent" }
  /** Existing row was a policy skip — keep the original decision. */
  | { kind: "skipped_existing"; reason: string | null }
  | { kind: "error"; message: string };

/**
 * SRV-01 — retry for (notification_event_id, device_id) after an insert conflict.
 * Only a `failed` row with a non-permanent verdict is re-armed, via a conditional
 * `failed → pending` update so two concurrent retries cannot both send.
 */
export async function reclaimNotificationDeliveryForRetry(
  svc: SupabaseClient,
  input: {
    notification_event_id: string;
    device_id: string;
    provider_response: Record<string, unknown>;
  }
): Promise<NotificationDeliveryReclaimResult> {
  const { data: existing, error } = await svc
    .from("notification_deliveries")
    .select("id, status, provider_response")
    .eq("notification_event_id", input.notification_event_id)
    .eq("device_id", input.device_id)
    .maybeSingle();
  if (error) return { kind: "error", message: error.message };
  if (!existing) return { kind: "error", message: "conflict_row_not_found" };

  const row = existing as { id: string; status: string; provider_response: Record<string, unknown> | null };
  const prev = row.provider_response && typeof row.provider_response === "object" ? row.provider_response : {};
  if (row.status === "sent" || row.status === "opened" || row.status === "dismissed") return { kind: "already_sent" };
  if (row.status === "pending") return { kind: "in_flight" };
  if (row.status === "skipped") {
    return { kind: "skipped_existing", reason: typeof prev.reason === "string" ? prev.reason : null };
  }
  if (row.status !== "failed") return { kind: "skipped_existing", reason: `status_${row.status}` };
  if (isPermanentPushFailureResponse(prev)) return { kind: "permanent" };

  const prevAttempt = Number(prev.delivery_attempt);
  const attempt = (Number.isFinite(prevAttempt) && prevAttempt > 0 ? Math.trunc(prevAttempt) : 1) + 1;
  const { data: claimed, error: claimErr } = await svc
    .from("notification_deliveries")
    .update({
      status: "pending",
      provider_response: {
        ...input.provider_response,
        delivery_attempt: attempt,
        previous_failure: {
          error: prev.error ?? null,
          http_status: prev.http_status ?? null,
          code: prev.code ?? null,
        },
      },
    })
    .eq("id", row.id)
    .eq("status", "failed")
    .select("id");
  if (claimErr) return { kind: "error", message: claimErr.message };
  if (!claimed || (claimed as unknown[]).length === 0) return { kind: "in_flight" };
  return { kind: "reclaimed", id: row.id, attempt };
}
