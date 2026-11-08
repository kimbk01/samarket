/**
 * 「푸시·알림 발송 › 매장 알림」(재감사 2026-11-02 S3) — 사장님에게 간 알림(주문·운영·광고·문의 답변)을 종류별로.
 * 읽기 전용. 출처: notification_events(오너 종류 · 회원 종·매장 알림함과 같은 판정) + notification_deliveries(기기별 푸시).
 * 1,000행 단위로 끝까지 읽는다.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  resolveNotificationEventKind,
  resolveNotificationEventStoreId,
} from "@/lib/notifications/core/notification-event-kind";
import {
  isOwnerStoreCommerceNotificationRow,
  OWNER_STORE_COMMERCE_NOTIFICATION_META_KINDS,
  OWNER_STORE_OPS_NOTICE_META_KINDS,
} from "@/lib/notifications/owner-store-commerce-notification-meta";
import { resolveNotificationItem } from "@/lib/notifications/notification-item-registry";
import { translate, type MessageKey } from "@/lib/i18n/messages";

export type OwnerNoticeKindResult = {
  kind: string;
  label_ko: string;
  label_en: string;
  /** 알림 수 · 받은 사장님 수 · 매장 수 */
  total: number;
  owners: number;
  stores: number;
  read: number;
  unread: number;
  /** 기기별 푸시 결과(한 알림이 여러 기기로 갈 수 있다) */
  push_sent: number;
  push_failed: number;
  push_skipped: number;
  last_at: string | null;
};

const PAGE = 1000;

/**
 * 항목표가 한 항목으로 묶은 종류 중 관리자 결과에서 구분해야 하는 것 — 같은 이름 두 줄이 되지 않게.
 * (Production 2026-11-02 05:44 PHT: 「주문 접수 리마인더」 두 줄 = 30초·60초)
 */
const KIND_LABEL_SUFFIX: Record<string, MessageKey> = {
  store_order_accept_reminder_30s: "admin_notification_campaigns_kind_suffix_30s",
  store_order_accept_reminder_60s: "admin_notification_campaigns_kind_suffix_60s",
};

export async function loadOwnerNoticeResults(
  svc: SupabaseClient,
  opts: { days: number }
): Promise<{ since: string; rows: OwnerNoticeKindResult[] }> {
  const since = new Date(Date.now() - Math.max(1, Math.min(180, Math.floor(opts.days))) * 86_400_000).toISOString();
  const kinds = [...OWNER_STORE_COMMERCE_NOTIFICATION_META_KINDS, ...OWNER_STORE_OPS_NOTICE_META_KINDS];
  const list = kinds.join(",");
  type Ev = { id: string; user_id: string; type: string; unread: boolean; read_at: string | null; created_at: string; display_payload: unknown };
  const events: Ev[] = [];
  for (let from = 0; from < 200_000; from += PAGE) {
    const { data, error } = await svc
      .from("notification_events")
      .select("id, user_id, type, unread, read_at, created_at, display_payload")
      .gte("created_at", since)
      .or(`display_payload->legacyMeta->>kind.in.(${list}),display_payload->>kind.in.(${list})`)
      .order("id", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`owner_notice_events_read_failed: ${error.message}`);
    const chunk = (data ?? []) as Ev[];
    events.push(...chunk);
    if (chunk.length < PAGE) break;
  }

  const byKind = new Map<string, { evs: Ev[]; owners: Set<string>; stores: Set<string> }>();
  const kindOfEvent = new Map<string, string>();
  for (const e of events) {
    const kind = resolveNotificationEventKind(e.display_payload);
    const storeId = resolveNotificationEventStoreId(e.display_payload);
    // 같은 판정 — 운영 알림은 매장 id 가 있을 때만 사장님 알림
    if (!isOwnerStoreCommerceNotificationRow({ event_kind: kind, event_store_id: storeId })) continue;
    const g = byKind.get(kind) ?? { evs: [], owners: new Set<string>(), stores: new Set<string>() };
    g.evs.push(e);
    g.owners.add(e.user_id);
    if (storeId) g.stores.add(storeId);
    byKind.set(kind, g);
    kindOfEvent.set(e.id, kind);
  }

  const push = new Map<string, { sent: number; failed: number; skipped: number }>();
  const ids = [...kindOfEvent.keys()];
  for (let i = 0; i < ids.length; i += 200) {
    const chunk = ids.slice(i, i + 200);
    for (let from = 0; from < 100_000; from += PAGE) {
      const { data, error } = await svc
        .from("notification_deliveries")
        .select("notification_event_id, status")
        .in("notification_event_id", chunk)
        .order("id", { ascending: true })
        .range(from, from + PAGE - 1);
      if (error) throw new Error(`owner_notice_deliveries_read_failed: ${error.message}`);
      const rows = (data ?? []) as Array<{ notification_event_id: string; status: string }>;
      for (const r of rows) {
        const kind = kindOfEvent.get(r.notification_event_id);
        if (!kind) continue;
        const p = push.get(kind) ?? { sent: 0, failed: 0, skipped: 0 };
        if (r.status === "sent" || r.status === "delivered" || r.status === "opened") p.sent += 1;
        else if (r.status === "failed") p.failed += 1;
        else if (r.status === "skipped") p.skipped += 1;
        push.set(kind, p);
      }
      if (rows.length < PAGE) break;
    }
  }

  const rows: OwnerNoticeKindResult[] = [...byKind].map(([kind, g]) => {
    const sample = g.evs[0];
    const item = resolveNotificationItem({ eventType: sample?.type ?? "", kind });
    const read = g.evs.filter((e) => !e.unread || e.read_at).length;
    const p = push.get(kind) ?? { sent: 0, failed: 0, skipped: 0 };
    const suffix = KIND_LABEL_SUFFIX[kind];
    return {
      kind,
      label_ko: `${item?.labelKo ?? kind}${suffix ? translate("ko", suffix) : ""}`,
      label_en: `${item?.labelEn ?? kind}${suffix ? translate("en", suffix) : ""}`,
      total: g.evs.length,
      owners: g.owners.size,
      stores: g.stores.size,
      read,
      unread: g.evs.length - read,
      push_sent: p.sent,
      push_failed: p.failed,
      push_skipped: p.skipped,
      last_at: g.evs.reduce<string | null>((m, e) => (!m || e.created_at > m ? e.created_at : m), null),
    };
  });
  rows.sort((a, b) => b.total - a.total || a.kind.localeCompare(b.kind));
  return { since, rows };
}
