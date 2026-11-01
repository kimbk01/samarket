/**
 * 보낸 알림 「받은 사람」 (Owner 구현 승인 2026-11-02 · 시안 v3) — 서버 전용(service role).
 * 한 줄 = 회원 1명. 숫자 요약은 목록과 같은 계산(`memberOutcomes`·`memberStatsFromOutcomes`).
 */
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  memberOutcomes,
  memberStatsFromOutcomes,
  readCampaignDeliveries,
  type CampaignDeliveryLite,
  type CampaignMemberStats,
} from "@/lib/admin/notification-campaigns/campaign-list-service";
import { authorDisplayName } from "@/lib/admin/notification-campaigns/campaign-list-service";

export const CAMPAIGN_RECIPIENT_FILTERS = ["all", "ok", "fail", "none", "opened", "unread"] as const;
export type CampaignRecipientFilter = (typeof CAMPAIGN_RECIPIENT_FILTERS)[number];

export type CampaignRecipientRow = {
  user_id: string;
  name: string | null;
  inbox: "saved" | "not_saved";
  inbox_at: string | null;
  devices: number;
  push: "ok" | "fail" | "none";
  push_ok_devices: number;
  push_fail_devices: number;
  skip_reasons: string[];
  failures: unknown[];
  opened_at: string | null;
};

export type CampaignRecipientsResult =
  | {
      ok: true;
      occurrence: { id: string; sequence_number: number; completed_at: string | null; started_at: string | null } | null;
      stats: CampaignMemberStats;
      rows: CampaignRecipientRow[];
      total: number;
      page: number;
      page_size: number;
      failure_summary: Array<{ response: unknown; count: number }>;
    }
  | { ok: false; status: number; error: string };

type DeliveryRow = CampaignDeliveryLite & {
  skip_reason?: string | null;
  device_id?: string | null;
  notification_event_id?: string | null;
  sent_at?: string | null;
  opened_at?: string | null;
  created_at?: string | null;
};

export async function resolveCampaignOccurrenceForRecipients(
  svc: SupabaseClient,
  campaignId: string,
  occurrenceId: string | null
): Promise<{ id: string; sequence_number: number; completed_at: string | null; started_at: string | null } | null> {
  let q = svc
    .from("admin_notification_campaign_occurrences")
    .select("id, campaign_id, sequence_number, trigger_type, completed_at, started_at")
    .eq("campaign_id", campaignId);
  if (occurrenceId) q = q.eq("id", occurrenceId);
  const { data } = await q.neq("trigger_type", "test").order("sequence_number", { ascending: false }).limit(1);
  const row = (data ?? [])[0] as Record<string, unknown> | undefined;
  if (!row) return null;
  return {
    id: String(row.id),
    sequence_number: Number(row.sequence_number ?? 0),
    completed_at: typeof row.completed_at === "string" ? row.completed_at : null,
    started_at: typeof row.started_at === "string" ? row.started_at : null,
  };
}

function matches(f: CampaignRecipientFilter, r: CampaignRecipientRow): boolean {
  if (f === "ok") return r.push === "ok";
  if (f === "fail") return r.push === "fail";
  if (f === "none") return r.push === "none";
  if (f === "opened") return r.opened_at != null;
  if (f === "unread") return r.opened_at == null;
  return true;
}

export async function loadCampaignRecipients(
  svc: SupabaseClient,
  campaignId: string,
  opts: { occurrenceId: string | null; filter: CampaignRecipientFilter; page: number; pageSize: number }
): Promise<CampaignRecipientsResult> {
  const occurrence = await resolveCampaignOccurrenceForRecipients(svc, campaignId, opts.occurrenceId);
  if (!occurrence) {
    return {
      ok: true,
      occurrence: null,
      stats: { target: 0, inbox: 0, push_ok: 0, push_fail: 0, push_none: 0, opened: 0 },
      rows: [],
      total: 0,
      page: 1,
      page_size: opts.pageSize,
      failure_summary: [],
    };
  }
  const deliveries = (await readCampaignDeliveries(
    svc,
    [occurrence.id],
    "occurrence_id, user_id, channel, status, skip_reason, device_id, notification_event_id, sent_at, opened_at, created_at"
  )) as DeliveryRow[];
  const outcomes = memberOutcomes(deliveries);
  const stats = memberStatsFromOutcomes(outcomes);

  const byUser = new Map<string, DeliveryRow[]>();
  for (const d of deliveries) {
    const uid = String(d.user_id ?? "");
    if (!uid) continue;
    const list = byUser.get(uid) ?? [];
    list.push(d);
    byUser.set(uid, list);
  }

  // 실패 상세 — 기기별 발송 기록(notification_deliveries)의 공급자 응답.
  const failedEventIds = [
    ...new Set(
      deliveries
        .filter((d) => d.channel === "push" && d.status === "failed" && d.notification_event_id)
        .map((d) => String(d.notification_event_id))
    ),
  ];
  const failuresByEvent = new Map<string, unknown[]>();
  for (let i = 0; i < failedEventIds.length; i += 200) {
    const chunk = failedEventIds.slice(i, i + 200);
    const { data } = await svc
      .from("notification_deliveries")
      .select("notification_event_id, provider_response")
      .in("notification_event_id", chunk)
      .eq("status", "failed");
    for (const r of (data ?? []) as Array<{ notification_event_id: string; provider_response: unknown }>) {
      const list = failuresByEvent.get(r.notification_event_id) ?? [];
      list.push(r.provider_response);
      failuresByEvent.set(r.notification_event_id, list);
    }
  }

  const all: CampaignRecipientRow[] = [];
  for (const [uid, list] of byUser) {
    const o = outcomes.get(uid)!;
    const inApp = list.filter((d) => d.channel === "in_app");
    const push = list.filter((d) => d.channel === "push");
    const inboxRow = inApp.find((d) => d.status === "sent" || d.status === "opened");
    const openedAts = list.map((d) => d.opened_at).filter((v): v is string => typeof v === "string").sort();
    const eventIds = [...new Set(push.map((d) => String(d.notification_event_id ?? "")).filter(Boolean))];
    all.push({
      user_id: uid,
      name: null,
      inbox: inboxRow ? "saved" : "not_saved",
      inbox_at: inboxRow ? inboxRow.sent_at ?? inboxRow.created_at ?? null : null,
      devices: new Set(push.map((d) => String(d.device_id ?? "")).filter(Boolean)).size,
      push: o.pushOk ? "ok" : o.pushFail ? "fail" : "none",
      push_ok_devices: push.filter((d) => d.status === "sent" || d.status === "opened").length,
      push_fail_devices: push.filter((d) => d.status === "failed").length,
      skip_reasons: [...new Set(list.filter((d) => d.status === "skipped").map((d) => String(d.skip_reason ?? "")).filter(Boolean))],
      failures: eventIds.flatMap((id) => failuresByEvent.get(id) ?? []),
      opened_at: o.opened ? openedAts[0] ?? null : null,
    });
  }
  const order = { fail: 0, ok: 1, none: 2 } as const;
  all.sort((a, b) => order[a.push] - order[b.push] || (b.inbox_at ?? "").localeCompare(a.inbox_at ?? ""));

  const filtered = all.filter((r) => matches(opts.filter, r));
  const total = filtered.length;
  const pageCount = Math.max(1, Math.ceil(total / opts.pageSize));
  const page = Math.min(Math.max(1, opts.page), pageCount);
  const rows = filtered.slice((page - 1) * opts.pageSize, page * opts.pageSize);

  const ids = rows.map((r) => r.user_id);
  if (ids.length) {
    const { data } = await svc.from("profiles").select("id, display_name, nickname, username").in("id", ids);
    const byId = new Map((data ?? []).map((p: Record<string, unknown>) => [String(p.id), p]));
    for (const r of rows) r.name = authorDisplayName(byId.get(r.user_id));
  }

  const summary = new Map<string, { response: unknown; count: number }>();
  for (const list of failuresByEvent.values()) {
    for (const resp of list) {
      const r = resp && typeof resp === "object" ? (resp as Record<string, unknown>) : {};
      const key = String(r.error ?? r.code ?? "failed");
      const cur = summary.get(key) ?? { response: resp, count: 0 };
      cur.count += 1;
      summary.set(key, cur);
    }
  }

  return {
    ok: true,
    occurrence,
    stats,
    rows,
    total,
    page,
    page_size: opts.pageSize,
    failure_summary: [...summary.values()].sort((a, b) => b.count - a.count),
  };
}

/** 다시 보내기 대상 — 실패한 사람 / 안 읽은 사람 (같은 회원 단위 계산). */
export async function campaignResendUserIds(
  svc: SupabaseClient,
  occurrenceId: string,
  mode: "failed" | "unread"
): Promise<string[]> {
  const rows = (await readCampaignDeliveries(svc, [occurrenceId])) as CampaignDeliveryLite[];
  const out: string[] = [];
  for (const [uid, o] of memberOutcomes(rows)) {
    if (mode === "failed" ? !o.pushOk && o.pushFail : !o.opened) out.push(uid);
  }
  return out;
}
