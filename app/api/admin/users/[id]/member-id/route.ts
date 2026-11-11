import { NextRequest, NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/admin/require-admin-permission";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 어드민 회원 아이디 (설계안 v3 §3.4 · 시안 J)
 * - GET: 기본 아이디·회원 아이디·상태·본인 변경권·변경 이력 (기본 아이디는 어드민에서만 보인다)
 * - POST: 본인 변경권 다시 주기 — DB `admin_grant_dibay_id_change` (사유 필수, audit_logs 기록)
 */
const HISTORY_ACTIONS = ["admin_member_dibay_id_change", "admin_member_dibay_id_change_grant"] as const;
const REASON_MAX = 300;

export type AdminMemberIdHistoryItem = {
  at: string;
  kind: "member_change" | "admin_change" | "admin_grant";
  before: string | null;
  after: string | null;
  reason: string | null;
  actorId: string | null;
};

function pickText(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

export async function GET(_req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const gate = await requireAdminPermission("users");
  if (!gate.ok) return gate.response;
  const { id } = await context.params;
  const userId = id?.trim();
  if (!userId) return NextResponse.json({ ok: false, error: "invalid_id" }, { status: 400 });

  const { data: prof, error } = await gate.sb
    .from("profiles")
    .select("id, dibay_id, dibay_id_initial, dibay_id_state, dibay_id_can_change, dibay_id_changed_once, dibay_id_changed_at")
    .eq("id", userId)
    .maybeSingle();
  if (error) return NextResponse.json({ ok: false, error: "member_id_load_failed" }, { status: 500 });
  if (!prof) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });

  const { data: logs, error: logErr } = await gate.sb
    .from("audit_logs")
    .select("action, actor_id, before_json, after_json, created_at")
    .eq("target_type", "member")
    .eq("target_id", userId)
    .in("action", [...HISTORY_ACTIONS])
    .order("created_at", { ascending: false })
    .limit(30);
  if (logErr) return NextResponse.json({ ok: false, error: "member_id_load_failed" }, { status: 500 });

  const history: AdminMemberIdHistoryItem[] = (logs ?? []).map((row) => {
    const r = row as {
      action: string;
      actor_id: string | null;
      before_json: Record<string, unknown> | null;
      after_json: Record<string, unknown> | null;
      created_at: string;
    };
    const after = r.after_json ?? {};
    if (r.action === "admin_member_dibay_id_change_grant") {
      return {
        at: r.created_at,
        kind: "admin_grant" as const,
        before: null,
        after: null,
        reason: pickText(after.reason),
        actorId: r.actor_id,
      };
    }
    return {
      at: r.created_at,
      kind: "admin_change" as const,
      before: pickText(after.before) ?? pickText(r.before_json?.dibay_id),
      after: pickText(after.after),
      reason: pickText(after.reason),
      actorId: r.actor_id,
    };
  });

  /** 회원 본인 변경 — 마지막 변경 시각만 남는다 (profiles.dibay_id_changed_at) */
  const p = prof as {
    dibay_id: string | null;
    dibay_id_initial: string | null;
    dibay_id_state: string | null;
    dibay_id_can_change: boolean | null;
    dibay_id_changed_once: boolean | null;
    dibay_id_changed_at: string | null;
  };
  if (p.dibay_id_changed_at) {
    history.push({
      at: p.dibay_id_changed_at,
      kind: "member_change",
      before: null,
      after: pickText(p.dibay_id),
      reason: null,
      actorId: userId,
    });
    history.sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
  }

  return NextResponse.json({
    ok: true,
    memberId: {
      current: pickText(p.dibay_id),
      base: pickText(p.dibay_id_initial),
      state: p.dibay_id_state ?? "none",
      canChange: p.dibay_id_can_change === true,
      changedOnce: p.dibay_id_changed_once === true,
      history,
    },
  });
}

export async function POST(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const gate = await requireAdminPermission("users");
  if (!gate.ok) return gate.response;
  const { id } = await context.params;
  const userId = id?.trim();
  if (!userId) return NextResponse.json({ ok: false, error: "invalid_id" }, { status: 400 });

  let body: { reason?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  const reason = typeof body.reason === "string" ? body.reason.trim() : "";
  if (!reason) return NextResponse.json({ ok: false, error: "reason_required" }, { status: 400 });
  if (reason.length > REASON_MAX) return NextResponse.json({ ok: false, error: "reason_too_long" }, { status: 400 });

  const { data, error } = await gate.sb.rpc("admin_grant_dibay_id_change", {
    p_target_user_id: userId,
    p_actor_user_id: gate.actor.userId,
    p_reason: reason,
  });
  if (error) return NextResponse.json({ ok: false, error: "grant_failed" }, { status: 500 });
  const rpc = (data ?? {}) as { ok?: boolean; error?: string };
  if (rpc.ok !== true) {
    const code = String(rpc.error ?? "grant_failed");
    const status = code === "profile_missing" ? 404 : code === "change_right_available" ? 409 : 400;
    return NextResponse.json({ ok: false, error: code }, { status });
  }
  return NextResponse.json({ ok: true });
}
