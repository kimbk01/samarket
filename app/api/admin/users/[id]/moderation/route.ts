import { NextRequest, NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/admin/require-admin-permission";
import { appendAuditLog } from "@/lib/audit/append-audit-log";
import { insertModerationEvent, invalidateAllUserSessions } from "@/lib/admin/admin-user-server";
import { moderationActionToProfilePatch } from "@/lib/admin-users/moderation-status";
import { assertMemberModerationTargetAllowed } from "@/lib/admin-users/member-moderation-target";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ACTIONS = ["warn", "suspend", "ban", "restore"] as const;

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const gate = await requireAdminPermission("users");
  if (!gate.ok) return gate.response;

  const { id } = await context.params;
  const userId = id?.trim();
  if (!userId) {
    return NextResponse.json({ ok: false, error: "invalid_id" }, { status: 400 });
  }

  const { sb } = gate;
  const { data, error } = await sb
    .from("user_moderation_events")
    .select("id, user_id, actor_id, action, from_status, to_status, reason, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    if (error.message?.includes("user_moderation_events") && error.message.includes("does not exist")) {
      return NextResponse.json({ ok: true, events: [] });
    }
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, events: data ?? [] });
}

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const gate = await requireAdminPermission("users");
  if (!gate.ok) return gate.response;

  const { id } = await context.params;
  const userId = id?.trim();
  if (!userId) {
    return NextResponse.json({ ok: false, error: "invalid_id" }, { status: 400 });
  }

  let body: { action?: string; reason?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const action = String(body.action ?? "").trim().toLowerCase();
  const reason = String(body.reason ?? "").trim();
  if (!ACTIONS.includes(action as (typeof ACTIONS)[number])) {
    return NextResponse.json({ ok: false, error: "invalid_action" }, { status: 400 });
  }
  if (!reason) {
    return NextResponse.json({ ok: false, error: "reason_required" }, { status: 400 });
  }

  const { sb, actor } = gate;

  const { data: targetProfile, error: profileErr } = await sb
    .from("profiles")
    .select("id, status, deleted_at, nickname")
    .eq("id", userId)
    .maybeSingle();
  if (profileErr) {
    return NextResponse.json({ ok: false, error: profileErr.message }, { status: 500 });
  }
  if (!targetProfile) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }

  const targetGuard = await assertMemberModerationTargetAllowed(sb, {
    targetUserId: userId,
    actorIsSuperAdmin: actor.isSuperAdmin,
  });
  if (!targetGuard.ok) {
    return NextResponse.json({ ok: false, error: targetGuard.error }, { status: targetGuard.status });
  }

  const fromStatus = String((targetProfile as { status?: string }).status ?? "");
  const patch = moderationActionToProfilePatch(action as (typeof ACTIONS)[number]);
  const toStatus = patch?.status ? String(patch.status) : fromStatus;

  if (patch) {
    const { error: updateErr } = await sb.from("profiles").update(patch).eq("id", userId);
    if (updateErr) {
      return NextResponse.json({ ok: false, error: updateErr.message }, { status: 500 });
    }
  }

  const logId = await insertModerationEvent(sb, {
    userId,
    actorId: actor.userId,
    action: action as "warn" | "suspend" | "ban" | "restore",
    fromStatus,
    toStatus,
    reason,
  });

  if (action === "suspend" || action === "ban") {
    await invalidateAllUserSessions(sb, userId, `moderation_${action}`);
    if (action === "ban") {
      try {
        await sb.auth.admin.updateUserById(userId, { ban_duration: "876000h" } as never);
      } catch {
        /* auth ban best-effort */
      }
    }
  }

  if (action === "restore") {
    try {
      await sb.auth.admin.updateUserById(userId, { ban_duration: "none" } as never);
    } catch {
      /* best-effort */
    }
  }

  void appendAuditLog(sb, {
    actor_type: "admin",
    actor_id: actor.userId,
    target_type: "user",
    target_id: userId,
    action: `moderation_${action}`,
    before_json: { status: fromStatus },
    after_json: { status: toStatus, logId },
  });

  return NextResponse.json({ ok: true, logId, status: toStatus });
}
