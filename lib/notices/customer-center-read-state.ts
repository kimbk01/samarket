/**
 * 고객센터 글 읽음·안읽음 (알림 최종 설계 §3·§5 · Owner 승인 2026-11-01) — 서버 전용.
 *
 * - 읽음 = 회원의 `customer_center_content_views` 행이 있음 (기존 열람 기록 표 · 새 표 없음).
 * - 안읽음 = 열람 기록 없음 + 가입일 이후 게시된 글 (D5).
 * - 「N」 = 게시 7일 이내 (D3).
 * - 글을 읽으면 그 글을 가리키는 내 알림도 읽음, 알림으로 글을 열면 글도 읽음 (같은 읽음 함수).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  CUSTOMER_CENTER_CONTENT_TYPES,
  isCustomerCenterContentPublishedNow,
  parseCustomerCenterContentType,
  type CustomerCenterContentType,
} from "@/lib/notices/customer-center-content";
import { patchInboxNotificationIdsRead } from "@/lib/notifications/inbox-read-bridge";

/** D3 — 새 글 표시 기간 */
export const CUSTOMER_CENTER_NEW_BADGE_DAYS = 7;

export function isCustomerCenterContentNew(publishedAt: string | null | undefined, nowMs = Date.now()): boolean {
  const t = Date.parse(String(publishedAt ?? ""));
  if (!Number.isFinite(t)) return false;
  return nowMs - t <= CUSTOMER_CENTER_NEW_BADGE_DAYS * 24 * 60 * 60 * 1000 && t <= nowMs;
}

/** D5 — 가입 전에 게시된 글은 안읽음으로 세지 않는다. 가입일을 모르면 모두 대상. */
export function isCustomerCenterContentUnread(input: {
  read: boolean;
  publishedAt: string | null | undefined;
  joinedAt: string | null | undefined;
}): boolean {
  if (input.read) return false;
  const joined = Date.parse(String(input.joinedAt ?? ""));
  if (!Number.isFinite(joined)) return true;
  const pub = Date.parse(String(input.publishedAt ?? ""));
  if (!Number.isFinite(pub)) return true;
  return pub >= joined;
}

/** 열람 기록 표의 날짜 단위(RPC 와 같은 서울 날짜). */
function seoulViewDay(now = new Date()): string {
  return now.toLocaleDateString("en-CA", { timeZone: "Asia/Seoul" });
}

export async function loadMemberJoinedAt(sb: SupabaseClient, userId: string): Promise<string | null> {
  const { data } = await sb.from("profiles").select("created_at").eq("id", userId).maybeSingle();
  const v = (data as { created_at?: string | null } | null)?.created_at;
  return typeof v === "string" && v ? v : null;
}

export async function loadMemberReadContentIds(
  sb: SupabaseClient,
  userId: string,
  contentIds: readonly string[]
): Promise<Set<string>> {
  const ids = [...new Set(contentIds.map((x) => x.trim()).filter(Boolean))];
  if (ids.length === 0) return new Set();
  const { data, error } = await sb
    .from("customer_center_content_views")
    .select("content_id")
    .eq("user_id", userId)
    .in("content_id", ids);
  if (error) return new Set();
  return new Set(((data ?? []) as { content_id: string }[]).map((r) => String(r.content_id)));
}

type LiveContentRow = {
  id: string;
  content_type: string;
  published_at: string | null;
  created_at: string;
  is_active: boolean;
  starts_at: string | null;
  ends_at: string | null;
  archived_at: string | null;
  deleted_at: string | null;
};

async function loadLiveContents(
  sb: SupabaseClient,
  contentType?: CustomerCenterContentType | null
): Promise<LiveContentRow[]> {
  let q = sb
    .from("app_notices")
    .select("id, content_type, published_at, created_at, is_active, starts_at, ends_at, archived_at, deleted_at")
    .eq("is_active", true)
    .is("deleted_at", null)
    .is("archived_at", null)
    .limit(1000);
  if (contentType) q = q.eq("content_type", contentType);
  const { data, error } = await q;
  if (error) throw new Error(`customer_center_contents_load_failed: ${error.message}`);
  return ((data ?? []) as LiveContentRow[]).filter((r) => isCustomerCenterContentPublishedNow(r));
}

export type CustomerCenterUnreadCounts = Record<CustomerCenterContentType, number> & { total: number };

/** 허브 타일·내 정보 고객센터 줄의 안 읽은 글 수. */
export async function loadCustomerCenterUnreadCounts(
  sb: SupabaseClient,
  userId: string
): Promise<CustomerCenterUnreadCounts> {
  const [rows, joinedAt] = await Promise.all([loadLiveContents(sb), loadMemberJoinedAt(sb, userId)]);
  const readIds = await loadMemberReadContentIds(
    sb,
    userId,
    rows.map((r) => r.id)
  );
  const counts = Object.fromEntries(CUSTOMER_CENTER_CONTENT_TYPES.map((t) => [t, 0])) as CustomerCenterUnreadCounts;
  counts.total = 0;
  for (const r of rows) {
    const unread = isCustomerCenterContentUnread({
      read: readIds.has(r.id),
      publishedAt: r.published_at ?? r.created_at,
      joinedAt,
    });
    if (!unread) continue;
    const type = parseCustomerCenterContentType(r.content_type, "notice");
    counts[type] += 1;
    counts.total += 1;
  }
  return counts;
}

/**
 * 글을 가리키는 내 미읽음 알림 id (운영 DB 실측 키: `display_payload.content_id` / `appNoticeId`).
 * 알림 읽음은 기존 읽음 함수(`patchInboxNotificationIdsRead`) 하나로 처리한다.
 */
export async function markNotificationsReadForContents(
  sb: SupabaseClient,
  userId: string,
  contentIds: readonly string[]
): Promise<number> {
  const ids = [...new Set(contentIds.map((x) => x.trim()).filter(Boolean))];
  if (ids.length === 0) return 0;
  const list = ids.map((id) => `"${id}"`).join(",");
  const { data, error } = await sb
    .from("notification_events")
    .select("id")
    .eq("user_id", userId)
    .eq("unread", true)
    .is("read_at", null)
    .or(`display_payload->>content_id.in.(${list}),display_payload->>appNoticeId.in.(${list})`)
    .limit(500);
  if (error || !data || data.length === 0) return 0;
  const eventIds = (data as { id: string }[]).map((r) => String(r.id));
  const res = await patchInboxNotificationIdsRead(sb, userId, eventIds);
  return res.ok ? res.updated : 0;
}

/**
 * 「모두 읽음」 — 열람 기록만 남긴다(조회수는 올리지 않음: 실제로 본 것이 아니므로 RPC 를 쓰지 않는다).
 * 같은 글을 가리키는 알림도 읽음 처리한다.
 */
export async function markCustomerCenterContentsRead(
  sb: SupabaseClient,
  userId: string,
  contentType: CustomerCenterContentType | null
): Promise<{ marked: number; notificationsRead: number }> {
  const rows = await loadLiveContents(sb, contentType);
  const readIds = await loadMemberReadContentIds(
    sb,
    userId,
    rows.map((r) => r.id)
  );
  const day = seoulViewDay();
  const toInsert = rows
    .filter((r) => !readIds.has(r.id))
    .map((r) => ({ content_id: r.id, user_id: userId, view_day: day }));
  if (toInsert.length > 0) {
    const { error } = await sb
      .from("customer_center_content_views")
      .upsert(toInsert, { onConflict: "content_id,user_id,view_day", ignoreDuplicates: true });
    if (error) throw new Error(`customer_center_mark_read_failed: ${error.message}`);
  }
  const notificationsRead = await markNotificationsReadForContents(
    sb,
    userId,
    rows.map((r) => r.id)
  );
  return { marked: toInsert.length, notificationsRead };
}
