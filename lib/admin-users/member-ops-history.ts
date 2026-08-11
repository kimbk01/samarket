/**
 * Member Control Center — operations history from existing audit sources.
 * DO NOT invent a new audit system or infer missing before/after.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { isMissingRelation } from "@/lib/admin-users/member-tab-query";

export type MemberOpsHistorySource = "user_moderation_events" | "audit_logs" | "trust_events";

export type MemberOpsHistoryItem = {
  id: string;
  source: MemberOpsHistorySource;
  action: string;
  actorId: string | null;
  targetId: string;
  reason: string | null;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
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
  };
};

function str(row: Record<string, unknown>, key: string): string {
  return String(row[key] ?? "").trim();
}

function asJson(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

export async function loadMemberOpsHistory(
  sb: SupabaseClient,
  userId: string,
  opts: { page: number; pageSize: number; cursor: string | null },
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

  if (cursor) {
    moderationQ = moderationQ.lt("created_at", cursor);
    auditQ = auditQ.lt("created_at", cursor);
    trustQ = trustQ.lt("occurred_at", cursor);
  }

  const [moderationRes, auditRes, trustRes] = await Promise.all([moderationQ, auditQ, trustQ]);

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
  };

  const items: MemberOpsHistoryItem[] = [];

  if (!moderationRes.error) {
    for (const raw of (moderationRes.data ?? []) as Record<string, unknown>[]) {
      items.push({
        id: `moderation:${str(raw, "id")}`,
        source: "user_moderation_events",
        action: str(raw, "action"),
        actorId: str(raw, "actor_id") || null,
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
      items.push({
        id: `audit:${str(raw, "id")}`,
        source: "audit_logs",
        action: str(raw, "action"),
        actorId: str(raw, "actor_id") || null,
        targetId: str(raw, "target_id") || uid,
        reason: null,
        before: asJson(raw.before_json),
        after: asJson(raw.after_json),
        createdAt: str(raw, "created_at"),
      });
    }
  }

  if (!trustRes.error) {
    for (const raw of (trustRes.data ?? []) as Record<string, unknown>[]) {
      items.push({
        id: `trust:${str(raw, "id")}`,
        source: "trust_events",
        action: str(raw, "event_type") || str(raw, "source_type"),
        actorId: null,
        targetId: str(raw, "member_id") || uid,
        reason: str(raw, "source_type") || null,
        before: null,
        after: str(raw, "direction") ? { direction: str(raw, "direction") } : null,
        createdAt: str(raw, "occurred_at"),
      });
    }
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
