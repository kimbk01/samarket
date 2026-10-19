import { NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/admin/require-admin-permission";
import { appendAdminRouteAudit } from "@/lib/admin/audit/append-admin-route-audit";
import { getSupabaseServer } from "@/lib/chat/supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RULE_SELECT_COLS =
  "id, rule_key, rule_name, target_type, threshold_minutes, warning_level, repeat_minutes, is_active, escalation_level, escalate_after_minutes, max_escalation_level, notify_admin, auto_action_enabled, auto_action_type, auto_action_delay_minutes, auto_action_min_escalation_count, auto_action_requires_approval, updated_at";

const AUTO_ACTION_TYPES = new Set([
  "auto_hold_settlement",
  "auto_flag_order",
  "auto_reassign_rider",
  "auto_escalate",
  "auto_assign_admin",
  "auto_mark_attention",
  "auto_mute",
]);

/** 승인 생략(즉시 실행) 불가 — DB/UI 동일 정책 */
const AUTO_ACTION_ALWAYS_APPROVAL = new Set([
  "auto_hold_settlement",
  "auto_reassign_rider",
  "auto_mute",
]);

type PatchBody = {
  is_active?: boolean;
  threshold_minutes?: number;
  repeat_minutes?: number;
  warning_level?: string;
  escalation_level?: number;
  escalate_after_minutes?: number;
  max_escalation_level?: number;
  notify_admin?: boolean;
  rule_name?: string;
  auto_action_enabled?: boolean;
  auto_action_type?: string | null;
  auto_action_delay_minutes?: number | null;
  auto_action_min_escalation_count?: number;
  auto_action_requires_approval?: boolean;
  /** L2 사유 — 「즉시(승인 없이) 실행」 전환·활성 변경 시 필수 (DEF-41) */
  reason?: string;
  /** CAS — 화면이 본 규칙 updated_at (DEF-41 명시적 저장) */
  expected_updated_at?: string;
};

export async function PATCH(req: Request, ctx: { params: Promise<{ ruleId: string }> }) {
  const admin = await requireAdminPermission("business");
  if (!admin.ok) return admin.response;

  const { ruleId } = await ctx.params;
  const id = String(ruleId ?? "").trim();
  if (!id) return NextResponse.json({ error: "invalid_rule_id" }, { status: 400 });

  let body: PatchBody;
  try {
    body = (await req.json()) as PatchBody;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  let sb: ReturnType<typeof getSupabaseServer>;
  try {
    sb = getSupabaseServer();
  } catch {
    return NextResponse.json({ error: "server_config" }, { status: 500 });
  }

  const patch: Record<string, unknown> = {};
  if (typeof body.is_active === "boolean") patch.is_active = body.is_active;
  if (typeof body.threshold_minutes === "number" && Number.isFinite(body.threshold_minutes)) {
    const t = Math.floor(body.threshold_minutes);
    if (t >= 1 && t <= 100000) patch.threshold_minutes = t;
  }
  if (typeof body.repeat_minutes === "number" && Number.isFinite(body.repeat_minutes)) {
    const r = Math.floor(body.repeat_minutes);
    if (r >= 1 && r <= 100000) patch.repeat_minutes = r;
  }
  if (typeof body.warning_level === "string") {
    const w = body.warning_level.trim();
    if (w === "info" || w === "warning" || w === "critical") patch.warning_level = w;
  }
  if (typeof body.escalation_level === "number" && Number.isFinite(body.escalation_level)) {
    const e = Math.floor(body.escalation_level);
    if (e >= 1 && e <= 99) patch.escalation_level = e;
  }
  if (typeof body.escalate_after_minutes === "number" && Number.isFinite(body.escalate_after_minutes)) {
    const x = Math.floor(body.escalate_after_minutes);
    if (x >= 1 && x <= 100000) patch.escalate_after_minutes = x;
  }
  if (typeof body.max_escalation_level === "number" && Number.isFinite(body.max_escalation_level)) {
    const m = Math.floor(body.max_escalation_level);
    if (m >= 1 && m <= 99) patch.max_escalation_level = m;
  }
  if (typeof body.notify_admin === "boolean") patch.notify_admin = body.notify_admin;
  if (typeof body.rule_name === "string") {
    const n = body.rule_name.trim().slice(0, 120);
    if (n) patch.rule_name = n;
  }

  if (typeof body.auto_action_enabled === "boolean") {
    patch.auto_action_enabled = body.auto_action_enabled;
    if (body.auto_action_enabled === false) {
      patch.auto_action_type = null;
      patch.auto_action_delay_minutes = null;
    }
  }
  if (body.auto_action_type !== undefined) {
    if (body.auto_action_type === null || body.auto_action_type === "") {
      patch.auto_action_type = null;
      if (patch.auto_action_enabled !== true) {
        patch.auto_action_enabled = false;
        patch.auto_action_delay_minutes = null;
      }
    } else if (typeof body.auto_action_type === "string") {
      const t = body.auto_action_type.trim();
      if (!AUTO_ACTION_TYPES.has(t)) {
        return NextResponse.json({ error: "invalid_auto_action_type" }, { status: 400 });
      }
      // C-9 (Owner 승인): 레거시 정산 보류 자동 조치 중단 — 새로 켜거나 지정할 수 없다 (기존 기록 보존).
      if (t === "auto_hold_settlement") {
        return NextResponse.json({ error: "auto_action_type_retired" }, { status: 400 });
      }
      patch.auto_action_type = t;
    }
  }
  if (body.auto_action_delay_minutes !== undefined) {
    if (body.auto_action_delay_minutes === null) {
      patch.auto_action_delay_minutes = null;
    } else if (typeof body.auto_action_delay_minutes === "number" && Number.isFinite(body.auto_action_delay_minutes)) {
      const d = Math.floor(body.auto_action_delay_minutes);
      if (d >= 1 && d <= 100000) patch.auto_action_delay_minutes = d;
      else return NextResponse.json({ error: "invalid_auto_action_delay_minutes" }, { status: 400 });
    }
  }
  if (typeof body.auto_action_min_escalation_count === "number" && Number.isFinite(body.auto_action_min_escalation_count)) {
    const m = Math.floor(body.auto_action_min_escalation_count);
    if (m >= 0 && m <= 99) patch.auto_action_min_escalation_count = m;
    else return NextResponse.json({ error: "invalid_auto_action_min_escalation_count" }, { status: 400 });
  }
  if (typeof body.auto_action_requires_approval === "boolean") {
    patch.auto_action_requires_approval = body.auto_action_requires_approval;
  }

  const touchesAuto =
    body.auto_action_enabled !== undefined ||
    body.auto_action_type !== undefined ||
    body.auto_action_delay_minutes !== undefined ||
    body.auto_action_min_escalation_count !== undefined;

  if (touchesAuto) {
    const { data: cur, error: curErr } = await (sb as any)
      .from("delivery_operation_alert_rules")
      .select("auto_action_enabled, auto_action_type, auto_action_delay_minutes")
      .eq("id", id)
      .maybeSingle();

    if (curErr) {
      console.error("[admin delivery-operation-alerts rule PATCH] fetch", curErr.message);
      return NextResponse.json({ error: "fetch_failed" }, { status: 500 });
    }
    if (!cur) {
      return NextResponse.json({ error: "rule_not_found" }, { status: 404 });
    }

    const nextEnabled =
      patch.auto_action_enabled !== undefined ? Boolean(patch.auto_action_enabled) : Boolean(cur.auto_action_enabled);
    const nextType =
      patch.auto_action_type !== undefined ? patch.auto_action_type : (cur.auto_action_type as string | null);
    const nextDelay =
      patch.auto_action_delay_minutes !== undefined
        ? patch.auto_action_delay_minutes
        : (cur.auto_action_delay_minutes as number | null);

    if (nextEnabled) {
      const okType = typeof nextType === "string" && AUTO_ACTION_TYPES.has(nextType);
      const okDelay = typeof nextDelay === "number" && Number.isFinite(nextDelay) && nextDelay >= 1;
      if (!okType || !okDelay) {
        return NextResponse.json(
          {
            error: "auto_action_requires_type_and_delay",
            hint: "When auto_action_enabled is true, set auto_action_type and auto_action_delay_minutes (>=1).",
          },
          { status: 400 }
        );
      }
    }
  }

  if (!Object.keys(patch).length) {
    return NextResponse.json({ error: "empty_patch" }, { status: 400 });
  }

  const { data: snap, error: snapErr } = await (sb as any)
    .from("delivery_operation_alert_rules")
    .select(RULE_SELECT_COLS)
    .eq("id", id)
    .maybeSingle();

  if (snapErr) {
    const msg = String(snapErr.message ?? "");
    if (/does not exist|column/i.test(msg)) {
      return NextResponse.json({ error: "schema_missing", hint: "Apply migration delivery_auto_actions_safety" }, { status: 503 });
    }
    console.error("[admin delivery-operation-alerts rule PATCH] snapshot", msg);
    return NextResponse.json({ error: "fetch_failed" }, { status: 500 });
  }
  if (!snap) {
    return NextResponse.json({ error: "rule_not_found" }, { status: 404 });
  }

  const mergedTypeRaw =
    patch.auto_action_type !== undefined ? patch.auto_action_type : (snap.auto_action_type as string | null);
  const mergedType = typeof mergedTypeRaw === "string" ? mergedTypeRaw.trim() : "";
  const mergedAppr =
    patch.auto_action_requires_approval !== undefined
      ? Boolean(patch.auto_action_requires_approval)
      : Boolean((snap as { auto_action_requires_approval?: boolean }).auto_action_requires_approval ?? true);

  if (mergedType && AUTO_ACTION_ALWAYS_APPROVAL.has(mergedType) && mergedAppr === false) {
    return NextResponse.json(
      { error: "dangerous_action_requires_approval", hint: "hold / rider / mute must stay approval-first." },
      { status: 400 }
    );
  }

  const reason = typeof body.reason === "string" ? body.reason.trim().slice(0, 600) : "";
  const prevAppr = Boolean((snap as { auto_action_requires_approval?: boolean }).auto_action_requires_approval ?? true);
  const prevEnabled = Boolean((snap as { auto_action_enabled?: boolean }).auto_action_enabled);
  const nextEnabledFinal =
    patch.auto_action_enabled !== undefined ? Boolean(patch.auto_action_enabled) : prevEnabled;
  const becomesInstant = nextEnabledFinal && mergedType !== "" && mergedAppr === false && (prevAppr || !prevEnabled);
  const activeChanged =
    typeof patch.is_active === "boolean" && patch.is_active !== Boolean((snap as { is_active?: boolean }).is_active);
  if ((becomesInstant || activeChanged) && reason.length < 2) {
    return NextResponse.json({ error: "reason_required" }, { status: 400 });
  }

  const expectedUpdatedAt = typeof body.expected_updated_at === "string" ? body.expected_updated_at.trim() : "";
  if (!expectedUpdatedAt) {
    return NextResponse.json({ error: "expected_status_required" }, { status: 400 });
  }

  const { data, error } = await (sb as any)
    .from("delivery_operation_alert_rules")
    .update(patch)
    .eq("id", id)
    .eq("updated_at", expectedUpdatedAt)
    .select(RULE_SELECT_COLS)
    .maybeSingle();

  if (error) {
    console.error("[admin delivery-operation-alerts rule PATCH] update", error.message);
    return NextResponse.json({ error: "update_failed" }, { status: 500 });
  }
  if (!data) {
    // 규칙은 존재(snapshot) — updated_at 불일치 = 다른 관리자가 먼저 저장
    return NextResponse.json({ error: "stale_updated_at" }, { status: 409 });
  }

  await appendAdminRouteAudit(admin.sb, req, {
    actorId: admin.actor.userId,
    targetType: "delivery_operation_alert_rule",
    targetId: id,
    action: "delivery_alert_rule.update",
    before: snap as Record<string, unknown>,
    after: { patch, reason: reason || null, instant_enabled: becomesInstant, rule: data as Record<string, unknown> },
  });

  return NextResponse.json({ ok: true, rule: data });
}
