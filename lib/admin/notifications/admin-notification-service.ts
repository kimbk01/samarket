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
  ADMIN_RECIPIENT_NOTIFICATION_TYPES,
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
import {
  preferencesFromAdminOpsStorageRow,
  resolveAdminOpsSoundFromPreferences,
} from "@/lib/admin/admin-ops-sound-preference-gate";
import type { AdminNotificationPreferenceStorageRow } from "@/lib/notifications/policy/notification-preference-storage-normalizer";
import { withPushSoundMode, type PushSoundMode } from "@/lib/push/dispatch/push-sound-mode";
import {
  supportCustomerMessageNeedsAdmin,
  supportMessageIdFromDedupeKey,
} from "@/lib/support/support-admin-work-check";

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
  /** Never notify these admins (e.g. the actor themself — 고객 문의 재감사 D10). */
  excludeRecipientIds?: readonly string[];
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

/**
 * D-Q7 (Owner 2026-10-28): critical 업무는 필수(기본 알림음). 그 밖의 관리자 업무 푸시는 관리자 전용 설정
 * (`admin_notification_preferences.sound_enabled` — 관리자 운영 알림음)을 따른다. 읽기 실패 시 기본 알림음.
 */
async function adminWorkPushSoundMode(sb: SupabaseClient, row: AdminNotificationRow): Promise<PushSoundMode | null> {
  if (row.severity === "critical") return null;
  try {
    const { data, error } = await sb
      .from("admin_notification_preferences")
      .select("sound_enabled")
      .eq("user_id", row.recipient_admin_id)
      .maybeSingle();
    if (error) return null;
    const soundOn = resolveAdminOpsSoundFromPreferences(
      preferencesFromAdminOpsStorageRow(data as AdminNotificationPreferenceStorageRow | null)
    );
    return soundOn ? null : "silent";
  } catch {
    return null;
  }
}

/** Default push sender — badge = Member App Icon total (admin rows never change it). */
async function defaultSendPush(row: AdminNotificationRow, sb: SupabaseClient) {
  const domain = await fetchDomainBadgeAuthorityPayload(sb, row.recipient_admin_id, { force: true });
  const memberAppIconTotal = resolveMemberAppIconTotalForNativeFcm({
    memberAppIconWebTotal: domain.memberAppIconWebTotal,
    appIconTotal: domain.projection?.appIconTotal,
  });
  const soundMode = await adminWorkPushSoundMode(sb, row);
  const result = await dispatchPushForUser(
    withPushSoundMode({
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
    }, soundMode),
    // SRV-10 — admin rows live in admin_notifications, never notification_events: no event id is passed
    // (an `admin:` id failed the uuid event lookup and every admin push was skipped).
    // At-most-once is owned by admin_notification_push_deliveries (PK notification_id + claim).
    {
      event_type: row.kind,
      badge_count: memberAppIconTotal,
      target_type: "admin_notification",
      target_id: row.id,
      // B-18 (Owner D-Q7 2026-10-28): 관리자 업무 푸시는 그 관리자의 개인 회원 알림 설정(주문·공지 토글,
      // 방해금지)과 분리한다. 수신 대상·권한 재확인은 위 발송 원장 경로가 그대로 맡는다.
      skip_settings_gate: true,
    }
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

/** 권한 조회 동시 실행 묶음 크기 (L8 — DB 연결을 한꺼번에 많이 쓰지 않게) */
const AUTHORITY_LOOKUP_CHUNK = 10;

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

  const excluded = new Set((input.excludeRecipientIds ?? []).map((s) => String(s).trim()).filter(Boolean));
  if (excluded.size > 0) candidates = candidates.filter((uid) => !excluded.has(uid));

  const gatePermission = input.broadcastPermission ?? requiredPermission;
  const recipients: string[] = [];
  let authorityErrors = 0;
  // 고객 문의 최종 감사 L8: 후보 권한 조회(후보당 3건)를 차례로 하지 않고 10명씩 동시에 — 순서는 후보 순서 그대로.
  for (let i = 0; i < candidates.length; i += AUTHORITY_LOOKUP_CHUNK) {
    const chunk = candidates.slice(i, i + AUTHORITY_LOOKUP_CHUNK);
    const results = await Promise.all(
      chunk.map((uid) =>
        resolveAuthority(sb, uid).then(
          (authority) => ({ uid, authority }) as const,
          // Transient lookup failure ≠ revoked: retry the whole event rather than drop the recipient.
          () => ({ uid, authority: null }) as const
        )
      )
    );
    for (const r of results) {
      if (!r.authority) {
        authorityErrors += 1;
        continue;
      }
      if (authorityAllows(r.authority, gatePermission)) recipients.push(r.uid);
    }
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

/**
 * 고객 문의 남은 위험 — 고객 글 알림(support_customer_replied)을 보내기 직전 문의 상태 확인.
 * send = 어드민 일이 남음(OPEN·WAITING_ADMIN) · skip = 끝남(답변·종료·없음) · retry = 상태를 못 읽음(다음 회차에 다시).
 * 다른 종류 알림은 항상 send.
 */
async function supportCustomerMessageGate(
  sb: SupabaseClient,
  input: CreateAdminNotificationInput
): Promise<"send" | "skip" | "retry"> {
  if (input.kind !== "support_customer_replied") return "send";
  const caseId = input.workRef?.table === "support_cases" ? input.workRef.id : "";
  if (!caseId) return "send";
  // 6차 재감사 2: 상태 + 「이 글이 이미 답을 받았나」 — 앱 즉시 발송과 같은 판정
  return supportCustomerMessageNeedsAdmin(sb, { caseId, messageId: supportMessageIdFromDedupeKey(input.dedupeKey) });
}

/**
 * 6차 재감사 3 — 만든 직후 다시 판정해 그사이 어드민이 답했으면 **그 글의 알림만** 받은 사람 전원 읽음.
 * (문의 단위 전체 읽음이 아니라 같은 dedupe 키만 — 더 새 고객 글 알림은 건드리지 않는다.)
 */
export async function settleSupportCustomerMessageNotification(
  sb: SupabaseClient,
  input: { caseId: string; dedupeKey: string }
): Promise<void> {
  const verdict = await supportCustomerMessageNeedsAdmin(sb, {
    caseId: input.caseId,
    messageId: supportMessageIdFromDedupeKey(input.dedupeKey),
  });
  if (verdict !== "skip") return;
  const { error } = await sb
    .from(ADMIN_NOTIFICATIONS_TABLE)
    .update({ read_at: new Date().toISOString() })
    .eq("dedupe_key", input.dedupeKey)
    .is("read_at", null);
  if (error) console.warn("[admin-notifications] settle_support_failed", { dedupeKey: input.dedupeKey, error: error.message });
}

/**
 * 고객 문의 남은 위험 ⑤ — 재생 발송에서 담당자가 받을 수 없을 때(권한 잃음) 그 담당을 푼다(진행 중 문의만 —
 * `releaseSupportAssignmentsOnRevoke` 와 같은 규칙: 종료·보관 문의의 담당 기록은 그대로).
 */
async function releaseUnreachableSupportAssignees(
  sb: SupabaseClient,
  input: CreateAdminNotificationInput,
  staleAssignees: readonly string[]
): Promise<void> {
  const caseId = input.workRef?.table === "support_cases" ? input.workRef.id : "";
  if (!caseId) return;
  for (const uid of staleAssignees) {
    const { data: released } = await sb
      .from("support_cases")
      .update({ assigned_admin_id: null, updated_at: new Date().toISOString() })
      .eq("id", caseId)
      .eq("assigned_admin_id", uid)
      .not("status", "in", "(RESOLVED,ARCHIVED)")
      .select("id");
    if (released && released.length > 0) {
      await sb.from("support_case_events").insert({
        case_id: caseId,
        event_type: "assignee_released_admin_revoked",
        actor_user_id: null,
        payload: { previous_assignee: uid, trigger: "outbox_replay" },
      });
    }
  }
}

export type OutboxRow = { id: string; claim_token: string; source_key: string; payload: unknown };
export type PushDeliveryRow = { notification_id: string; claim_token: string };

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
    excludeRecipientIds: Array.isArray(p.excludeRecipientIds) ? p.excludeRecipientIds.map(String) : undefined,
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
/**
 * 2026-11-19 예약 작업 3번 — `admin_notification_cron_tick` 이 미리 부른 결과(원본 재생 · 대기열 확보 · 비었으면 푸시 확보).
 * 값의 뜻은 각 RPC 를 따로 불렀을 때와 같다. push=null 이면 「아직 확보 안 함」 → 대기열 처리 뒤 지금처럼 따로 확보.
 */
export type AdminNotificationCronPrefetch = {
  replayed: number | null;
  replayError: string | null;
  outbox: OutboxRow[];
  outboxError: string | null;
  push: PushDeliveryRow[] | null;
  pushError: string | null;
};

export async function runAdminNotificationDeliveryWorker(
  sb: SupabaseClient,
  deps: AdminNotificationDeps = {},
  opts: { lookbackHours?: number; batch?: number; prefetched?: AdminNotificationCronPrefetch | null } = {}
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

  const pre = opts.prefetched ?? null;
  const replay = pre
    ? { data: pre.replayed, error: pre.replayError ? { message: pre.replayError } : null }
    : await sb.rpc("admin_notification_replay_support_replies", {
        p_lookback: `${Math.min(Math.max(opts.lookbackHours ?? 72, 1), 24 * 14)} hours`,
        p_limit: 200,
      });
  if (replay.error) sum.errors.push(`replay:${replay.error.message}`);
  else sum.replayed = Number(replay.data) || 0;

  const claimed = pre
    ? { data: pre.outbox, error: pre.outboxError ? { message: pre.outboxError } : null }
    : await sb.rpc("admin_notification_outbox_claim", { p_limit: batch });
  if (claimed.error) sum.errors.push(`outbox_claim:${claimed.error.message}`);
  for (const row of (claimed.data ?? []) as OutboxRow[]) {
    sum.outboxClaimed += 1;
    const input = parseOutboxPayload(row.payload);
    let res: CreateAdminNotificationResult;
    // 고객 문의 남은 위험 (5차 재감사 2·4): 고객 글 알림은 보내기 직전에 문의 상태를 본다 —
    // 어드민 일이 끝났으면(답변·종료) 만들지 않고 처리됨으로 닫는다. 상태를 못 읽으면 실패로 두어 다음 회차에 다시(놓치지 않음).
    const supportGate = input ? await supportCustomerMessageGate(sb, input) : "send";
    if (!input) {
      res = { ok: false, error: "invalid_payload", queued: true };
    } else if (supportGate === "retry") {
      res = { ok: false, error: "support_case_status_unavailable", queued: true };
    } else if (supportGate === "skip") {
      res = { ok: true, created: 0, skippedRecipients: 0, pushed: 0 };
    } else {
      res = await createAdminNotification(sb, input, { resolveAuthority, sendPush }, { fromOutbox: true });
    }
    // 고객 문의 남은 위험 ⑤: 담당자에게 보낸 고객 글 알림을 담당자가 받을 수 없으면(권한 잃음) 담당을 풀고 support 권한 전원에게 —
    // 앱 즉시 경로(notifyAdminsOfCustomerMessage)와 같은 대체. 같은 dedupe 키라 중복 없음. (상태는 위에서 이미 확인)
    // 최종 감사 L5: 담당자 = 글쓴이(어드민이 회원으로 문의하고 본인이 담당)면 제외 규칙에 걸려 아무도 못 받는다 → 같은 대체(전원).
    const assigneesAllExcluded =
      (input?.recipientAdminIds?.length ?? 0) > 0 &&
      (input?.recipientAdminIds ?? []).every((id) => (input?.excludeRecipientIds ?? []).includes(id));
    if (
      input &&
      supportGate === "send" &&
      res.ok &&
      res.created === 0 &&
      (res.skippedRecipients > 0 || assigneesAllExcluded) &&
      input.kind === "support_customer_replied" &&
      (input.recipientAdminIds?.length ?? 0) > 0
    ) {
      // 담당자가 권한을 잃은 경우에만 담당을 푼다(글쓴이 본인 담당은 그대로 — 받을 사람만 넓힌다).
      if (res.skippedRecipients > 0) await releaseUnreachableSupportAssignees(sb, input, input.recipientAdminIds ?? []);
      res = await createAdminNotification(
        sb,
        { ...input, recipientAdminIds: undefined, broadcastPermission: "support", requiredPermission: "support" },
        { resolveAuthority, sendPush },
        { fromOutbox: true }
      );
    }
    if (
      input &&
      input.kind === "support_customer_replied" && // 7차 재감사 N1: 고객 글 알림만 (담당 지정 알림은 정리하지 않는다)
      supportGate === "send" &&
      res.ok &&
      res.created > 0 &&
      input.workRef?.table === "support_cases"
    ) {
      // 6차 재감사 3: 만든 사이 어드민이 답했으면 이 글 알림만 읽음
      await settleSupportCustomerMessageNotification(sb, { caseId: input.workRef.id, dedupeKey: input.dedupeKey });
    }
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

  const pushClaimed =
    pre && pre.push !== null
      ? { data: pre.push, error: pre.pushError ? { message: pre.pushError } : null }
      : await sb.rpc("admin_notification_push_claim", { p_limit: batch });
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

/** 고객 문의 최종 감사 L9: 처리 끝난(delivered) 고객센터 발송 대기열 행 보관 기간 */
export const SUPPORT_OUTBOX_DELIVERED_RETENTION_DAYS = 30;
/** 한 번에 지우는 최대 행 수 */
export const SUPPORT_OUTBOX_PURGE_LIMIT = 1000;
const SUPPORT_OUTBOX_PURGE_DELETE_CHUNK = 200;

/**
 * 고객 문의 최종 감사 L9 — 고객센터 종류(`support%`)의 **처리됨** 대기열 행 중 30일 지난 것만 지운다(실패·대기 행은 그대로).
 * 재생 함수의 「이미 있음」 확인은 최대 14일(`p_lookback` 상한)만 보므로 30일 지난 행을 지워도 다시 보내지 않는다.
 * 돌려준 값 = 지운 행 수, 실패 = 오류 문자열(크론 요약에 남김).
 */
export async function purgeDeliveredSupportOutbox(
  sb: SupabaseClient,
  opts: { now?: Date; limit?: number } = {}
): Promise<{ ok: true; deleted: number } | { ok: false; error: string }> {
  const cutoff = new Date(
    (opts.now ?? new Date()).getTime() - SUPPORT_OUTBOX_DELIVERED_RETENTION_DAYS * 86_400_000
  ).toISOString();
  const limit = Math.min(Math.max(opts.limit ?? SUPPORT_OUTBOX_PURGE_LIMIT, 1), SUPPORT_OUTBOX_PURGE_LIMIT);
  const { data, error } = await sb
    .from("admin_notification_outbox")
    .select("id")
    .like("kind", "support%")
    .eq("status", "delivered")
    .lt("delivered_at", cutoff)
    .order("delivered_at", { ascending: true })
    .limit(limit);
  if (error) return { ok: false, error: error.message };
  const ids = ((data ?? []) as { id?: unknown }[]).map((r) => String(r.id ?? "")).filter(Boolean);
  let deleted = 0;
  for (let i = 0; i < ids.length; i += SUPPORT_OUTBOX_PURGE_DELETE_CHUNK) {
    const chunk = ids.slice(i, i + SUPPORT_OUTBOX_PURGE_DELETE_CHUNK);
    const { error: delErr } = await sb
      .from("admin_notification_outbox")
      .delete()
      .in("id", chunk)
      // 고른 뒤 상태가 바뀐 행은 지우지 않는다
      .eq("status", "delivered")
      .like("kind", "support%");
    if (delErr) return { ok: false, error: delErr.message };
    deleted += chunk.length;
  }
  return { ok: true, deleted };
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
 * `authorityAllows` 를 DB 조건으로 — 권한 없는 알림(required_permission)은 쿼리에서 미리 뺀다.
 * super_admin = 전부 · 그 외 = 필요 권한 없음 또는 보유 권한(`users` 는 `users_edit_membership` 포함).
 * null = 조건 없음.
 */
function authorityPostgrestFilter(authority: Extract<AdminRecipientAuthority, { active: true }>): string | null {
  if (authority.isSuperAdmin) return null;
  const keys = new Set<string>(authority.permissions);
  if (keys.has("users")) keys.add("users_edit_membership");
  const list = [...keys].filter((k) => /^[a-z0-9_]+$/.test(k));
  return list.length ? `required_permission.is.null,required_permission.in.(${list.join(",")})` : "required_permission.is.null";
}

/**
 * Inbox page — R7 목록 표준 (offset 서버 페이지 + 정확한 전체 건수).
 * `listAdminNotifications`(커서 · 30건 「더 보기」)와 같은 범위(본인 · 미보관 · 보존 기간 · 권한 보유)를
 * DB 조건으로 걸어 `total` 이 실제 표시 건수와 같다. `unread` 도 같은 조건의 count exact.
 */
export async function listAdminNotificationsPage(
  sb: SupabaseClient,
  input: {
    adminUserId: string;
    authority: AdminRecipientAuthority;
    limit: number;
    offset: number;
    unreadOnly?: boolean;
  }
): Promise<
  { ok: true; items: AdminNotificationDto[]; total: number; unread: number } | { ok: false; error: string }
> {
  if (!input.authority.active) return { ok: false, error: "admin_only" };
  const perm = authorityPostgrestFilter(input.authority);
  const cutoff = retentionCutoffIso();
  let q = sb
    .from(ADMIN_NOTIFICATIONS_TABLE)
    .select(ROW_COLUMNS, { count: "exact" })
    .eq("recipient_admin_id", input.adminUserId)
    .is("archived_at", null)
    .gte("created_at", cutoff);
  if (perm) q = q.or(perm);
  if (input.unreadOnly) q = q.is("read_at", null);
  let u = sb
    .from(ADMIN_NOTIFICATIONS_TABLE)
    .select("id", { count: "exact", head: true })
    .eq("recipient_admin_id", input.adminUserId)
    .is("read_at", null)
    .is("archived_at", null)
    .gte("created_at", cutoff);
  if (perm) u = u.or(perm);
  const [list, unread] = await Promise.all([
    q
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .range(input.offset, input.offset + input.limit - 1),
    u,
  ]);
  if (list.error) return { ok: false, error: list.error.message };
  if (unread.error) return { ok: false, error: unread.error.message };
  const rows = (list.data ?? []) as AdminNotificationRow[];
  const items = await withSettlementWorkStatus(sb, rows.map(toAdminNotificationDto));
  return { ok: true, items, total: list.count ?? items.length, unread: unread.count ?? 0 };
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
const DEDUPE_KEY_CHUNK = 100;

export async function markAdminNotificationsRead(
  sb: SupabaseClient,
  input: {
    adminUserId: string;
    ids?: string[];
    all?: boolean;
    workRef?: { table: string; id: string };
    /** 이 dedupe 키들만 (예: 화면에 보여 준 고객 글 알림 — 고객 문의 남은 위험 5) */
    dedupeKeys?: readonly string[];
    /** 이 종류만 */
    kinds?: readonly string[];
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
  if (input.dedupeKeys) {
    if (input.dedupeKeys.length === 0) return { ok: true, updated: 0 };
    // 6차 재감사 5: 요청 주소 길이 — 100개씩 나눠 읽음 처리
    if (input.dedupeKeys.length > DEDUPE_KEY_CHUNK) {
      let total = 0;
      for (let i = 0; i < input.dedupeKeys.length; i += DEDUPE_KEY_CHUNK) {
        const part = await markAdminNotificationsRead(sb, {
          ...input,
          dedupeKeys: input.dedupeKeys.slice(i, i + DEDUPE_KEY_CHUNK),
        });
        if (!part.ok) return part;
        total += part.updated;
      }
      return { ok: true, updated: total };
    }
    q = q.in("dedupe_key", [...input.dedupeKeys]);
  }
  if (input.kinds) {
    // 6차 재감사 6: 빈 목록 = 아무것도(dedupeKeys 와 같은 뜻)
    if (input.kinds.length === 0) return { ok: true, updated: 0 };
    q = q.in("kind", [...input.kinds]);
  }
  const { data, error } = await q.select("id");
  if (error) return { ok: false, error: error.message };
  return { ok: true, updated: (data ?? []).length };
}

/**
 * The work behind these notifications is finished (approved / rejected / re-verified / decided) →
 * mark them read for EVERY recipient (broadcast kinds go to all `business` admins).
 * Only read_at changes. Failure is logged, never thrown — the business decision already committed.
 * 감사 2026-11-24 S2: 처리 끝난 입점·재검증·수수료 알림이 미읽음으로 계속 남았다 (운영 11-03 부터 3건).
 */
export async function resolveAdminNotificationsForWork(
  sb: SupabaseClient,
  input: {
    workRef: { table: string; id: string };
    kinds: readonly (typeof ADMIN_RECIPIENT_NOTIFICATION_TYPES)[number][];
    /**
     * 고객 문의 최종 감사 D1: 주면 이 dedupe 키들만(받은 어드민 전원) — 예: 답변한 어드민이 화면에서 본 고객 글 알림만.
     * 빈 목록 = 아무것도. 100개씩 나눠 보낸다(요청 주소 길이).
     */
    dedupeKeys?: readonly string[];
  }
): Promise<number> {
  const table = input.workRef.table.trim();
  const id = input.workRef.id.trim();
  if (!table || !id || input.kinds.length === 0) return 0;
  if (input.dedupeKeys && input.dedupeKeys.length === 0) return 0;
  const run = async (keys: readonly string[] | null): Promise<number> => {
    try {
      let q = sb
        .from(ADMIN_NOTIFICATIONS_TABLE)
        .update({ read_at: new Date().toISOString() })
        .eq("work_ref_table", table)
        .eq("work_ref_id", id)
        .in("kind", [...input.kinds])
        .is("read_at", null);
      if (keys) q = q.in("dedupe_key", [...keys]);
      const { data, error } = await q.select("id");
      if (error) {
        console.error("[admin-notifications] resolve_for_work_failed", { table, id, error: error.message });
        return 0;
      }
      return (data ?? []).length;
    } catch (err) {
      console.error("[admin-notifications] resolve_for_work_failed", { table, id, err });
      return 0;
    }
  };
  if (!input.dedupeKeys) return run(null);
  let total = 0;
  for (let i = 0; i < input.dedupeKeys.length; i += DEDUPE_KEY_CHUNK) {
    total += await run(input.dedupeKeys.slice(i, i + DEDUPE_KEY_CHUNK));
  }
  return total;
}
