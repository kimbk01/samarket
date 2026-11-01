/**
 * 사장님 매장 종 「다른 매장 안 읽음」(재감사 2026-11-02 S3) — 그 회원이 가진 매장마다 안 읽은 오너 알림 수.
 * 오너 알림 판정은 회원 종·매장 알림함과 같은 함수(isOwnerStoreCommerceNotificationRow · 운영 알림은 매장 id 있을 때만).
 * 종 창을 열 때만 1번 읽는다(폴링 경로에 넣지 않음).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  resolveNotificationEventKind,
  resolveNotificationEventStoreId,
} from "@/lib/notifications/core/notification-event-kind";
import { isOwnerStoreCommerceNotificationRow } from "@/lib/notifications/owner-store-commerce-notification-meta";

export type OwnerStoreUnread = { store_id: string; store_name: string; unread: number };

function isDismissed(dp: Record<string, unknown> | null): boolean {
  if (!dp) return false;
  return Boolean(dp.deleted_at) || Boolean(dp.inbox_dismissed_at) || dp.deleted === true || dp.deleted === "true";
}

export async function loadOwnerUnreadByStore(sb: SupabaseClient, userId: string): Promise<OwnerStoreUnread[]> {
  const uid = userId.trim();
  if (!uid) return [];
  const { data: stores, error: storeErr } = await sb.from("stores").select("id, store_name").eq("owner_user_id", uid);
  if (storeErr) throw new Error(`owner_stores_read_failed: ${storeErr.message}`);
  const owned = new Map<string, string>();
  for (const s of (stores ?? []) as Array<{ id: string; store_name: string | null }>) {
    owned.set(String(s.id), String(s.store_name ?? "").trim());
  }
  if (owned.size === 0) return [];

  const counts = new Map<string, number>();
  const PAGE = 1000;
  for (let from = 0; from < 20_000; from += PAGE) {
    const { data, error } = await sb
      .from("notification_events")
      .select("id, display_payload")
      .eq("user_id", uid)
      .eq("unread", true)
      .is("read_at", null)
      .order("id", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`owner_unread_read_failed: ${error.message}`);
    const chunk = (data ?? []) as Array<{ display_payload: unknown }>;
    for (const r of chunk) {
      const dp = r.display_payload && typeof r.display_payload === "object" ? (r.display_payload as Record<string, unknown>) : null;
      if (isDismissed(dp)) continue;
      const kind = resolveNotificationEventKind(dp);
      const storeId = resolveNotificationEventStoreId(dp);
      if (!storeId || !owned.has(storeId)) continue;
      if (!isOwnerStoreCommerceNotificationRow({ event_kind: kind, event_store_id: storeId })) continue;
      counts.set(storeId, (counts.get(storeId) ?? 0) + 1);
    }
    if (chunk.length < PAGE) break;
  }
  return [...owned]
    .map(([store_id, store_name]) => ({ store_id, store_name, unread: counts.get(store_id) ?? 0 }))
    .sort((a, b) => b.unread - a.unread || a.store_name.localeCompare(b.store_name));
}
