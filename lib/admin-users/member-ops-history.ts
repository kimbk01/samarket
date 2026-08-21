/**
 * Member Control Center — operations history from existing audit sources.
 * DO NOT invent a new audit system or infer missing before/after.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { isMissingRelation } from "@/lib/admin-users/member-tab-query";

export type MemberOpsHistorySource =
  | "user_moderation_events"
  | "audit_logs"
  | "trust_events"
  | "account_deletion_requests";

export type MemberOpsHistoryItem = {
  id: string;
  source: MemberOpsHistorySource;
  /** 기계용 액션 키 (예: user_purge, promote_to_admin) */
  action: string;
  /** 화면용 짧은 설명 */
  actionLabel: string;
  actorId: string | null;
  /** profiles.username 또는 이메일 로컬파트 — 없으면 null */
  actorLoginId: string | null;
  actorDisplayName: string | null;
  targetId: string;
  reason: string | null;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  /** ISO-8601 (DB 원본) */
  createdAt: string;
};

export type MemberOpsHistoryPayload = {
  page: number;
  pageSize: number;
  items: MemberOpsHistoryItem[];
  nextCursor: string | null;
  sources: {
    moderation: { ok: true } | { ok: false; error: string };
    audit: { ok: true } | { ok: false; error: string };
    trust: { ok: true } | { ok: false; error: string };
    deletionRequests: { ok: true } | { ok: false; error: string };
  };
};

function str(row: Record<string, unknown>, key: string): string {
  return String(row[key] ?? "").trim();
}

function asJson(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

const ACTION_LABEL_KO: Record<string, string> = {
  soft_delete: "탈퇴 처리(익명화)",
  purge: "영구 삭제",
  user_withdraw: "탈퇴 처리(익명화)",
  user_purge: "영구 삭제",
  "my.account.leave_request": "회원 삭제 요청",
  "admin.account_deletion.reject": "삭제 요청 거절",
  promote_to_admin: "관리자 권한 부여",
  create_admin: "관리자 계정 생성",
  warn: "경고",
  suspend: "정지",
  ban: "차단",
  restore: "복구",
  deletion_request_open: "삭제 요청(대기)",
  deletion_request_processing: "삭제 요청(처리중)",
  deletion_request_completed: "삭제 요청(완료)",
  deletion_request_rejected: "삭제 요청(거절)",
  deletion_request_cancelled: "삭제 요청(취소)",
};

function labelForAction(action: string, source: MemberOpsHistorySource): string {
  if (ACTION_LABEL_KO[action]) return ACTION_LABEL_KO[action];
  if (source === "account_deletion_requests") {
    return `삭제 요청 · ${action}`;
  }
  return action;
}

function reasonFromAudit(after: Record<string, unknown> | null, before: Record<string, unknown> | null): string | null {
  const candidates = [after?.reason, after?.adminNote, after?.admin_note, before?.reason];
  for (const c of candidates) {
    if (typeof c === "string" && c.trim()) return c.trim();
  }
  return null;
}

type ActorProfile = { loginId: string | null; displayName: string | null };

async function loadActorProfiles(
  sb: SupabaseClient,
  actorIds: string[]
): Promise<Map<string, ActorProfile>> {
  const out = new Map<string, ActorProfile>();
  const ids = [...new Set(actorIds.map((id) => id.trim()).filter(Boolean))];
  if (ids.length === 0) return out;

  const { data, error } = await sb
    .from("profiles")
    .select("id, username, email, nickname, display_name")
    .in("id", ids);
  if (error || !data) return out;

  for (const raw of data as Array<Record<string, unknown>>) {
    const id = str(raw, "id");
    if (!id) continue;
    const username = str(raw, "username");
    const email = str(raw, "email");
    const loginId = username || (email.includes("@") ? email.split("@")[0] : email) || null;
    const displayName = str(raw, "nickname") || str(raw, "display_name") || loginId;
    out.set(id, { loginId, displayName: displayName || null });
  }
  return out;
}

export async function loadMemberOpsHistory(
  sb: SupabaseClient,
  userId: string,
  opts: { page: number; pageSize: number; cursor: string | null }
): Promise<MemberOpsHistoryPayload> {
  const uid = userId.trim();
  const pageSize = opts.pageSize;
  const cursor = opts.cursor?.trim() || null;
  const take = pageSize + 1;

  let moderationQ = sb
    .from("user_moderation_events")
    .select("id, user_id, actor_id, action, from_status, to_status, reason, created_at")
    .eq("user_id", uid)
    .order("created_at", { ascending: false })
    .limit(take);
  let auditQ = sb
    .from("audit_logs")
    .select("id, actor_id, target_type, target_id, action, before_json, after_json, created_at")
    .eq("target_id", uid)
    .order("created_at", { ascending: false })
    .limit(take);
  let trustQ = sb
    .from("trust_events")
    .select("id, member_id, event_type, source_type, direction, occurred_at")
    .eq("member_id", uid)
    .order("occurred_at", { ascending: false })
    .limit(take);
  let deletionQ = sb
    .from("account_deletion_requests")
    .select("id, user_id, status, reason, requested_at, processed_at, processed_by, admin_note")
    .eq("user_id", uid)
    .order("requested_at", { ascending: false })
    .limit(take);

  if (cursor) {
    moderationQ = moderationQ.lt("created_at", cursor);
    auditQ = auditQ.lt("created_at", cursor);
    trustQ = trustQ.lt("occurred_at", cursor);
    deletionQ = deletionQ.lt("requested_at", cursor);
  }

  const [moderationRes, auditRes, trustRes, deletionRes] = await Promise.all([
    moderationQ,
    auditQ,
    trustQ,
    deletionQ,
  ]);

  const sources: MemberOpsHistoryPayload["sources"] = {
    moderation: moderationRes.error
      ? isMissingRelation(moderationRes.error.message, "user_moderation_events")
        ? { ok: true }
        : { ok: false, error: moderationRes.error.message }
      : { ok: true },
    audit: auditRes.error
      ? isMissingRelation(auditRes.error.message, "audit_logs")
        ? { ok: true }
        : { ok: false, error: auditRes.error.message }
      : { ok: true },
    trust: trustRes.error
      ? isMissingRelation(trustRes.error.message, "trust_events")
        ? { ok: true }
        : { ok: false, error: trustRes.error.message }
      : { ok: true },
    deletionRequests: deletionRes.error
      ? isMissingRelation(deletionRes.error.message, "account_deletion_requests")
        ? { ok: true }
        : { ok: false, error: deletionRes.error.message }
      : { ok: true },
  };

  const items: MemberOpsHistoryItem[] = [];

  if (!moderationRes.error) {
    for (const raw of (moderationRes.data ?? []) as Record<string, unknown>[]) {
      const action = str(raw, "action");
      items.push({
        id: `moderation:${str(raw, "id")}`,
        source: "user_moderation_events",
        action,
        actionLabel: labelForAction(action, "user_moderation_events"),
        actorId: str(raw, "actor_id") || null,
        actorLoginId: null,
        actorDisplayName: null,
        targetId: str(raw, "user_id") || uid,
        reason: str(raw, "reason") || null,
        before: str(raw, "from_status") ? { status: str(raw, "from_status") } : null,
        after: str(raw, "to_status") ? { status: str(raw, "to_status") } : null,
        createdAt: str(raw, "created_at"),
      });
    }
  }

  if (!auditRes.error) {
    for (const raw of (auditRes.data ?? []) as Record<string, unknown>[]) {
      const action = str(raw, "action");
      const before = asJson(raw.before_json);
      const after = asJson(raw.after_json);
      items.push({
        id: `audit:${str(raw, "id")}`,
        source: "audit_logs",
        action,
        actionLabel: labelForAction(action, "audit_logs"),
        actorId: str(raw, "actor_id") || null,
        actorLoginId: null,
        actorDisplayName: null,
        targetId: str(raw, "target_id") || uid,
        reason: reasonFromAudit(after, before),
        before,
        after,
        createdAt: str(raw, "created_at"),
      });
    }
  }

  if (!trustRes.error) {
    for (const raw of (trustRes.data ?? []) as Record<string, unknown>[]) {
      const action = str(raw, "event_type") || str(raw, "source_type");
      items.push({
        id: `trust:${str(raw, "id")}`,
        source: "trust_events",
        action,
        actionLabel: labelForAction(action, "trust_events"),
        actorId: null,
        actorLoginId: null,
        actorDisplayName: null,
        targetId: str(raw, "member_id") || uid,
        reason: str(raw, "source_type") || null,
        before: null,
        after: str(raw, "direction") ? { direction: str(raw, "direction") } : null,
        createdAt: str(raw, "occurred_at"),
      });
    }
  }

  if (!deletionRes.error) {
    for (const raw of (deletionRes.data ?? []) as Record<string, unknown>[]) {
      const status = str(raw, "status") || "requested";
      const action = `deletion_request_${status}`;
      const processedAt = str(raw, "processed_at");
      const requestedAt = str(raw, "requested_at");
      items.push({
        id: `deletion:${str(raw, "id")}`,
        source: "account_deletion_requests",
        action,
        actionLabel: labelForAction(action, "account_deletion_requests"),
        actorId: str(raw, "processed_by") || null,
        actorLoginId: null,
        actorDisplayName: null,
        targetId: str(raw, "user_id") || uid,
        reason: str(raw, "admin_note") || str(raw, "reason") || null,
        before: { status: "requested", requestedAt },
        after: {
          status,
          processedAt: processedAt || null,
          reason: str(raw, "reason") || null,
          adminNote: str(raw, "admin_note") || null,
        },
        createdAt: processedAt || requestedAt,
      });
    }
  }

  const actorMap = await loadActorProfiles(
    sb,
    items.map((item) => item.actorId ?? "").filter(Boolean)
  );
  for (const item of items) {
    if (!item.actorId) continue;
    const profile = actorMap.get(item.actorId);
    if (!profile) continue;
    item.actorLoginId = profile.loginId;
    item.actorDisplayName = profile.displayName;
  }

  items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const pageItems = items.slice(0, pageSize);
  const nextCursor = items.length > pageSize ? pageItems[pageItems.length - 1]?.createdAt ?? null : null;

  return {
    page: opts.page,
    pageSize,
    items: pageItems,
    nextCursor,
    sources,
  };
}
