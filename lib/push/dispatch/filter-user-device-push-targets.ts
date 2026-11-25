import type { PushTarget } from "@/lib/push/dispatch/push-payload-types";
import type { PushEnvironment } from "@/lib/push/push-environment";
import { normalizeApnsEnvironment, type ApnsEnvironment } from "@/lib/push/dispatch/apns-environment";

export type UserDevicePushRow = {
  id: string;
  platform: string;
  device_id: string;
  push_token: string;
  push_provider: string;
  environment?: PushEnvironment | null;
  /** PUSH-02 — absent until the column is migrated. */
  apns_environment?: string | null;
  last_seen_at?: string | null;
  updated_at?: string | null;
};

export type FilterUserDevicePushTargetsOptions = {
  /**
   * `multi_device_fcm` (default): one FCM per physical device.
   * `single_fcm`: compatibility-only at most one FCM per user.
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
 * VoIP APNs 환경 (docs/audit/call-voip-apns-environment-design-2026-11-25.md V1).
 * 같은 설치본의 일반 알림 토큰과 VoIP 토큰은 같은 서명 프로필(aps-environment) → 같은 환경이다.
 * 앱은 일반 알림 토큰 등록 때만 환경을 보고하므로(PUSH-02), VoIP 는 같은 device_id 의 apns 행 값을 쓴다.
 * 이미 받은 rows 안에서만 찾는다 — 조회·쓰기·요청 추가 없음. 고르는 행은 아래 dedupe 와 같은 첫 행.
 */
function alertApnsEnvironmentByDevice(rows: UserDevicePushRow[]): Map<string, ApnsEnvironment | null> {
  const byDevice = new Map<string, ApnsEnvironment | null>();
  for (const row of rows) {
    if (normalizeProvider(row.push_provider) !== "apns") continue;
    if (!String(row.push_token ?? "").trim()) continue;
    const deviceKey = String(row.device_id ?? "").trim();
    if (!deviceKey || byDevice.has(deviceKey)) continue;
    byDevice.set(deviceKey, normalizeApnsEnvironment(row.apns_environment));
  }
  return byDevice;
}

/**
 * Rows must be pre-sorted by last_seen_at desc, then updated_at desc.
 * FCM: mode-dependent (single user vs one per device).
 * Other providers: dedupe by (push_provider, device_id) — apns and voip_apns
 * on the same physical device must both remain dispatch targets.
 */
export function filterUserDevicePushTargets(
  rows: UserDevicePushRow[],
  options?: FilterUserDevicePushTargetsOptions,
): PushTarget[] {
  const targets: PushTarget[] = [];
  const seenProviderDeviceKeys = new Set<string>();
  const seenFcmDeviceIds = new Set<string>();
  let fcmIncluded = false;
  const multiFcm = options?.fcmMode !== "single_fcm";
  const alertApnsEnvByDevice = alertApnsEnvironmentByDevice(rows);

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
      const deviceKey = String(row.device_id ?? "").trim() || `id:${row.id}`;
      const providerDeviceKey = `${provider}|${deviceKey}`;
      if (seenProviderDeviceKeys.has(providerDeviceKey)) continue;
      seenProviderDeviceKeys.add(providerDeviceKey);
    }

    targets.push({
      id: row.id,
      source: "user_devices",
      push_provider: provider,
      push_token: token,
      platform: normalizePlatform(row.platform),
      device_id: row.device_id,
      environment: row.environment ?? undefined,
      ...(provider === "apns" ? { apns_environment: normalizeApnsEnvironment(row.apns_environment) } : {}),
      ...(provider === "voip_apns"
        ? {
            apns_environment:
              normalizeApnsEnvironment(row.apns_environment) ??
              alertApnsEnvByDevice.get(String(row.device_id ?? "").trim()) ??
              null,
          }
        : {}),
    });
  }

  return targets;
}
