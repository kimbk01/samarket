import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveAddressCanonicalLguId } from "@/lib/addresses/address-location-ssot.server";
import type { AdminNotificationCampaignRow } from "@/lib/admin/notification-campaigns/campaign-types";

export const CAMPAIGN_ACTIVE_USER_DAYS = 30;

/** PostgREST `.or()` 값 — `KR:11680` 처럼 `:` 가 있으면 따옴표 */
function campaignLguFilterValue(lgu: string): string {
  return /^[0-9A-Za-z_-]+$/.test(lgu) ? lgu : `"${lgu}"`;
}

/** 대표 주소 행이 캠페인 시/군과 맞는가 — 저장값 우선, 없으면 주소 SSOT 계산값 */
function campaignRowMatchesLgu(row: Record<string, unknown>, lgu: string): boolean {
  const stored = typeof row.canonical_lgu_id === "string" ? row.canonical_lgu_id.trim() : "";
  if (stored) return stored === lgu;
  const derived = resolveAddressCanonicalLguId({
    canonicalLguId: null,
    cityMunicipality: typeof row.city_municipality === "string" ? row.city_municipality : null,
    province: typeof row.province === "string" ? row.province : null,
  });
  return derived === lgu;
}

/** `active_users` 기준 시각 — 회차 시작 때 1회 정해 회차(`active_since`)에 저장한다 (확정 설계 B-11). */
export function campaignActiveUsersSince(now: Date = new Date()): string {
  return new Date(now.getTime() - CAMPAIGN_ACTIVE_USER_DAYS * 86_400_000).toISOString();
}

/**
 * Shared target scan used by batch send and audience preview — no segment fallback.
 * 확정 설계 B-11: 위치(offset)가 아니라 **마지막으로 처리한 id 다음**부터 읽는다 — 발송 중 회원이 가입·탈퇴해도
 * 건너뛰거나 두 번 읽지 않는다. `afterId = null` 이면 처음부터.
 */
export async function fetchCampaignProfileScanSlice(
  svc: SupabaseClient,
  campaign: Pick<AdminNotificationCampaignRow, "target_type" | "segment_region_code">,
  afterId: string | null,
  limit: number,
  opts?: { throwOnError?: boolean; activeSince?: string | null }
): Promise<string[]> {
  const tt = campaign.target_type;

  if (tt === "segment" || tt === "selected_users") {
    return [];
  }

  if (tt === "marketing_opt_in") {
    let q = svc
      .from("user_notification_settings")
      .select("user_id")
      .eq("marketing_enabled", true)
      .order("user_id", { ascending: true })
      .limit(limit);
    if (afterId) q = q.gt("user_id", afterId);
    const { data, error } = await q;
    if (error) {
      console.error("[campaign scan marketing_opt_in]", error.message);
      if (opts?.throwOnError) throw new Error(`target_scan_failed:${error.message}`);
      return [];
    }
    return (data ?? []).map((r) => String((r as { user_id: string }).user_id)).filter(Boolean);
  }

  if (tt !== "all" && tt !== "region" && tt !== "active_users") {
    console.error("[campaign scan] unsupported target_type", tt);
    return [];
  }

  if (tt === "region") {
    /**
     * 지역 대상 = 대표 주소의 시/군 LGU(PSGC) — 주소 SSOT (Owner 2026-11-09).
     * 이전: profiles.region_code(대표 주소와 동기되지 않는 예전 값) 글자 일치. 지역 캠페인 운영 0건이라 기존 캠페인 영향 없음.
     */
    const lgu = campaign.segment_region_code?.trim() ?? "";
    if (!lgu) return [];
    /**
     * 저장된 LGU 가 비어 있는 예전 대표 주소도 화면과 같은 판정(`resolveAddressCanonicalLguId`)으로 포함한다
     * (감사 2026-11-10: 앱에는 그 시/군으로 보이는데 지역 캠페인 대상에서 빠짐 — 대표 74 중 58 이 저장값 없음).
     * 걸러진 행 때문에 쪽 크기가 줄어 발송 반복이 일찍 끝나지 않도록, 맞는 회원이 limit 개 모이거나 끝까지 읽을 때까지 이어 읽는다.
     */
    const out: string[] = [];
    let cursor = afterId;
    for (;;) {
      let rq = svc
        .from("user_addresses")
        .select("user_id, canonical_lgu_id, city_municipality, province")
        .eq("is_active", true)
        .eq("is_default_master", true)
        .or(`canonical_lgu_id.eq.${campaignLguFilterValue(lgu)},canonical_lgu_id.is.null`)
        .order("user_id", { ascending: true })
        .limit(limit);
      if (cursor) rq = rq.gt("user_id", cursor);
      const { data: rows, error: rErr } = await rq;
      if (rErr) {
        console.error("[campaign scan region]", rErr.message);
        if (opts?.throwOnError) throw new Error(`target_scan_failed:${rErr.message}`);
        return out;
      }
      const list = (rows ?? []) as Array<Record<string, unknown>>;
      for (const r of list) {
        if (campaignRowMatchesLgu(r, lgu)) out.push(String(r.user_id));
        if (out.length >= limit) return out;
      }
      if (list.length < limit) return out;
      cursor = String(list[list.length - 1]!.user_id);
    }
  }

  let q = svc.from("profiles").select("id").order("id", { ascending: true }).limit(limit);
  if (afterId) q = q.gt("id", afterId);
  if (tt === "active_users") {
    q = q.gte("updated_at", opts?.activeSince || campaignActiveUsersSince());
  }

  const { data, error } = await q;
  if (error) {
    console.error("[campaign scan profiles]", error.message);
    if (opts?.throwOnError) throw new Error(`target_scan_failed:${error.message}`);
    return [];
  }
  return (data ?? []).map((r) => String((r as { id: string }).id)).filter(Boolean);
}

export async function countCampaignProfileAudience(
  svc: SupabaseClient,
  campaign: Pick<AdminNotificationCampaignRow, "target_type" | "segment_region_code">,
  opts?: { maxScan?: number }
): Promise<{ userIds: string[]; truncated: boolean }> {
  const maxScan = Math.max(1, Math.min(opts?.maxScan ?? 5_000, 20_000));
  const page = 500;
  const userIds: string[] = [];
  let cursor: string | null = null;
  let truncated = false;
  const activeSince = campaignActiveUsersSince();

  while (userIds.length < maxScan) {
    const slice = await fetchCampaignProfileScanSlice(svc, campaign, cursor, page, { activeSince });
    if (slice.length === 0) break;
    userIds.push(...slice);
    cursor = slice[slice.length - 1] ?? null;
    if (slice.length < page) break;
    if (userIds.length >= maxScan) {
      truncated = true;
      break;
    }
  }

  return { userIds: userIds.slice(0, maxScan), truncated };
}

/**
 * 대상 회원 수만 센다(머리 count 1번) — 반복 발송 다음 회차 스냅샷용 (최종 감사 병목 정정).
 * 미리보기(`previewCampaignAudience`)는 회원별 기기 조회를 순서대로 해서 회원이 많으면 예약 실행이 느려진다.
 * 실패하면 null(스냅샷 생략 · 발송은 그대로).
 */
export async function countCampaignTargetMembers(
  svc: SupabaseClient,
  campaign: Pick<AdminNotificationCampaignRow, "target_type" | "segment_region_code">,
  selectedUserIds: readonly string[],
  opts?: { activeSince?: string | null }
): Promise<number | null> {
  const tt = campaign.target_type;
  if (tt === "selected_users") return selectedUserIds.length;
  if (tt === "segment") return 0;
  if (tt === "marketing_opt_in") {
    const { count, error } = await svc
      .from("user_notification_settings")
      .select("user_id", { count: "exact", head: true })
      .eq("marketing_enabled", true);
    return error ? null : count ?? 0;
  }
  if (tt !== "all" && tt !== "region" && tt !== "active_users") return null;
  if (tt === "region") {
    const lgu = campaign.segment_region_code?.trim() ?? "";
    if (!lgu) return 0;
    /** 발송 대상과 같은 판정 — 저장 LGU 일치 + 저장값 없는 예전 대표 주소는 계산값으로 (위 `fetchCampaignProfileScanSlice` 와 동일) */
    let total = 0;
    let cursor: string | null = null;
    const page = 1000;
    for (;;) {
      let rq = svc
        .from("user_addresses")
        .select("user_id, canonical_lgu_id, city_municipality, province")
        .eq("is_active", true)
        .eq("is_default_master", true)
        .or(`canonical_lgu_id.eq.${campaignLguFilterValue(lgu)},canonical_lgu_id.is.null`)
        .order("user_id", { ascending: true })
        .limit(page);
      if (cursor) rq = rq.gt("user_id", cursor);
      const { data: rows, error: rErr } = await rq;
      if (rErr) return null;
      const list = (rows ?? []) as Array<Record<string, unknown>>;
      for (const r of list) if (campaignRowMatchesLgu(r, lgu)) total += 1;
      if (list.length < page) return total;
      cursor = String(list[list.length - 1]!.user_id);
    }
  }
  let q = svc.from("profiles").select("id", { count: "exact", head: true });
  if (tt === "active_users") q = q.gte("updated_at", opts?.activeSince || campaignActiveUsersSince());
  const { count, error } = await q;
  return error ? null : count ?? 0;
}
