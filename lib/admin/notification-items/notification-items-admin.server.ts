/**
 * 어드민 「알림 항목 관리」 데이터 — 항목표(코드) + 어드민 설정(DB) + 운영 30일 실측.
 * notification-admin-item-ssot-audit-2026-11-02 §3-2 (Owner 설계 승인 2026-11-02). 서버 전용 · 읽기는 service role.
 *
 * - 종 탭: 그 항목의 **가장 최근 실제 행**을 회원 화면과 같은 함수(classifyMemberNotificationDomain)로 분류해 보여 준다.
 *   최근 행이 없으면 null(「최근 발생 없음」) — 추정해서 채우지 않는다.
 * - 회원 설정: 견본으로 회원 설정 판정 함수(getNotificationPreferencePolicy)를 실행한 결과.
 * - 30일 수치: 발생 행 · 푸시 생략 행(사유별) · 발송 성공 기록이 있는 행.
 */
import "server-only";
import type { NotificationItemAdminRow } from "@/lib/admin/notification-items/notification-items-admin.types";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  NOTIFICATION_ITEMS,
  notificationItemInputFromEvent,
  resolveNotificationItem,
  type NotificationItemDefinition,
} from "@/lib/notifications/notification-item-registry";
import {
  effectiveNotificationItemSetting,
  loadNotificationItemSettingRows,
  type NotificationItemSettingRow,
} from "@/lib/notifications/notification-item-settings";
import { getNotificationPreferencePolicy } from "@/lib/notifications/policy/notification-preference-policy-registry";
import { mapNotificationEventToInboxRow } from "@/lib/notifications/inbox-events-merge";
import {
  classifyMemberNotificationDomain,
  memberNotificationDomainRowFromInbox,
} from "@/lib/notifications/member-notification-domain";

export const NOTIFICATION_ITEM_STATS_DAYS = 30;
const EVENT_SCAN_LIMIT = 20_000;

export type { NotificationItemAdminRow };

export type NotificationItemsAdminPayload = {
  items: NotificationItemAdminRow[];
  statsDays: number;
  statsTruncated: boolean;
  /** 어느 항목에도 맞지 않는 30일 행(새 종류가 항목표에 없을 때 > 0) */
  unmatched: { eventType: string; kind: string | null; count: number }[];
};

type ScanRow = {
  id: string;
  type: string;
  created_at: string;
  push_suppressed_reason: string | null;
  kind: string | null;
  top_kind: string | null;
  role: string | null;
  meta_role: string | null;
  campaign_type: string | null;
  preview_kind: string | null;
};

function preferenceFor(item: NotificationItemDefinition): NotificationItemAdminRow["preference"] {
  if (item.audience === "admin") return null;
  const s = item.samples[0]!;
  const policy = getNotificationPreferencePolicy({
    eventType: s.eventType,
    metaKind: s.kind ?? null,
    recipientRole: item.audience === "owner" ? "owner" : "member",
  });
  return { domain: policy.preferenceDomain, mandatory: policy.policyClass === "mandatory" };
}

async function scanEvents(sb: SupabaseClient<any>, sinceIso: string): Promise<{ rows: ScanRow[]; truncated: boolean }> {
  const { data, error } = await sb
    .from("notification_events")
    .select(
      "id, type, created_at, push_suppressed_reason, kind:display_payload->legacyMeta->>kind, top_kind:display_payload->>kind, role:display_payload->>receiverRole, meta_role:display_payload->legacyMeta->>receiverRole, campaign_type:display_payload->>campaignType, preview_kind:display_payload->>previewKind"
    )
    .gte("created_at", sinceIso)
    .order("created_at", { ascending: false })
    .limit(EVENT_SCAN_LIMIT);
  if (error) throw new Error(`notification_items_scan_failed:${error.message}`);
  const rows = (data ?? []) as ScanRow[];
  return { rows, truncated: rows.length >= EVENT_SCAN_LIMIT };
}

async function sentEventIds(sb: SupabaseClient<any>, sinceIso: string): Promise<Set<string>> {
  const { data, error } = await sb
    .from("notification_deliveries")
    .select("notification_event_id")
    .gte("created_at", sinceIso)
    .eq("status", "sent")
    .not("notification_event_id", "is", null)
    .limit(EVENT_SCAN_LIMIT * 3);
  if (error) throw new Error(`notification_items_deliveries_failed:${error.message}`);
  return new Set((data ?? []).map((r: { notification_event_id: string }) => r.notification_event_id));
}

async function bellDomainsFromLatestRows(
  sb: SupabaseClient<any>,
  latestIdByItem: Map<string, string>
): Promise<Map<string, string | null>> {
  const ids = [...latestIdByItem.values()];
  const out = new Map<string, string | null>();
  if (ids.length === 0) return out;
  const { data, error } = await sb
    .from("notification_events")
    .select("id, type, category, title, body, display_payload, read_at, created_at, dedupe_key, room_id")
    .in("id", ids);
  if (error) throw new Error(`notification_items_latest_failed:${error.message}`);
  const byId = new Map((data ?? []).map((r: { id: string }) => [r.id, r]));
  for (const [itemKey, id] of latestIdByItem) {
    const row = byId.get(id);
    if (!row) continue;
    const inbox = mapNotificationEventToInboxRow(row as never);
    out.set(itemKey, classifyMemberNotificationDomain(memberNotificationDomainRowFromInbox(inbox)));
  }
  return out;
}

async function adminNotificationCounts(
  sb: SupabaseClient<any>,
  sinceIso: string
): Promise<Map<string, { created: number; pushSent: number; lastAt: string | null }>> {
  const { data, error } = await sb
    .from("admin_notifications")
    .select("kind, push_status, created_at")
    .gte("created_at", sinceIso)
    .order("created_at", { ascending: false })
    .limit(EVENT_SCAN_LIMIT);
  const out = new Map<string, { created: number; pushSent: number; lastAt: string | null }>();
  if (error) return out;
  for (const r of (data ?? []) as { kind: string; push_status: string; created_at: string }[]) {
    const item = resolveNotificationItem({ eventType: r.kind, receiverRole: "admin_ops" });
    if (!item) continue;
    const cur = out.get(item.key) ?? { created: 0, pushSent: 0, lastAt: null };
    cur.created += 1;
    if (r.push_status === "sent") cur.pushSent += 1;
    cur.lastAt = cur.lastAt ?? r.created_at;
    out.set(item.key, cur);
  }
  return out;
}

export async function loadNotificationItemsAdminPayload(
  sb: SupabaseClient<any>,
  now: Date = new Date()
): Promise<NotificationItemsAdminPayload> {
  const sinceIso = new Date(now.getTime() - NOTIFICATION_ITEM_STATS_DAYS * 86_400_000).toISOString();
  const [settingRows, scan, sentIds, adminCounts] = await Promise.all([
    loadNotificationItemSettingRows(sb),
    scanEvents(sb, sinceIso),
    sentEventIds(sb, sinceIso),
    adminNotificationCounts(sb, sinceIso),
  ]);
  const settings = new Map<string, NotificationItemSettingRow>(settingRows.map((r) => [r.item_key, r]));

  const stats = new Map<string, NotificationItemAdminRow["stats"]>();
  const latestIdByItem = new Map<string, string>();
  const unmatched = new Map<string, { eventType: string; kind: string | null; count: number }>();
  for (const r of scan.rows) {
    const input = notificationItemInputFromEvent(r.type, {
      kind: r.top_kind,
      receiverRole: r.role,
      campaignType: r.campaign_type,
      previewKind: r.preview_kind,
      legacyMeta: { kind: r.kind, receiverRole: r.meta_role },
    });
    const item = resolveNotificationItem(input);
    if (!item) {
      const k = `${r.type}|${input.kind ?? ""}`;
      const cur = unmatched.get(k) ?? { eventType: r.type, kind: input.kind ?? null, count: 0 };
      cur.count += 1;
      unmatched.set(k, cur);
      continue;
    }
    const st = stats.get(item.key) ?? { created: 0, pushSent: 0, suppressed: {}, lastAt: null };
    st.created += 1;
    if (sentIds.has(r.id)) st.pushSent += 1;
    if (r.push_suppressed_reason) {
      st.suppressed[r.push_suppressed_reason] = (st.suppressed[r.push_suppressed_reason] ?? 0) + 1;
    }
    if (!st.lastAt) {
      st.lastAt = r.created_at;
      latestIdByItem.set(item.key, r.id);
    }
    stats.set(item.key, st);
  }
  for (const [key, c] of adminCounts) {
    stats.set(key, { created: c.created, pushSent: c.pushSent, suppressed: {}, lastAt: c.lastAt });
  }

  const bellDomains = await bellDomainsFromLatestRows(sb, latestIdByItem);

  const items = NOTIFICATION_ITEMS.map((item): NotificationItemAdminRow => {
    const row = settings.get(item.key);
    const eff = effectiveNotificationItemSetting(item, row);
    return {
      key: item.key,
      labelKo: item.labelKo,
      labelEn: item.labelEn,
      audience: item.audience,
      group: item.group,
      soundEventKey: item.soundEventKey,
      pushLock: item.pushLock,
      inboxLock: item.inboxLock,
      legacyOnly: item.legacyOnly === true,
      pushEnabled: eff.pushEnabled,
      inboxEnabled: eff.inboxEnabled,
      revision: row?.revision ?? null,
      updatedAt: row?.updated_at ?? null,
      preference: preferenceFor(item),
      bellDomain: item.audience === "admin" ? null : bellDomains.get(item.key) ?? null,
      stats: stats.get(item.key) ?? { created: 0, pushSent: 0, suppressed: {}, lastAt: null },
    };
  });

  return {
    items,
    statsDays: NOTIFICATION_ITEM_STATS_DAYS,
    statsTruncated: scan.truncated,
    unmatched: [...unmatched.values()].sort((a, b) => b.count - a.count),
  };
}

export type NotificationItemSettingPatch = {
  item_key: string;
  push_enabled: boolean;
  inbox_enabled: boolean;
  /** 화면을 열 때 읽은 revision — 처음 저장이면 null. 다르면 409(다른 사람이 저장함). */
  base_revision: number | null;
};

export type SaveNotificationItemSettingsResult =
  | { ok: true; saved: string[] }
  | { ok: false; status: 400 | 409 | 500; error: string; item_key?: string };

/**
 * 저장 — 모두 검사한 뒤에만 쓴다. 잠긴 값을 바꾸려 하거나 revision 이 다르면 아무것도 쓰지 않는다
 * (AGENTS 운영 시험 저장 규칙 8 ②: 읽은 revision 으로만 저장 · 409 면 중단).
 */
export async function saveNotificationItemSettings(
  sb: SupabaseClient<any>,
  patches: NotificationItemSettingPatch[],
  actorId: string
): Promise<SaveNotificationItemSettingsResult> {
  const current = new Map((await loadNotificationItemSettingRows(sb)).map((r) => [r.item_key, r]));
  for (const p of patches) {
    const item = NOTIFICATION_ITEMS.find((i) => i.key === p.item_key);
    if (!item) return { ok: false, status: 400, error: "unknown_item", item_key: p.item_key };
    if (typeof p.push_enabled !== "boolean" || typeof p.inbox_enabled !== "boolean") {
      return { ok: false, status: 400, error: "invalid_value", item_key: p.item_key };
    }
    if ((item.pushLock && !p.push_enabled) || (item.inboxLock && !p.inbox_enabled)) {
      return { ok: false, status: 400, error: "item_locked", item_key: p.item_key };
    }
    const row = current.get(p.item_key);
    if ((row?.revision ?? null) !== p.base_revision) {
      return { ok: false, status: 409, error: "revision_conflict", item_key: p.item_key };
    }
  }
  const saved: string[] = [];
  const nowIso = new Date().toISOString();
  for (const p of patches) {
    const row = current.get(p.item_key);
    if (!row) {
      const { error } = await sb.from("notification_item_settings").insert({
        item_key: p.item_key,
        push_enabled: p.push_enabled,
        inbox_enabled: p.inbox_enabled,
        revision: 1,
        updated_at: nowIso,
        updated_by: actorId,
      });
      if (error) {
        const code = (error as { code?: string }).code;
        return code === "23505"
          ? { ok: false, status: 409, error: "revision_conflict", item_key: p.item_key }
          : { ok: false, status: 500, error: error.message, item_key: p.item_key };
      }
    } else {
      const { data, error } = await sb
        .from("notification_item_settings")
        .update({
          push_enabled: p.push_enabled,
          inbox_enabled: p.inbox_enabled,
          revision: row.revision + 1,
          updated_at: nowIso,
          updated_by: actorId,
        })
        .eq("item_key", p.item_key)
        .eq("revision", row.revision)
        .select("item_key");
      if (error) return { ok: false, status: 500, error: error.message, item_key: p.item_key };
      if (!data || data.length === 0) {
        return { ok: false, status: 409, error: "revision_conflict", item_key: p.item_key };
      }
    }
    saved.push(p.item_key);
  }
  return { ok: true, saved };
}
