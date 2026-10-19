import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Admin notification campaign audit log (`admin_notification_campaign_audit_logs`,
 * migration 20270516120000). Every mutating campaign route writes one row.
 *
 * Tolerance contract: the migration is applied separately from the deploy, so a missing table or
 * column (or any insert error) is logged as a warning and NEVER fails the admin action.
 */

export const CAMPAIGN_AUDIT_TABLE = "admin_notification_campaign_audit_logs";

export const CAMPAIGN_AUDIT_ACTIONS = [
  "create",
  "edit",
  "send",
  "resend",
  "schedule",
  "cancel",
  "stop_sending",
  "pause",
  "resume",
  "stop_recurring",
  "archive",
  "unarchive",
  "duplicate",
  "test_send",
  "source_skip",
] as const;

export type CampaignAuditAction = (typeof CAMPAIGN_AUDIT_ACTIONS)[number];

export type CampaignAuditEntry = {
  actorId: string | null;
  campaignId: string;
  action: CampaignAuditAction;
  fromStatus?: string | null;
  toStatus?: string | null;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  targetCount?: number | null;
  ip?: string | null;
};

export type CampaignAuditWriteResult =
  | { ok: true }
  | { ok: false; reason: "table_missing" | "insert_failed" | "exception"; message: string };

/** Postgres 42P01 undefined_table, 42703 undefined_column, PostgREST PGRST204/205 schema cache. */
export function isMissingRelationError(err: { code?: string | null; message?: string | null } | null | undefined): boolean {
  if (!err) return false;
  const code = String(err.code ?? "");
  if (code === "42P01" || code === "42703" || code === "PGRST204" || code === "PGRST205") return true;
  const msg = String(err.message ?? "").toLowerCase();
  return (
    msg.includes("does not exist") ||
    msg.includes("could not find the table") ||
    msg.includes("schema cache")
  );
}

/** First client IP from proxy headers (Vercel sets x-forwarded-for). */
export function readAuditRequestIp(headers: Pick<Headers, "get"> | null | undefined): string | null {
  if (!headers) return null;
  const xff = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const ip = xff || headers.get("x-real-ip")?.trim() || "";
  return ip ? ip.slice(0, 64) : null;
}

/** Fields worth keeping in before/after snapshots (no large payloads). */
const SNAPSHOT_FIELDS = [
  "status",
  "title",
  "body",
  "type",
  "target_type",
  "channel",
  "deeplink_url",
  "web_url",
  "push_image_url",
  "in_app_image_url",
  "segment_region_code",
  "send_mode",
  "scheduled_at",
  "recurrence_kind",
  "recurrence_time",
  "recurrence_weekday",
  "recurrence_start_at",
  "recurrence_end_at",
  "is_qa",
  "archived_at",
  "target_count",
] as const;

export function campaignAuditSnapshot(row: Record<string, unknown> | null | undefined): Record<string, unknown> | null {
  if (!row) return null;
  const out: Record<string, unknown> = {};
  for (const k of SNAPSHOT_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(row, k)) out[k] = row[k];
  }
  const payload = row.target_payload;
  if (payload && typeof payload === "object" && !Array.isArray(payload)) {
    const p = payload as Record<string, unknown>;
    const ids = Array.isArray(p.selected_user_ids) ? p.selected_user_ids.length : undefined;
    out.target_payload = {
      ...(typeof p.content_id === "string" ? { content_id: p.content_id } : {}),
      ...(typeof p.appNoticeId === "string" ? { appNoticeId: p.appNoticeId } : {}),
      ...(typeof p.platform_event_id === "string" ? { platform_event_id: p.platform_event_id } : {}),
      ...(ids != null ? { selected_user_count: ids } : {}),
    };
  }
  return out;
}

export async function writeCampaignAuditLog(
  svc: SupabaseClient,
  entry: CampaignAuditEntry
): Promise<CampaignAuditWriteResult> {
  try {
    const { error } = await svc.from(CAMPAIGN_AUDIT_TABLE).insert({
      actor_id: entry.actorId,
      campaign_id: entry.campaignId,
      action: entry.action,
      from_status: entry.fromStatus ?? null,
      to_status: entry.toStatus ?? null,
      before: entry.before ?? null,
      after: entry.after ?? null,
      target_count:
        typeof entry.targetCount === "number" && Number.isFinite(entry.targetCount)
          ? Math.max(0, Math.floor(entry.targetCount))
          : null,
      ip: entry.ip ?? null,
    });
    if (error) {
      const reason = isMissingRelationError(error) ? "table_missing" : "insert_failed";
      console.warn(`[campaign-audit] ${reason}: ${error.message ?? "unknown"} (action=${entry.action})`);
      return { ok: false, reason, message: String(error.message ?? "") };
    }
    return { ok: true };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.warn(`[campaign-audit] exception: ${message} (action=${entry.action})`);
    return { ok: false, reason: "exception", message };
  }
}
