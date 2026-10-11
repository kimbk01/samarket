import { NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/admin/require-admin-permission";
import {
  consumeFullResetActionToken,
  FULL_RESET_TOKEN_ACTIONS,
  issueFullResetActionToken,
  type FullResetTokenAction,
} from "@/lib/admin/data-reset/full/action-token";
import { reauthenticateSuperAdmin } from "@/lib/admin/data-reset/full/reauth";
import {
  advanceRun,
  approvePlan,
  auditFullReset,
  buildPlan,
  closeWindow,
  confirmPlan,
  decideWindow,
  fullResetPhrases,
  getFullResetState,
  requestAbort,
  requestWindow,
  startRun,
  type FullResetResult,
} from "@/lib/admin/data-reset/full/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** GET /api/admin/system/data-reset/full — lock state, window, plan (dry-run), run progress, history, audit. */
export async function GET() {
  const auth = await requireSuperAdmin();
  if (!auth.ok) return auth.response;
  const state = await getFullResetState(auth.sb, auth.actor.userId);
  if (!state.ok) return NextResponse.json({ ok: false, error: state.error }, { status: state.status });
  return NextResponse.json({ ok: true, actorUserId: auth.actor.userId, state: state.data });
}

type Body = {
  action?: string;
  reason?: string;
  windowId?: string;
  approve?: boolean;
  minutes?: number;
  planId?: string;
  planHash?: string;
  runId?: string;
  backupReference?: string;
  typedPhrase?: string;
  token?: string;
  password?: string;
  intent?: { action?: string; windowId?: string; planId?: string; planHash?: string };
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const s = (v: unknown) => (typeof v === "string" ? v.trim() : "");

/**
 * POST /api/admin/system/data-reset/full
 * Every refusal is answered with 4xx and written to the append-only audit trail. Destructive
 * transitions need: Super Admin session + fresh re-auth token (single use) + typed phrase, and the
 * database itself re-checks window / two-person / hash / backup / guard rules.
 */
export async function POST(req: Request) {
  const auth = await requireSuperAdmin();
  if (!auth.ok) return auth.response;
  const sb = auth.sb;
  const actor = auth.actor.userId;

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  const action = s(body.action);

  const refuse = async (error: string, status: number, extra: Record<string, unknown> = {}) => {
    await auditFullReset(sb, {
      actor,
      action: action || "unknown",
      outcome: "blocked",
      windowId: UUID.test(s(body.windowId)) ? s(body.windowId) : null,
      planId: UUID.test(s(body.planId)) ? s(body.planId) : null,
      runId: UUID.test(s(body.runId)) ? s(body.runId) : null,
      detail: { reason: error, ...extra },
    });
    return NextResponse.json({ ok: false, error }, { status });
  };
  const reply = async <T,>(r: FullResetResult<T>, extra: Record<string, unknown> = {}) => {
    if (!r.ok) return refuse(r.error, r.status, extra);
    return NextResponse.json({ ok: true, data: r.data });
  };
  const needToken = async (tokenAction: FullResetTokenAction, binding: { windowId?: string; planId?: string; planHash?: string }) => {
    const t = await consumeFullResetActionToken(sb, s(body.token), {
      action: tokenAction,
      actorUserId: actor,
      windowId: binding.windowId ?? null,
      planId: binding.planId ?? null,
      planHash: binding.planHash ?? null,
    });
    return t.ok ? null : t.reason;
  };

  switch (action) {
    case "reauth": {
      const intent = body.intent ?? {};
      const intentAction = s(intent.action) as FullResetTokenAction;
      if (!(FULL_RESET_TOKEN_ACTIONS as readonly string[]).includes(intentAction)) return refuse("invalid_intent", 400);
      const r = await reauthenticateSuperAdmin({ sb, actorUserId: actor, password: String(body.password ?? "") });
      if (!r.ok) {
        await auditFullReset(sb, { actor, action: "reauth", outcome: "blocked", detail: { reason: r.reason, intent: intentAction } });
        return NextResponse.json({ ok: false, error: r.reason }, { status: 401 });
      }
      const issued = issueFullResetActionToken({
        action: intentAction,
        actorUserId: actor,
        windowId: s(intent.windowId) || null,
        planId: s(intent.planId) || null,
        planHash: s(intent.planHash) || null,
      });
      if (!issued.ok) return refuse(issued.reason, 503);
      await auditFullReset(sb, { actor, action: "reauth", outcome: "ok", detail: { intent: intentAction } });
      return NextResponse.json({ ok: true, data: { token: issued.token, expiresAt: issued.expiresAt } });
    }

    case "request_window": {
      const reason = s(body.reason);
      if (reason.length < 5) return refuse("reason_required", 400);
      return reply(await requestWindow(sb, actor, reason.slice(0, 500)));
    }

    case "decide_window": {
      const windowId = s(body.windowId);
      if (!UUID.test(windowId)) return refuse("invalid_window_id", 400);
      const approve = body.approve === true;
      if (approve) {
        const bad = await needToken("decide_window", { windowId });
        if (bad) return refuse(bad, 403);
      }
      const minutes = Number.isFinite(Number(body.minutes)) ? Math.trunc(Number(body.minutes)) : 120;
      return reply(await decideWindow(sb, actor, windowId, approve, minutes));
    }

    case "close_window": {
      const windowId = s(body.windowId);
      if (!UUID.test(windowId)) return refuse("invalid_window_id", 400);
      return reply(await closeWindow(sb, actor, windowId, s(body.reason) || "closed_by_admin"));
    }

    case "build_plan": {
      const windowId = s(body.windowId);
      if (!UUID.test(windowId)) return refuse("invalid_window_id", 400);
      return reply(await buildPlan(sb, actor, windowId));
    }

    case "confirm_plan":
    case "approve_plan":
    case "start_run": {
      const planId = s(body.planId);
      const planHash = s(body.planHash);
      if (!UUID.test(planId) || !/^[0-9a-f]{64}$/.test(planHash)) return refuse("invalid_plan_binding", 400);
      const phrases = fullResetPhrases(planHash);
      const want = action === "confirm_plan" ? phrases.confirm : action === "approve_plan" ? phrases.approve : phrases.start;
      if (s(body.typedPhrase) !== want) return refuse("typed_phrase_mismatch", 400);
      const bad = await needToken(action, { planId, planHash });
      if (bad) return refuse(bad, 403);
      if (action === "confirm_plan") {
        const backup = s(body.backupReference);
        if (backup.length < 3) return refuse("backup_reference_required", 400);
        return reply(await confirmPlan(sb, actor, planId, planHash, backup.slice(0, 300)));
      }
      if (action === "approve_plan") return reply(await approvePlan(sb, actor, planId, planHash));
      return reply(await startRun(sb, actor, planId));
    }

    case "advance_run": {
      const runId = s(body.runId);
      if (!UUID.test(runId)) return refuse("invalid_run_id", 400);
      return reply(await advanceRun(sb, actor, runId));
    }

    case "abort_run": {
      const runId = s(body.runId);
      if (!UUID.test(runId)) return refuse("invalid_run_id", 400);
      // The next state read (or advance) finishes the run as "aborted" and closes the window.
      return reply(await requestAbort(sb, actor, runId));
    }

    default:
      return refuse("unknown_action", 400);
  }
}
