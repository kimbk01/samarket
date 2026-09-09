import { NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/admin/require-admin-permission";
import { buildDomainResetPlan } from "@/lib/admin/data-reset/planner";
import { previewOneTimeTokenForPlan } from "@/lib/admin/data-reset/execute";
import { resolveDataResetEnvGate } from "@/lib/admin/data-reset/environment";
import {
  DATA_RESET_DOMAINS,
  DATA_RESET_SCOPES,
  type DataResetDomain,
  type DataResetScope,
} from "@/lib/admin/data-reset/types";
import { appendAuditLog } from "@/lib/audit/append-audit-log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST /api/admin/system/data-reset/preview */
export async function POST(req: Request) {
  const auth = await requireSuperAdmin();
  if (!auth.ok) return auth.response;

  const envGate = resolveDataResetEnvGate();
  if (!envGate.previewAllowed) {
    return NextResponse.json(
      { ok: false, error: "preview_forbidden", reasons: envGate.reasons },
      { status: 403 }
    );
  }

  let body: {
    domain?: string;
    scope?: string;
    entityId?: string;
    subtype?: string;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const domain = String(body.domain ?? "").trim() as DataResetDomain;
  const scope = String(body.scope ?? "").trim() as DataResetScope;
  if (!(DATA_RESET_DOMAINS as readonly string[]).includes(domain)) {
    return NextResponse.json({ ok: false, error: "invalid_domain" }, { status: 400 });
  }
  if (!(DATA_RESET_SCOPES as readonly string[]).includes(scope)) {
    return NextResponse.json({ ok: false, error: "invalid_scope" }, { status: 400 });
  }

  const plan = await buildDomainResetPlan({
    sb: auth.sb,
    actorUserId: auth.actor.userId,
    request: {
      domain,
      scope,
      entityId: body.entityId,
      subtype: body.subtype,
      mode: "preview",
    },
  });

  const oneTimeToken =
    plan.confirmationLevel >= 3
      ? previewOneTimeTokenForPlan(plan.planId, plan.planHash, auth.actor.userId)
      : null;

  await appendAuditLog(auth.sb, {
    actor_type: "admin",
    actor_id: auth.actor.userId,
    target_type: "data_reset",
    target_id: plan.planId,
    action: "data_reset_preview",
    after_json: {
      domain: plan.domain,
      scope: plan.scope,
      planHash: plan.planHash,
      riskLevel: plan.riskLevel,
      estimatedCounts: plan.estimatedCounts,
      blockers: plan.blockers,
    },
  });

  return NextResponse.json({
    ok: true,
    plan,
    oneTimeToken,
    env: { tier: envGate.tier, executeAllowed: envGate.executeAllowed },
  });
}
