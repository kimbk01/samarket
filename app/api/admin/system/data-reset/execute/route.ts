import { NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/admin/require-admin-permission";
import { executeDomainReset } from "@/lib/admin/data-reset/execute";
import { resolveDataResetEnvGate } from "@/lib/admin/data-reset/environment";
import {
  DATA_RESET_DOMAINS,
  DATA_RESET_SCOPES,
  type DataResetDomain,
  type DataResetScope,
} from "@/lib/admin/data-reset/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST /api/admin/system/data-reset/execute */
export async function POST(req: Request) {
  const auth = await requireSuperAdmin();
  if (!auth.ok) return auth.response;

  const envGate = resolveDataResetEnvGate();
  if (!envGate.executeAllowed) {
    return NextResponse.json(
      {
        ok: false,
        error: "execute_forbidden",
        reasons: envGate.reasons,
        hint: "Production execute is always blocked. Non-prod requires DATA_RESET_ENABLED or PRELAUNCH_RESET_ENABLED.",
      },
      { status: 403 }
    );
  }

  let body: {
    domain?: string;
    scope?: string;
    entityId?: string;
    subtype?: string;
    planId?: string;
    planHash?: string;
    typedConfirmation?: string;
    oneTimeToken?: string;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const domain = String(body.domain ?? "").trim() as DataResetDomain;
  const scope = String(body.scope ?? "").trim() as DataResetScope;
  const planId = String(body.planId ?? "").trim();
  const planHash = String(body.planHash ?? "").trim();
  if (!(DATA_RESET_DOMAINS as readonly string[]).includes(domain)) {
    return NextResponse.json({ ok: false, error: "invalid_domain" }, { status: 400 });
  }
  if (!(DATA_RESET_SCOPES as readonly string[]).includes(scope)) {
    return NextResponse.json({ ok: false, error: "invalid_scope" }, { status: 400 });
  }
  if (!planId || !planHash) {
    return NextResponse.json({ ok: false, error: "planId_and_planHash_required" }, { status: 400 });
  }

  const result = await executeDomainReset({
    sb: auth.sb,
    actorUserId: auth.actor.userId,
    request: {
      domain,
      scope,
      entityId: body.entityId,
      subtype: body.subtype,
    },
    planId,
    expectedHash: planHash,
    typedConfirmation: String(body.typedConfirmation ?? ""),
    oneTimeToken: body.oneTimeToken,
  });

  const status =
    result.overall === "BLOCKED" ? 403 : result.overall === "FAILED" ? 500 : 200;

  return NextResponse.json(
    {
      ok: result.ok,
      overall: result.overall,
      plan: result.plan,
      phases: result.phases,
      executedCounts: result.executedCounts,
      clientSessionInvalidationRequired: result.clientSessionInvalidationRequired,
      clientInvalidation: result.clientInvalidation ?? result.plan.clientInvalidation,
    },
    { status }
  );
}
