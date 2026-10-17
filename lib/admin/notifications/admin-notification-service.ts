import "server-only";

/**
 * R13 — ADMIN NOTIFICATION service (server only, service-role client).
 *
 * Separation contract:
 *   - Store: public.admin_notifications (per-recipient rows). Never notification_events.
 *   - Read state: admin_notifications.read_at. Reading NEVER touches business workload.
 *   - Admin Action Queue (Bell digit) is a separate COUNT; inbox unread is its own number.
 *
 * Authority (same formula as requireAdminApiActor):
 *   active admin_memberships → effective role → staff permissions (tier defaults).
 *   Re-verified (1) when resolving recipients, (2) right before each push, (3) on every read.
 *   A revoked admin's rows are kept but unreadable and never pushed.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { isPrivilegedAdminRole } from "@/lib/auth/admin-policy";
import { loadActiveAdminMembership, resolveEffectiveAdminRole } from "@/lib/admin/admin-membership";
import { isSuperAdminRole, loadEffectiveStaffPermissions, permissionKeyAllowed } from "@/lib/admin/admin-user-server";
import type { AdminPermissionKey } from "@/lib/types/admin-staff";
import {
  ADMIN_NOTIFICATION_RETENTION_DAYS,
  type AdminNotificationDto,
  type AdminNotificationSeverity,
} from "@/lib/admin/notifications/admin-notification-kinds";
import { dispatchPushForUser } from "@/lib/push/dispatch/dispatch-push-for-user";
import type { DispatchPushResult } from "@/lib/push/dispatch/push-payload-types";
import { fetchDomainBadgeAuthorityPayload } from "@/lib/notifications/pipeline/notify-badge-service";
import { resolveMemberAppIconTotalForNativeFcm } from "@/lib/notifications/badge-authority-rebuild/native-fcm-member-app-icon-authority";
import { getSiteOrigin } from "@/lib/env/runtime";

export const ADMIN_NOTIFICATIONS_TABLE = "admin_notifications";

export type AdminRecipientAuthority =
  | { active: false }
  | { active: true; isSuperAdmin: boolean; permissions: AdminPermissionKey[] };

/** Same authority formula as requireAdminApiActor (membership → role → permissions). */
export async function resolveAdminRecipientAuthority(
  sb: SupabaseClient,
  userId: string
): Promise<AdminRecipientAuthority> {
  const membership = await loadActiveAdminMembership(sb, userId);
  if (!membership) return { active: false };
  const role = await resolveEffectiveAdminRole(sb, userId);
  if (!role || !isPrivilegedAdminRole(role)) return { active: false };
  const isSuperAdmin = isSuperAdminRole(role);
  const permissions = await loadEffectiveStaffPermissions(sb, userId, role, membership.admin_tier ?? null);
  return { active: true, isSuperAdmin, permissions };
}

export function authorityAllows(
  authority: AdminRecipientAuthority,
  requiredPermission: AdminPermissionKey | null
): boolean {
  if (!authority.active) return false;
  if (!requiredPermission || authority.isSuperAdmin) return true;
  return permissionKeyAllowed(authority.permissions, requiredPermission);
}

export type CreateAdminNotificationInput = {
  /** Explicit recipients (e.g. assigned support admin). */
  recipientAdminIds?: string[];
  /** Fan out to every active admin holding this permission (null = every active admin). */
  broadcastPermission?: AdminPermissionKey | null;
  /** Permission a recipient must STILL hold to read / be pushed this row. */
  requiredPermission?: AdminPermissionKey | null;
  kind: string;
  severity?: AdminNotificationSeverity;
  title: string;
  body?: string | null;
  linkUrl?: string | null;
  workRef?: { table: string; id: string } | null;
  /** Idempotency per recipient: same key → at most one row per admin (no double push). */
  dedupeKey: string;
  actorUserId?: string | null;
  push?: boolean;
};

export type AdminNotificationDeps = {
  resolveAuthority?: (sb: SupabaseClient, userId: string) => Promise<AdminRecipientAuthority>;
  sendPush?: (row: AdminNotificationRow, sb: SupabaseClient) => Promise<DispatchPushResult["outcome"] | "noop">;
};

export type AdminNotificationRow = {
  id: string;
  recipient_admin_id: string;
  required_permission: string | null;
  kind: string;
  severity: AdminNotificationSeverity;
  title: string;
  body: string | null;
  link_url: string | null;
  work_ref_table: string | null;
  work_ref_id: string | null;
  dedupe_key: string;
  created_at: string;
  read_at: string | null;
  archived_at: string | null;
};

const ROW_COLUMNS =
  "id, recipient_admin_id, required_permission, kind, severity, title, body, link_url, work_ref_table, work_ref_id, dedupe_key, created_at, read_at, archived_at";

async function listActiveAdminUserIds(sb: SupabaseClient): Promise<string[]> {
  const { data, error } = await sb.from("admin_memberships").select("user_id").eq("status", "active");
  if (error) throw new Error(error.message);
  return [...new Set((data ?? []).map((r) => String((r as { user_id?: unknown }).user_id ?? "")).filter(Boolean))];
}

function absolutize(link: string | null): string | null {
  if (!link) return null;
  if (/^https?:\/\//i.test(link)) return link;
  const base = getSiteOrigin();
  if (!base) return null;
  return link.startsWith("/") ? `${base}${link}` : `${base}/${link}`;
}

/** Default push sender — badge = Member App Icon total (admin rows never change it). */
async function defaultSendPush(row: AdminNotificationRow, sb: SupabaseClient) {
  const domain = await fetchDomainBadgeAuthorityPayload(sb, row.recipient_admin_id, { force: true });
  const memberAppIconTotal = resolveMemberAppIconTotalForNativeFcm({
    memberAppIconWebTotal: domain.memberAppIconWebTotal,
    appIconTotal: domain.projection?.appIconTotal,
  });
  const result = await dispatchPushForUser(
    {
      user_id: row.recipient_admin_id,
      notification_type: "notification",
      title: row.title,
      body: row.body,
      link_url: row.link_url,
      link_url_absolute: absolutize(row.link_url),
      occurred_at: row.created_at,
      meta: {
        event_type: row.kind,
        kind: row.kind,
        category: "admin_notification",
        admin_notification_id: row.id,
        badge_count: memberAppIconTotal,
      },
    },
    { event_type: row.kind, badge_count: memberAppIconTotal, notification_event_id: `admin:${row.id}` }
  );
  return result.outcome ?? "noop";
}

/**
 * Create admin notifications (fan-out). Recipients are filtered by CURRENT authority;
 * duplicates (same recipient + dedupeKey) are skipped and never re-pushed.
 */
export async function createAdminNotification(
  sb: SupabaseClient,
  input: CreateAdminNotificationInput,
  deps: AdminNotificationDeps = {}
): Promise<{ ok: true; created: number; skippedRecipients: number; pushed: number } | { ok: false; error: string }> {
  const resolveAuthority = deps.resolveAuthority ?? resolveAdminRecipientAuthority;
  const sendPush = deps.sendPush ?? defaultSendPush;
  const requiredPermission = input.requiredPermission ?? null;

  let candidates: string[];
  try {
    candidates =
      input.recipientAdminIds && input.recipientAdminIds.length > 0
        ? [...new Set(input.recipientAdminIds.map((s) => s.trim()).filter(Boolean))]
        : input.broadcastPermission !== undefined
          ? await listActiveAdminUserIds(sb)
          : [];
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }

  const gatePermission = input.broadcastPermission ?? requiredPermission;
  const recipients: string[] = [];
  for (const uid of candidates) {
    const authority = await resolveAuthority(sb, uid).catch(() => ({ active: false }) as const);
    if (authorityAllows(authority, gatePermission)) recipients.push(uid);
  }
  const skippedRecipients = candidates.length - recipients.length;
  if (recipients.length === 0) return { ok: true, created: 0, skippedRecipients, pushed: 0 };

  const rows = recipients.map((uid) => ({
    recipient_admin_id: uid,
    required_permission: gatePermission,
    kind: input.kind,
    severity: input.severity ?? "info",
    title: input.title.slice(0, 200),
    body: input.body ? input.body.slice(0, 500) : null,
    link_url: input.linkUrl ?? null,
    work_ref_table: input.workRef?.table ?? null,
    work_ref_id: input.workRef?.id ?? null,
    dedupe_key: input.dedupeKey,
    actor_user_id: input.actorUserId ?? null,
  }));

  const { data, error } = await sb
    .from(ADMIN_NOTIFICATIONS_TABLE)
    .upsert(rows, { onConflict: "recipient_admin_id,dedupe_key", ignoreDuplicates: true })
    .select(ROW_COLUMNS);
  if (error) return { ok: false, error: error.message };
  const inserted = (data ?? []) as AdminNotificationRow[];

  let pushed = 0;
  if (input.push) {
    for (const row of inserted) {
      // Re-verify immediately before sending: authority may have changed since resolution.
      const authority = await resolveAuthority(sb, row.recipient_admin_id).catch(() => ({ active: false }) as const);
      const allowed = authorityAllows(authority, row.required_permission as AdminPermissionKey | null);
      let status: string;
      if (!authority.active) status = "skipped_revoked";
      else if (!allowed) status = "skipped_permission";
      else {
        const outcome = await sendPush(row, sb).catch(() => "permanent" as const);
        status = outcome === "sent" ? "sent" : outcome === "noop" ? "skipped_disabled" : "failed";
        if (outcome === "sent") pushed += 1;
      }
      await sb
        .from(ADMIN_NOTIFICATIONS_TABLE)
        .update({ push_status: status, push_attempted_at: new Date().toISOString() })
        .eq("id", row.id);
    }
  }

  return { ok: true, created: inserted.length, skippedRecipients, pushed };
}

function retentionCutoffIso(now: Date = new Date()): string {
  return new Date(now.getTime() - ADMIN_NOTIFICATION_RETENTION_DAYS * 86_400_000).toISOString();
}

function visibleTo(row: AdminNotificationRow, authority: AdminRecipientAuthority): boolean {
  return authorityAllows(authority, (row.required_permission as AdminPermissionKey | null) ?? null);
}

export function toAdminNotificationDto(row: AdminNotificationRow): AdminNotificationDto {
  return {
    id: row.id,
    kind: row.kind,
    severity: row.severity,
    title: row.title,
    body: row.body,
    linkUrl: row.link_url,
    workRefTable: row.work_ref_table,
    workRefId: row.work_ref_id,
    createdAt: row.created_at,
    readAt: row.read_at,
  };
}

/** Inbox page (recipient-scoped, not archived, within retention, permission still held). */
export async function listAdminNotifications(
  sb: SupabaseClient,
  input: {
    adminUserId: string;
    authority: AdminRecipientAuthority;
    limit?: number;
    before?: string | null;
    unreadOnly?: boolean;
  }
): Promise<{ ok: true; items: AdminNotificationDto[]; unread: number; hasMore: boolean } | { ok: false; error: string }> {
  if (!input.authority.active) return { ok: false, error: "admin_only" };
  const limit = Math.min(Math.max(Math.floor(input.limit ?? 30), 1), 100);
  let q = sb
    .from(ADMIN_NOTIFICATIONS_TABLE)
    .select(ROW_COLUMNS)
    .eq("recipient_admin_id", input.adminUserId)
    .is("archived_at", null)
    .gte("created_at", retentionCutoffIso())
    .order("created_at", { ascending: false })
    .limit(limit + 1);
  if (input.before) q = q.lt("created_at", input.before);
  if (input.unreadOnly) q = q.is("read_at", null);
  const { data, error } = await q;
  if (error) return { ok: false, error: error.message };
  const rows = ((data ?? []) as AdminNotificationRow[]).filter((r) => visibleTo(r, input.authority));
  const hasMore = (data ?? []).length > limit;
  const unread = await countUnreadAdminNotifications(sb, input);
  if (!unread.ok) return unread;
  return { ok: true, items: rows.slice(0, limit).map(toAdminNotificationDto), unread: unread.unread, hasMore };
}

/** Unread inbox count — its own number, never mixed with the Action Queue total. */
export async function countUnreadAdminNotifications(
  sb: SupabaseClient,
  input: { adminUserId: string; authority: AdminRecipientAuthority }
): Promise<{ ok: true; unread: number } | { ok: false; error: string }> {
  if (!input.authority.active) return { ok: false, error: "admin_only" };
  const { data, error } = await sb
    .from(ADMIN_NOTIFICATIONS_TABLE)
    .select("id, required_permission")
    .eq("recipient_admin_id", input.adminUserId)
    .is("read_at", null)
    .is("archived_at", null)
    .gte("created_at", retentionCutoffIso())
    .limit(1000);
  if (error) return { ok: false, error: error.message };
  const unread = (data ?? []).filter((r) =>
    authorityAllows(input.authority, ((r as { required_permission?: string | null }).required_permission ?? null) as AdminPermissionKey | null)
  ).length;
  return { ok: true, unread };
}

/**
 * Mark read (recipient-scoped). Only read_at changes — business rows are never touched.
 * `ids` | `all` | `workRef` (e.g. opening a support case clears its replies).
 */
export async function markAdminNotificationsRead(
  sb: SupabaseClient,
  input: {
    adminUserId: string;
    ids?: string[];
    all?: boolean;
    workRef?: { table: string; id: string };
  }
): Promise<{ ok: true; updated: number } | { ok: false; error: string }> {
  const ids = (input.ids ?? []).map((s) => s.trim()).filter(Boolean).slice(0, 200);
  if (!input.all && ids.length === 0 && !input.workRef) return { ok: false, error: "nothing_to_mark" };
  let q = sb
    .from(ADMIN_NOTIFICATIONS_TABLE)
    .update({ read_at: new Date().toISOString() })
    .eq("recipient_admin_id", input.adminUserId)
    .is("read_at", null);
  if (ids.length > 0) q = q.in("id", ids);
  if (input.workRef) q = q.eq("work_ref_table", input.workRef.table).eq("work_ref_id", input.workRef.id);
  const { data, error } = await q.select("id");
  if (error) return { ok: false, error: error.message };
  return { ok: true, updated: (data ?? []).length };
}
