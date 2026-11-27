import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Guest → Member reconcile for promotion lifecycle.
 * Copies device-scoped rows for THIS deviceKey onto authenticated user.
 * Does NOT pull other devices/users. Does NOT write member state onto device.
 *
 * 이미 회원에게 있는 행은 다시 넣지 않는다 — 두 표 모두 고유 키가 `id` 뿐이라, 이전에는 부를 때마다 같은 행이
 * 새로 복사됐다(운영 11-27 조회: 방문 회원 행 787 중 780, 팝업 숨김 2,467 중 2,366 중복).
 * 손님 원본 행은 지우지 않는다(로그아웃 뒤 손님 상태 유지).
 * 근거: docs/audit/supabase-request-surge-2026-11-18/resume-fixed-cost-design-2026-11-27.md §2
 */

type SuppressionRow = {
  campaign_id?: string | null;
  mode?: string | null;
  session_key?: string | null;
  suppress_until?: string | null;
  campaign_revision?: string | null;
  timezone?: string | null;
};

type VisitRow = {
  event_id?: string | null;
  source_channel?: string | null;
  distribution_id?: string | null;
  session_key?: string | null;
  visited_at?: string | null;
};

function trim(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

/** 팝업 숨김 동일 판정 — 캠페인·방식·세션 */
export function suppressionIdentityKey(row: SuppressionRow): string {
  return `${trim(row.campaign_id)}|${trim(row.mode)}|${trim(row.session_key)}`;
}

/** 방문 동일 판정 — 이벤트·세션 */
export function visitIdentityKey(row: VisitRow): string {
  return `${trim(row.event_id)}|${trim(row.session_key)}`;
}

export async function reconcileGuestPromotionLifecycle(
  sb: SupabaseClient,
  input: { userId: string; anonymousDeviceKey: string }
): Promise<{ ok: true; suppressionsCopied: number; visitsCopied: number } | { ok: false; error: string }> {
  const userId = String(input.userId ?? "").trim();
  const deviceKey = String(input.anonymousDeviceKey ?? "").trim();
  if (!userId) return { ok: false, error: "missing_user_id" };
  if (!deviceKey) return { ok: false, error: "missing_device_key" };

  let suppressionsCopied = 0;
  let visitsCopied = 0;

  const { data: suppressRows, error: suppressReadErr } = await sb
    .from("platform_popup_user_suppressions")
    .select(
      "campaign_id, mode, session_key, suppress_until, campaign_revision, timezone"
    )
    .eq("anonymous_device_key", deviceKey)
    .is("user_id", null)
    .limit(200);

  if (suppressReadErr) {
    return { ok: false, error: suppressReadErr.message };
  }

  const guestSuppressions = ((suppressRows ?? []) as SuppressionRow[]).filter((r) => trim(r.campaign_id));
  if (guestSuppressions.length) {
    const campaignIds = [...new Set(guestSuppressions.map((r) => trim(r.campaign_id)))];
    const { data: memberRows, error: memberReadErr } = await sb
      .from("platform_popup_user_suppressions")
      .select("campaign_id, mode, session_key")
      .eq("user_id", userId)
      .in("campaign_id", campaignIds);
    if (memberReadErr) {
      return { ok: false, error: memberReadErr.message };
    }
    const seen = new Set(((memberRows ?? []) as SuppressionRow[]).map(suppressionIdentityKey));
    for (const row of guestSuppressions) {
      const key = suppressionIdentityKey(row);
      if (seen.has(key)) continue;
      seen.add(key);
      const { error } = await sb.from("platform_popup_user_suppressions").insert({
        user_id: userId,
        anonymous_device_key: null,
        campaign_id: trim(row.campaign_id),
        mode: row.mode,
        session_key: row.session_key ?? null,
        suppress_until: row.suppress_until ?? null,
        campaign_revision: row.campaign_revision ?? null,
        timezone: row.timezone ?? null,
      });
      if (!error) suppressionsCopied += 1;
    }
  }

  const { data: visitRows, error: visitReadErr } = await sb
    .from("platform_promotion_content_visits")
    .select("event_id, source_channel, distribution_id, session_key, visited_at")
    .eq("anonymous_device_key", deviceKey)
    .is("user_id", null)
    .limit(200);

  if (visitReadErr) {
    return { ok: false, error: visitReadErr.message };
  }

  const guestVisits = ((visitRows ?? []) as VisitRow[]).filter((r) => trim(r.event_id) && trim(r.session_key));
  if (guestVisits.length) {
    const eventIds = [...new Set(guestVisits.map((r) => trim(r.event_id)))];
    const { data: memberRows, error: memberReadErr } = await sb
      .from("platform_promotion_content_visits")
      .select("event_id, session_key")
      .eq("user_id", userId)
      .in("event_id", eventIds);
    if (memberReadErr) {
      return { ok: false, error: memberReadErr.message };
    }
    const seen = new Set(((memberRows ?? []) as VisitRow[]).map(visitIdentityKey));
    for (const row of guestVisits) {
      const key = visitIdentityKey(row);
      if (seen.has(key)) continue;
      seen.add(key);
      const { error } = await sb.from("platform_promotion_content_visits").insert({
        event_id: trim(row.event_id),
        user_id: userId,
        anonymous_device_key: null,
        source_channel: row.source_channel,
        distribution_id: row.distribution_id ?? null,
        session_key: trim(row.session_key),
        visited_at: row.visited_at ?? undefined,
      });
      if (!error) visitsCopied += 1;
    }
  }

  return { ok: true, suppressionsCopied, visitsCopied };
}
