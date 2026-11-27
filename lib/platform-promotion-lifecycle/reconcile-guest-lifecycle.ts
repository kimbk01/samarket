import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Guest → Member reconcile for promotion lifecycle.
 * Copies device-scoped rows for THIS deviceKey onto authenticated user.
 * Does NOT pull other devices/users. Does NOT write member state onto device.
 *
 * 회원에게 **똑같은 행**(아래 열 전부 같음)이 이미 있으면 넣지 않는다 — 두 표 모두 고유 키가 `id` 뿐이라, 이전에는
 * 부를 때마다 같은 행이 새로 복사됐다(운영 11-27 조회: 방문 회원 행 787 중 780, 팝업 숨김 2,467 중 2,366 중복).
 * 기한(`suppress_until`)·캠페인 판(`campaign_revision`)이 다른 숨김은 다른 행이다 — 새 「오늘 숨김」을 옛 행 때문에 빠뜨리지 않는다.
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

const SUPPRESSION_COLUMNS = "campaign_id, mode, session_key, suppress_until, campaign_revision, timezone";
const VISIT_COLUMNS = "event_id, source_channel, distribution_id, session_key, visited_at";

/** 손님 행 읽기 상한(기존 값) */
const GUEST_ROW_LIMIT = 200;
/** 회원 기존 행 읽기 — PostgREST 최대 행(1,000)에 맞춘 쪽 크기, 쪽 수 상한 */
export const MEMBER_ROW_PAGE_SIZE = 1000;
export const MEMBER_ROW_MAX_PAGES = 5;

function text(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

/** 시각 열 비교값 — 같은 순간이면 표기(Z / +00:00, 소수 자릿수)가 달라도 같다 */
function instant(v: unknown): string {
  const s = text(v);
  if (!s) return "";
  const ms = Date.parse(s);
  return Number.isFinite(ms) ? String(ms) : s;
}

/** 팝업 숨김 동일 판정 — 복사되는 열 전부 */
export function suppressionIdentityKey(row: SuppressionRow): string {
  return [
    text(row.campaign_id),
    text(row.mode),
    text(row.session_key),
    instant(row.suppress_until),
    text(row.campaign_revision),
    text(row.timezone),
  ].join("|");
}

/** 방문 동일 판정 — 복사되는 열 전부 */
export function visitIdentityKey(row: VisitRow): string {
  return [
    text(row.event_id),
    text(row.session_key),
    text(row.source_channel),
    text(row.distribution_id),
    instant(row.visited_at),
  ].join("|");
}

type PageResult<T> = { ok: true; rows: T[] } | { ok: false; error: string };

/**
 * 회원 기존 행을 쪽으로 나눠 끝까지 읽는다. 상한(5,000행)을 넘으면 실패 — 다 확인하지 못한 채 넣으면 중복이 생긴다.
 */
async function readMemberRows<T>(
  sb: SupabaseClient,
  table: string,
  columns: string,
  userId: string,
  inColumn: string,
  inValues: string[]
): Promise<PageResult<T>> {
  const rows: T[] = [];
  for (let page = 0; page < MEMBER_ROW_MAX_PAGES; page += 1) {
    const from = page * MEMBER_ROW_PAGE_SIZE;
    const { data, error } = await sb
      .from(table)
      .select(columns)
      .eq("user_id", userId)
      .in(inColumn, inValues)
      .order("id", { ascending: true })
      .range(from, from + MEMBER_ROW_PAGE_SIZE - 1);
    if (error) return { ok: false, error: error.message };
    const got = (data ?? []) as T[];
    rows.push(...got);
    if (got.length < MEMBER_ROW_PAGE_SIZE) return { ok: true, rows };
  }
  return { ok: false, error: "member_rows_over_limit" };
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
    .select(SUPPRESSION_COLUMNS)
    .eq("anonymous_device_key", deviceKey)
    .is("user_id", null)
    .limit(GUEST_ROW_LIMIT);

  if (suppressReadErr) {
    return { ok: false, error: suppressReadErr.message };
  }

  const guestSuppressions = ((suppressRows ?? []) as SuppressionRow[]).filter((r) => text(r.campaign_id));
  if (guestSuppressions.length) {
    const campaignIds = [...new Set(guestSuppressions.map((r) => text(r.campaign_id)))];
    const member = await readMemberRows<SuppressionRow>(
      sb,
      "platform_popup_user_suppressions",
      SUPPRESSION_COLUMNS,
      userId,
      "campaign_id",
      campaignIds
    );
    if (!member.ok) return { ok: false, error: member.error };
    const seen = new Set(member.rows.map(suppressionIdentityKey));
    for (const row of guestSuppressions) {
      const key = suppressionIdentityKey(row);
      if (seen.has(key)) continue;
      seen.add(key);
      const { error } = await sb.from("platform_popup_user_suppressions").insert({
        user_id: userId,
        anonymous_device_key: null,
        campaign_id: text(row.campaign_id),
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
    .select(VISIT_COLUMNS)
    .eq("anonymous_device_key", deviceKey)
    .is("user_id", null)
    .limit(GUEST_ROW_LIMIT);

  if (visitReadErr) {
    return { ok: false, error: visitReadErr.message };
  }

  const guestVisits = ((visitRows ?? []) as VisitRow[]).filter((r) => text(r.event_id) && text(r.session_key));
  if (guestVisits.length) {
    const eventIds = [...new Set(guestVisits.map((r) => text(r.event_id)))];
    const member = await readMemberRows<VisitRow>(
      sb,
      "platform_promotion_content_visits",
      VISIT_COLUMNS,
      userId,
      "event_id",
      eventIds
    );
    if (!member.ok) return { ok: false, error: member.error };
    const seen = new Set(member.rows.map(visitIdentityKey));
    for (const row of guestVisits) {
      const key = visitIdentityKey(row);
      if (seen.has(key)) continue;
      seen.add(key);
      const { error } = await sb.from("platform_promotion_content_visits").insert({
        event_id: text(row.event_id),
        user_id: userId,
        anonymous_device_key: null,
        source_channel: row.source_channel,
        distribution_id: row.distribution_id ?? null,
        session_key: text(row.session_key),
        visited_at: row.visited_at ?? undefined,
      });
      if (!error) visitsCopied += 1;
    }
  }

  return { ok: true, suppressionsCopied, visitsCopied };
}
