import type { SupabaseClient } from "@supabase/supabase-js";
import { isMissingRelationError } from "@/lib/admin/notification-campaigns/campaign-audit-log";
import {
  CAMPAIGN_TAB_STATUSES,
  campaignListRange,
  campaignTitleSearchPattern,
  resolveEffectiveCampaignStatus,
  type CampaignListQuery,
} from "@/lib/admin/notification-campaigns/campaign-status-machine";

/** ADM-05 server-paginated campaign list (tab · filters · page). */

const LIST_COLUMNS =
  "id, title, body, type, target_type, channel, status, send_mode, is_qa, scheduled_at, sent_at, created_by, created_at, updated_at, target_count, sent_count, skipped_count, failed_count, target_payload, deeplink_url, push_image_url, in_app_image_url";

const OCCURRENCE_COLUMNS =
  "id, campaign_id, sequence_number, trigger_type, status, scheduled_for, push_sent, push_skipped, push_failed, push_device_count, in_app_sent, in_app_member_count, target_member_count, completed_at, last_error";

/** Upper bound for opened-delivery rows read per page (opened is a small subset of deliveries). */
export const CAMPAIGN_LIST_OPENED_ROW_CAP = 20_000;

export type CampaignOpenedCounts = { push: number; in_app: number; capped: boolean };

export type CampaignListRow = Record<string, unknown> & {
  id: string;
  status: string;
  effective_status: string;
  archived_at: string | null;
  author_name: string | null;
  latest_occurrence: Record<string, unknown> | null;
  opened: CampaignOpenedCounts | null;
};

export type CampaignListResult =
  | {
      ok: true;
      campaigns: CampaignListRow[];
      total: number;
      page: number;
      page_size: number;
      /** false when the archived_at column is not migrated yet (archive tab empty, no filter). */
      archive_supported: boolean;
      table_missing?: boolean;
    }
  | { ok: false; error: string };

type Builder = {
  is: (col: string, v: null) => Builder;
  not: (col: string, op: string, v: null) => Builder;
  eq: (col: string, v: unknown) => Builder;
  in: (col: string, v: readonly unknown[]) => Builder;
  ilike: (col: string, v: string) => Builder;
  order: (col: string, o: { ascending: boolean }) => Builder;
  range: (a: number, b: number) => PromiseLike<{
    data: unknown[] | null;
    error: { code?: string; message?: string } | null;
    count: number | null;
  }>;
};

function applyListFilters(base: Builder, q: CampaignListQuery, withArchive: boolean): Builder {
  let b = base;
  if (q.tab === "archived") {
    b = b.not("archived_at", "is", null);
  } else {
    if (withArchive) b = b.is("archived_at", null);
    if (q.tab === "qa") {
      b = b.eq("is_qa", true);
    } else {
      b = b.eq("is_qa", false);
      b = q.status ? b.eq("status", q.status) : b.in("status", CAMPAIGN_TAB_STATUSES[q.tab]);
    }
  }
  if ((q.tab === "archived" || q.tab === "qa") && q.status) b = b.eq("status", q.status);
  if (q.type) b = b.eq("type", q.type);
  if (q.q) b = b.ilike("title", campaignTitleSearchPattern(q.q));
  return b.order("created_at", { ascending: false }).order("id", { ascending: false });
}

export function pickLatestOccurrence(rows: Array<Record<string, unknown>>): Record<string, unknown> | null {
  let real: Record<string, unknown> | null = null;
  let test: Record<string, unknown> | null = null;
  for (const r of rows) {
    const seq = Number(r.sequence_number ?? 0);
    if (String(r.trigger_type ?? "") === "test") {
      if (!test || seq > Number(test.sequence_number ?? 0)) test = r;
    } else if (!real || seq > Number(real.sequence_number ?? 0)) {
      real = r;
    }
  }
  return real ?? test;
}

export function authorDisplayName(p: Record<string, unknown> | undefined): string | null {
  if (!p) return null;
  for (const k of ["display_name", "nickname", "username"]) {
    const v = p[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return null;
}

export async function listAdminNotificationCampaigns(
  svc: SupabaseClient,
  q: CampaignListQuery
): Promise<CampaignListResult> {
  const { from, to } = campaignListRange(q);
  const run = (withArchive: boolean) => {
    const select = withArchive ? `${LIST_COLUMNS}, archived_at` : LIST_COLUMNS;
    const base = svc
      .from("admin_notification_campaigns")
      .select(select, { count: "exact" }) as unknown as Builder;
    return applyListFilters(base, q, withArchive).range(from, to);
  };

  let archiveSupported = true;
  let res = await run(true);
  if (res.error && isMissingRelationError(res.error) && String(res.error.message ?? "").includes("archived_at")) {
    archiveSupported = false;
    if (q.tab === "archived") {
      return { ok: true, campaigns: [], total: 0, page: q.page, page_size: q.pageSize, archive_supported: false };
    }
    res = await run(false);
  }
  if (res.error) {
    if (isMissingRelationError(res.error)) {
      return {
        ok: true,
        campaigns: [],
        total: 0,
        page: q.page,
        page_size: q.pageSize,
        archive_supported: archiveSupported,
        table_missing: true,
      };
    }
    return { ok: false, error: String(res.error.message ?? "list_failed") };
  }

  const campaigns = (res.data ?? []) as Array<Record<string, unknown>>;
  const ids = campaigns.map((c) => String(c.id));
  const authorIds = [...new Set(campaigns.map((c) => String(c.created_by ?? "")).filter(Boolean))];

  const [occRes, profRes] = await Promise.all([
    ids.length
      ? svc
          .from("admin_notification_campaign_occurrences")
          .select(OCCURRENCE_COLUMNS)
          .in("campaign_id", ids)
          .order("sequence_number", { ascending: false })
      : Promise.resolve({ data: [], error: null }),
    authorIds.length
      ? svc.from("profiles").select("id, display_name, nickname, username").in("id", authorIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  const occByCampaign = new Map<string, Array<Record<string, unknown>>>();
  for (const row of (occRes.data ?? []) as Array<Record<string, unknown>>) {
    const cid = String(row.campaign_id ?? "");
    const list = occByCampaign.get(cid) ?? [];
    list.push(row);
    occByCampaign.set(cid, list);
  }
  const latestByCampaign = new Map<string, Record<string, unknown> | null>();
  for (const id of ids) latestByCampaign.set(id, pickLatestOccurrence(occByCampaign.get(id) ?? []));

  const profileById = new Map<string, Record<string, unknown>>();
  for (const p of (profRes.data ?? []) as Array<Record<string, unknown>>) profileById.set(String(p.id), p);

  const latestOccIds = [...latestByCampaign.values()]
    .map((o) => (o ? String(o.id ?? "") : ""))
    .filter(Boolean);
  const openedByOcc = await loadOpenedCountsByOccurrence(svc, latestOccIds);

  return {
    ok: true,
    total: res.count ?? campaigns.length,
    page: q.page,
    page_size: q.pageSize,
    archive_supported: archiveSupported,
    campaigns: campaigns.map((c) => {
      const id = String(c.id);
      const latest = latestByCampaign.get(id) ?? null;
      const latestReal =
        latest && String(latest.trigger_type ?? "") !== "test" ? String(latest.status ?? "") : null;
      return {
        ...c,
        id,
        status: String(c.status ?? ""),
        effective_status: resolveEffectiveCampaignStatus(String(c.status ?? ""), latestReal),
        archived_at: typeof c.archived_at === "string" ? c.archived_at : null,
        author_name: authorDisplayName(profileById.get(String(c.created_by ?? ""))),
        latest_occurrence: latest,
        opened: latest ? openedByOcc.get(String(latest.id)) ?? { push: 0, in_app: 0, capped: false } : null,
      };
    }),
  };
}

/** Opened = `notification_campaign_deliveries.status = 'opened'` (existing open tracking, no native ACK). */
export async function loadOpenedCountsByOccurrence(
  svc: SupabaseClient,
  occurrenceIds: string[]
): Promise<Map<string, CampaignOpenedCounts>> {
  const out = new Map<string, CampaignOpenedCounts>();
  if (!occurrenceIds.length) return out;
  for (const id of occurrenceIds) out.set(id, { push: 0, in_app: 0, capped: false });
  const { data, error } = await svc
    .from("notification_campaign_deliveries")
    .select("occurrence_id, channel")
    .in("occurrence_id", occurrenceIds)
    .eq("status", "opened")
    .limit(CAMPAIGN_LIST_OPENED_ROW_CAP);
  if (error) return out;
  const rows = (data ?? []) as Array<{ occurrence_id?: string; channel?: string }>;
  const capped = rows.length >= CAMPAIGN_LIST_OPENED_ROW_CAP;
  for (const r of rows) {
    const cur = out.get(String(r.occurrence_id ?? ""));
    if (!cur) continue;
    if (r.channel === "push") cur.push += 1;
    else if (r.channel === "in_app") cur.in_app += 1;
    cur.capped = capped;
  }
  return out;
}
