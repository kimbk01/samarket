import type { PushTarget } from "@/lib/push/dispatch/push-payload-types";

export type UserDevicePushRow = {
  id: string;
  platform: string;
  device_id: string;
  push_token: string;
  push_provider: string;
  last_seen_at?: string | null;
  updated_at?: string | null;
};

export type FilterUserDevicePushTargetsOptions = {
  /**
   * `single_fcm` (default): at most one FCM per user (chat / legacy).
   * `multi_device_fcm`: one FCM per device_id — call ringing / terminal dismiss fan-out.
   * @see docs/dibay-call-multi-device-policy.md
   */
  fcmMode?: "single_fcm" | "multi_device_fcm";
};

function normalizePlatform(raw: string | null | undefined): PushTarget["platform"] {
  const p = String(raw ?? "").trim().toLowerCase();
  if (p === "android") return "android";
  if (p === "ios") return "ios";
  if (p === "pwa") return "pwa";
  return "web";
}

function normalizeProvider(raw: string): PushTarget["push_provider"] | null {
  const p = raw.trim().toLowerCase();
  if (p === "fcm" || p === "apns" || p === "voip_apns" || p === "web_push") return p;
  return null;
}

/**
 * Rows must be pre-sorted by last_seen_at desc, then updated_at desc.
 * FCM: mode-dependent (single user vs one per device).
 * Other providers: dedupe by device_id (first row per device_id wins).
 */
export function filterUserDevicePushTargets(
  rows: UserDevicePushRow[],
  options?: FilterUserDevicePushTargetsOptions,
): PushTarget[] {
  const targets: PushTarget[] = [];
  const seenDeviceIds = new Set<string>();
  const seenFcmDeviceIds = new Set<string>();
  let fcmIncluded = false;
  const multiFcm = options?.fcmMode === "multi_device_fcm";

  for (const row of rows) {
    const provider = normalizeProvider(row.push_provider);
    const token = String(row.push_token ?? "").trim();
    if (!provider || !token) continue;

    if (provider === "fcm") {
      if (multiFcm) {
        const deviceKey = String(row.device_id ?? "").trim() || `fcm:${row.id}`;
        if (seenFcmDeviceIds.has(deviceKey)) continue;
        seenFcmDeviceIds.add(deviceKey);
      } else {
        if (fcmIncluded) continue;
        fcmIncluded = true;
      }
    } else {
      const deviceKey = String(row.device_id ?? "").trim();
      if (deviceKey) {
        if (seenDeviceIds.has(deviceKey)) continue;
        seenDeviceIds.add(deviceKey);
      }
    }

    targets.push({
      id: row.id,
      source: "user_devices",
      push_provider: provider,
      push_token: token,
      platform: normalizePlatform(row.platform),
      device_id: row.device_id,
    });
  }

  return targets;
}
