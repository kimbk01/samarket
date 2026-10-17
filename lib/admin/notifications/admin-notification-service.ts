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
  isSettlementAdminNotificationKind,
  settlementWorkStatusFromAdjustment,
  type AdminNotificationDto,
  type AdminNotificationSeverity,
} from "@/lib/admin/notifications/admin-notification-kinds";
import { dispatchPushForUser } from "@/lib/push/dispatch/dispatch-push-for-user";
import type { DispatchPushResult } from "@/lib/push/dispatch/push-payload-types";
import { fetchDomainBadgeAuthorityPayload } from "@/lib/notifications/pipeline/notify-badge-service";
import { resolveMemberAppIconTotalForNativeFcm } from "@/lib/notifications/badge-authority-rebuild/native-fcm-member-app-icon-authority";
import { getSiteOrigin } from "@/lib/env/runtime";

export const ADMIN_NOTIFICATIONS_TABLE = "admin_notifications";
export const ADMIN_NOTIFICATION_PUSH_DELIVERIES_TABLE = "admin_notification_push_deliveries";

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

export type CreateAdminNotificationResult =
  | { ok: true; created: number; skippedRecipients: number; pushed: number }
  | {
      ok: false;
      error: string;
      /** true → the event is durable in admin_notification_outbox and will be retried by the worker. */
      queued: boolean;
    };

function isMissingRelation(message: string | undefined, relation: string): boolean {
  const m = String(message ?? "");
  return new RegExp(relation, "i").test(m) && /does not exist|schema cache|could not find/i.test(m);
}

/** Durable fallback: record the EVENT so the worker can re-create it (idempotent per source key). */
async function enqueueOutbox(
  sb: SupabaseClient,
  input: CreateAdminNotificationInput,
  error: string
): Promise<boolean> {
  const { error: qErr } = await sb.rpc("admin_notification_outbox_enqueue", {
    p_source_key: input.dedupeKey,
    p_kind: input.kind,
    p_payload: input as unknown as Record<string, unknown>,
    p_error: error.slice(0, 1000),
  });
  if (qErr) {
    // Last line of defence: source replay (e.g. support_messages) re-derives the event.
    console.error("[admin-notification] outbox_enqueue_failed", { dedupeKey: input.dedupeKey, error: qErr.message });
    return false;
  }
  return true;
}

type PushResult = "sent" | "retryable" | "permanent" | "skipped_revoked" | "skipped_permission" | "skipped_disabled";

function outcomeToResult(outcome: string | undefined): PushResult {
  if (outcome === "sent") return "sent";
  if (outcome === "noop") return "skipped_disabled";
  if (outcome === "retryable") return "retryable";
  return "permanent";
}

/** One push attempt for a claimed delivery: authority re-verified immediately before sending. */
async function attemptPush(
  sb: SupabaseClient,
  row: AdminNotificationRow,
  resolveAuthority: NonNullable<AdminNotificationDeps["resolveAuthority"]>,
  sendPush: NonNullable<AdminNotificationDeps["sendPush"]>
): Promise<{ result: PushResult; error: string | null }> {
  const authority = await resolveAuthority(sb, row.recipient_admin_id).catch(() => ({ active: false }) as const);
  if (!authority.active) return { result: "skipped_revoked", error: null };
  if (!authorityAllows(authority, row.required_permission as AdminPermissionKey | null)) {
    return { result: "skipped_permission", error: null };
  }
  try {
    const outcome = await sendPush(row, sb);
    return { result: outcomeToResult(outcome), error: outcome === "sent" ? null : `push_outcome:${outcome}` };
  } catch (e) {
    return { result: "retryable", error: (e as Error).message };
  }
}

/**
 * Inline first push for a freshly inserted notification. The delivery row is created already
 * claimed ('sending'); if the process dies mid-send the worker marks it unknown_outcome and does
 * NOT resend (at-most-once push; the inbox row is the guaranteed delivery).
 */
async function pushNewNotification(
  sb: SupabaseClient,
  row: AdminNotificationRow,
  resolveAuthority: NonNullable<AdminNotificationDeps["resolveAuthority"]>,
  sendPush: NonNullable<AdminNotificationDeps["sendPush"]>
): Promise<boolean> {
  const claimToken = crypto.randomUUID();
  const { error: dErr } = await sb.from(ADMIN_NOTIFICATION_PUSH_DELIVERIES_TABLE).insert({
    notification_id: row.id,
    recipient_admin_id: row.recipient_admin_id,
    status: "sending",
    attempts: 1,
    claim_token: claimToken,
    claimed_at: new Date().toISOString(),
  });

  const attempt = async () => attemptPush(sb, row, resolveAuthority, sendPush);

  if (dErr) {
    if (!isMissingRelation(dErr.message, ADMIN_NOTIFICATION_PUSH_DELIVERIES_TABLE)) {
      // Delivery bookkeeping unavailable → do not push blind (no way to prevent a duplicate later).
      console.error("[admin-notification] push_delivery_insert_failed", { id: row.id, error: dErr.message });
      return false;
    }
    // Pre-recovery schema (20270509 not applied): single attempt, status on the row.
    const { result } = await attempt();
    await sb
      .from(ADMIN_NOTIFICATIONS_TABLE)
      .update({
        push_status: result === "sent" ? "sent" : result.startsWith("skipped") ? result : "failed",
        push_attempted_at: new Date().toISOString(),
      })
      .eq("id", row.id);
    return result === "sent";
  }

  const { result, error } = await attempt();
  const { error: fErr } = await sb.rpc("admin_notification_push_finish", {
    p_notification_id: row.id,
    p_claim_token: claimToken,
    p_result: result,
    p_error: error,
  });
  if (fErr) console.error("[admin-notification] push_finish_failed", { id: row.id, error: fErr.message });
  return result === "sent";
}

/**
 * Create admin notifications (fan-out). Recipients are filtered by CURRENT authority;
 * duplicates (same recipient + dedupeKey) are skipped and never re-pushed.
 * A failed write is recorded in admin_notification_outbox (unless replaying from it).
 */
export async function createAdminNotification(
  sb: SupabaseClient,
  input: CreateAdminNotificationInput,
  deps: AdminNotificationDeps = {},
  opts: { fromOutbox?: boolean } = {}
): Promise<CreateAdminNotificationResult> {
  const resolveAuthority = deps.resolveAuthority ?? resolveAdminRecipientAuthority;
  const sendPush = deps.sendPush ?? defaultSendPush;
  const requiredPermission = input.requiredPermission ?? null;
  const fail = async (error: string): Promise<CreateAdminNotificationResult> => ({
    ok: false,
    error,
    queued: opts.fromOutbox ? true : await enqueueOutbox(sb, input, error),
  });

  let candidates: string[];
  try {
    candidates =
      input.recipientAdminIds && input.recipientAdminIds.length > 0
        ? [...new Set(input.recipientAdminIds.map((s) => s.trim()).filter(Boolean))]
        : input.broadcastPermission !== undefined
          ? await listActiveAdminUserIds(sb)
          : [];
  } catch (e) {
    return fail((e as Error).message);
  }

  const gatePermission = input.broadcastPermission ?? requiredPermission;
  const recipients: string[] = [];
  let authorityErrors = 0;
  for (const uid of candidates) {
    let authority: AdminRecipientAuthority;
    try {
      authority = await resolveAuthority(sb, uid);
    } catch {
      // Transient lookup failure ≠ revoked: retry the whole event rather than drop the recipient.
      authorityErrors += 1;
      continue;
    }
    if (authorityAllows(authority, gatePermission)) recipients.push(uid);
  }
  if (authorityErrors > 0) return fail("authority_lookup_failed");
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
  if (error) return fail(error.message);
  const inserted = (data ?? []) as AdminNotificationRow[];

  let pushed = 0;
  if (input.push) {
    for (const row of inserted) {
      if (await pushNewNotification(sb, row, resolveAuthority, sendPush)) pushed += 1;
    }
  }

  return { ok: true, created: inserted.length, skippedRecipients, pushed };
}

type OutboxRow = { id: string; claim_token: string; source_key: string; payload: unknown };
type PushDeliveryRow = { notification_id: string; claim_token: string };

function parseOutboxPayload(payload: unknown): CreateAdminNotificationInput | null {
  if (!payload || typeof payload !== "object") return null;
  const p = payload as Record<string, unknown>;
  if (typeof p.kind !== "string" || typeof p.title !== "string" || typeof p.dedupeKey !== "string") return null;
  const ids = Array.isArray(p.recipientAdminIds) ? p.recipientAdminIds.map(String) : undefined;
  if ((!ids || ids.length === 0) && p.broadcastPermission === undefined) return null;
  return {
    recipientAdminIds: ids,
    broadcastPermission: (p.broadcastPermission ?? undefined) as AdminPermissionKey | null | undefined,
    requiredPermission: (p.requiredPermission ?? null) as AdminPermissionKey | null,
    kind: p.kind,
    severity: (p.severity as AdminNotificationSeverity | undefined) ?? "info",
    title: p.title,
    body: typeof p.body === "string" ? p.body : null,
    linkUrl: typeof p.linkUrl === "string" ? p.linkUrl : null,
    workRef:
      p.workRef && typeof p.workRef === "object"
        ? { table: String((p.workRef as { table?: unknown }).table), id: String((p.workRef as { id?: unknown }).id) }
        : null,
    dedupeKey: p.dedupeKey,
    actorUserId: typeof p.actorUserId === "string" ? p.actorUserId : null,
    push: p.push === true,
  };
}

export type AdminNotificationDeliveryRunSummary = {
  replayed: number;
  outboxClaimed: number;
  outboxDelivered: number;
  outboxRetry: number;
  outboxDead: number;
  pushClaimed: number;
  pushSent: number;
  pushSkipped: number;
  pushRetry: number;
  pushDead: number;
  errors: string[];
};

/**
 * Delivery worker (cron, service role): source replay → outbox claim/replay → push retries.
 * Every step is idempotent and concurrency-safe (DB claims with SKIP LOCKED + claim-token CAS).
 */
export async function runAdminNotificationDeliveryWorker(
  sb: SupabaseClient,
  deps: AdminNotificationDeps = {},
  opts: { lookbackHours?: number; batch?: number } = {}
): Promise<AdminNotificationDeliveryRunSummary> {
  const resolveAuthority = deps.resolveAuthority ?? resolveAdminRecipientAuthority;
  const sendPush = deps.sendPush ?? defaultSendPush;
  const batch = Math.min(Math.max(opts.batch ?? 20, 1), 100);
  const sum: AdminNotificationDeliveryRunSummary = {
    replayed: 0,
    outboxClaimed: 0,
    outboxDelivered: 0,
    outboxRetry: 0,
    outboxDead: 0,
    pushClaimed: 0,
    pushSent: 0,
    pushSkipped: 0,
    pushRetry: 0,
    pushDead: 0,
    errors: [],
  };

  const replay = await sb.rpc("admin_notification_replay_support_replies", {
    p_lookback: `${Math.min(Math.max(opts.lookbackHours ?? 72, 1), 24 * 14)} hours`,
    p_limit: 200,
  });
  if (replay.error) sum.errors.push(`replay:${replay.error.message}`);
  else sum.replayed = Number(replay.data) || 0;

  const claimed = await sb.rpc("admin_notification_outbox_claim", { p_limit: batch });
  if (claimed.error) sum.errors.push(`outbox_claim:${claimed.error.message}`);
  for (const row of (claimed.data ?? []) as OutboxRow[]) {
    sum.outboxClaimed += 1;
    const input = parseOutboxPayload(row.payload);
    const res = input
      ? await createAdminNotification(sb, input, { resolveAuthority, sendPush }, { fromOutbox: true })
      : ({ ok: false, error: "invalid_payload", queued: true } as const);
    const fin = await sb.rpc("admin_notification_outbox_finish", {
      p_id: row.id,
      p_claim_token: row.claim_token,
      p_ok: res.ok,
      p_error: res.ok ? null : res.error,
    });
    const state = String(fin.data ?? "");
    if (fin.error) sum.errors.push(`outbox_finish:${fin.error.message}`);
    else if (state === "delivered") sum.outboxDelivered += 1;
    else if (state === "retry") sum.outboxRetry += 1;
    else if (state === "dead") sum.outboxDead += 1;
  }

  const pushClaimed = await sb.rpc("admin_notification_push_claim", { p_limit: batch });
  if (pushClaimed.error) sum.errors.push(`push_claim:${pushClaimed.error.message}`);
  for (const d of (pushClaimed.data ?? []) as PushDeliveryRow[]) {
    sum.pushClaimed += 1;
    const { data: nRow } = await sb
      .from(ADMIN_NOTIFICATIONS_TABLE)
      .select(ROW_COLUMNS)
      .eq("id", d.notification_id)
      .maybeSingle();
    const attempt = nRow
      ? await attemptPush(sb, nRow as AdminNotificationRow, resolveAuthority, sendPush)
      : { result: "permanent" as const, error: "notification_missing" };
    const fin = await sb.rpc("admin_notification_push_finish", {
      p_notification_id: d.notification_id,
      p_claim_token: d.claim_token,
      p_result: attempt.result,
      p_error: attempt.error,
    });
    const state = String(fin.data ?? "");
    if (fin.error) sum.errors.push(`push_finish:${fin.error.message}`);
    else if (state === "sent") sum.pushSent += 1;
    else if (state.startsWith("skipped")) sum.pushSkipped += 1;
    else if (state === "retry") sum.pushRetry += 1;
    else if (state === "dead") sum.pushDead += 1;
  }

  return sum;
}

export type AdminNotificationDeliveryHealth = {
  outboxDead: number;
  outboxPending: number;
  pushDead: number;
  pushUnknown: number;
};

/** Dead letters / backlog — shown to super admins (operational failure surface). */
export async function loadAdminNotificationDeliveryHealth(
  sb: SupabaseClient
): Promise<{ ok: true; health: AdminNotificationDeliveryHealth } | { ok: false; error: string }> {
  const { data, error } = await sb.rpc("admin_notification_delivery_health");
  if (error) return { ok: false, error: error.message };
  const h = (data ?? {}) as Record<string, unknown>;
  return {
    ok: true,
    health: {
      outboxDead: Number(h.outbox_dead) || 0,
      outboxPending: Number(h.outbox_pending) || 0,
      pushDead: Number(h.push_dead) || 0,
      pushUnknown: Number(h.push_unknown) || 0,
    },
  };
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
  const items = await withSettlementWorkStatus(sb, rows.slice(0, limit).map(toAdminNotificationDto));
  return { ok: true, items, unread: unread.unread, hasMore };
}

/**
 * Settlement alerts: attach the LIVE work state of the linked review (store_sale_fee_obligations
 * .adjustment_status) — the queue is the single source, so the alert can never show a stale state.
 * A decision therefore updates the alert's status without creating a new notification.
 * Financial exceptions have no automatic resolution → "확인 필요" until an admin acts on the source.
 */
export async function withSettlementWorkStatus(
  sb: SupabaseClient,
  items: AdminNotificationDto[]
): Promise<AdminNotificationDto[]> {
  const ids = [
    ...new Set(
      items
        .filter((n) => isSettlementAdminNotificationKind(n.kind) && n.workRefTable === "store_sale_fee_obligations" && n.workRefId)
        .map((n) => n.workRefId as string)
    ),
  ];
  const status = new Map<string, string>();
  if (ids.length) {
    const { data, error } = await sb.from("store_sale_fee_obligations").select("id, adjustment_status").in("id", ids);
    if (error) console.error("[admin-notification] settlement_work_status", error.message);
    for (const r of (data ?? []) as Array<{ id: string; adjustment_status: string | null }>) status.set(String(r.id), String(r.adjustment_status ?? ""));
  }
  return items.map((n) => {
    if (!isSettlementAdminNotificationKind(n.kind)) return n;
    if (n.kind === "settlement_commission_review" && n.workRefId) {
      return { ...n, workStatus: status.has(n.workRefId) ? settlementWorkStatusFromAdjustment(status.get(n.workRefId)) : null };
    }
    return { ...n, workStatus: { state: "attention", labelKo: "확인 필요", labelEn: "Needs attention" } };
  });
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
