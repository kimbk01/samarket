/**
 * 알림 캠페인 푸시 실패 원인 (관리자 상세 「실패 원인」).
 *
 * 근거 = `notification_deliveries` (target_type `admin_campaign`, target_id = 캠페인) 의
 * `provider_response` — FCM·APNs 가 돌려준 실제 응답. 회차 시작~완료 구간만 본다.
 * 분류는 표시용이며 발송·재시도 판단(`lib/push/**`)과 무관하다.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export type PushFailureReason = "expired_token" | "invalid_token" | "temporary" | "other";

export type PushFailureDevice = {
  platform: string | null;
  app_version: string | null;
  last_seen_at: string | null;
  /** 지금 기기 상태 — 만료 토큰은 발송 시 자동으로 꺼진다 (`deactivateFailedPushTarget`). */
  is_active: boolean | null;
  reason: PushFailureReason;
  provider: string | null;
  detail: string;
};

export type PushFailureBreakdown = {
  total: number;
  byReason: { reason: PushFailureReason; count: number }[];
  devices: PushFailureDevice[];
};

const MAX_ROWS = 500;

function text(v: unknown): string {
  return typeof v === "string" ? v : v == null ? "" : JSON.stringify(v);
}

/** FCM·APNs 응답 → 실패 원인. */
export function classifyPushFailure(resp: unknown): { reason: PushFailureReason; provider: string | null; detail: string } {
  const r = resp && typeof resp === "object" && !Array.isArray(resp) ? (resp as Record<string, unknown>) : {};
  const provider = typeof r.provider === "string" ? r.provider : null;
  const error = text(r.error);
  const code = text(r.code);
  const detail = [code, error].filter(Boolean).join(" · ").slice(0, 160);
  const hay = `${code} ${error}`.toLowerCase();
  if (
    hay.includes("notregistered") ||
    hay.includes("unregistered") ||
    hay.includes("registration-token-not-registered") ||
    hay.includes("expiredtoken")
  ) {
    return { reason: "expired_token", provider, detail };
  }
  if (
    hay.includes("not a valid fcm registration token") ||
    hay.includes("invalid_argument") ||
    hay.includes("baddevicetoken") ||
    hay.includes("devicetokennotfortopic") ||
    hay.includes("invalidregistration")
  ) {
    return { reason: "invalid_token", provider, detail };
  }
  if (
    hay.includes("pending stream has been canceled") ||
    hay.includes("socket") ||
    hay.includes("timeout") ||
    hay.includes("internal") ||
    hay.includes("unavailable") ||
    hay.includes("apns_http_0")
  ) {
    return { reason: "temporary", provider, detail };
  }
  return { reason: "other", provider, detail };
}

export async function loadCampaignPushFailureBreakdown(
  svc: SupabaseClient,
  input: { campaignId: string; startedAt: string | null; completedAt: string | null }
): Promise<{ ok: true; breakdown: PushFailureBreakdown } | { ok: false; error: string }> {
  let q = svc
    .from("notification_deliveries")
    .select("device_id, provider_response, created_at")
    .eq("target_type", "admin_campaign")
    .eq("target_id", input.campaignId)
    .eq("status", "failed")
    .order("created_at", { ascending: false })
    .limit(MAX_ROWS);
  if (input.startedAt) q = q.gte("created_at", input.startedAt);
  if (input.completedAt) {
    // 마지막 배치 기록이 completed_at 직후에 찍힐 수 있어 1분 여유.
    q = q.lte("created_at", new Date(Date.parse(input.completedAt) + 60_000).toISOString());
  }
  const { data, error } = await q;
  if (error) return { ok: false, error: "failure_lookup_failed" };

  const rows = (data ?? []) as Array<{ device_id?: string | null; provider_response?: unknown }>;
  const deviceIds = [...new Set(rows.map((r) => String(r.device_id ?? "")).filter(Boolean))];
  const deviceById = new Map<string, Record<string, unknown>>();
  if (deviceIds.length) {
    const { data: devs } = await svc
      .from("user_devices")
      .select("id, platform, app_version, last_seen_at, is_active")
      .in("id", deviceIds);
    for (const d of (devs ?? []) as Array<Record<string, unknown>>) deviceById.set(String(d.id), d);
  }

  const counts = new Map<PushFailureReason, number>();
  const devices: PushFailureDevice[] = rows.map((r) => {
    const c = classifyPushFailure(r.provider_response);
    counts.set(c.reason, (counts.get(c.reason) ?? 0) + 1);
    const d = deviceById.get(String(r.device_id ?? ""));
    return {
      platform: typeof d?.platform === "string" ? d.platform : null,
      app_version: typeof d?.app_version === "string" ? d.app_version : null,
      last_seen_at: typeof d?.last_seen_at === "string" ? d.last_seen_at : null,
      is_active: typeof d?.is_active === "boolean" ? d.is_active : null,
      reason: c.reason,
      provider: c.provider,
      detail: c.detail,
    };
  });
  const order: PushFailureReason[] = ["expired_token", "invalid_token", "temporary", "other"];
  return {
    ok: true,
    breakdown: {
      total: rows.length,
      byReason: order.filter((k) => counts.get(k)).map((reason) => ({ reason, count: counts.get(reason) ?? 0 })),
      devices,
    },
  };
}
