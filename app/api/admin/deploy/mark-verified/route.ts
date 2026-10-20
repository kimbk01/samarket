import { NextResponse } from "next/server";
import {
  canMarkVerified,
  assertPhase1Layers,
  isShaFormat,
  type DeployPromoteLayer,
} from "@/lib/admin/deploy-promotion/deploy-promotion-ssot";
import {
  getOrCreatePromotionRecord,
  hydratePromotionRecordFromLedger,
  listEvidenceForSha,
  markVerified,
  tryPersistLedgerRow,
} from "@/lib/admin/deploy-promotion/deploy-promotion-store";
import {
  evaluateRequiredGates,
  normalizeImpactScope,
} from "@/lib/admin/deploy-promotion/deploy-evidence-gates";
import { requireDeployOwner } from "@/lib/admin/deploy-promotion/deploy-owner";
import { appendAdminRouteAudit } from "@/lib/admin/audit/append-admin-route-audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Owner-only. Evidence-bound — manual PASS forbidden.
 * Does not execute Production promote.
 */
export async function POST(req: Request) {
  const gate = await requireDeployOwner();
  if (!gate.ok) return gate.response;

  let body: {
    sha?: string;
    layers?: DeployPromoteLayer[];
    impactScope?: string;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const sha = (body.sha ?? "").trim().toLowerCase();
  if (!isShaFormat(sha)) {
    return NextResponse.json({ ok: false, error: "invalid_sha" }, { status: 400 });
  }

  const layerCheck = assertPhase1Layers(
    body.layers?.length ? body.layers : (["web"] as DeployPromoteLayer[])
  );
  if (!layerCheck.ok) {
    return NextResponse.json({ ok: false, error: layerCheck.error }, { status: 400 });
  }

  const impact = normalizeImpactScope(body.impactScope ?? "web_admin_deploy");
  await hydratePromotionRecordFromLedger(gate.sb, sha);
  const existing = getOrCreatePromotionRecord(sha);
  if (!canMarkVerified(existing.status) && existing.status !== "verified") {
    return NextResponse.json(
      { ok: false, error: "status_not_markable", status: existing.status },
      { status: 409 }
    );
  }

  const evidence = listEvidenceForSha(sha);
  const evalResult = evaluateRequiredGates({ sha, impact, evidence });
  if (!evalResult.ok) {
    return NextResponse.json(
      {
        ok: false,
        error: "required_gates_incomplete",
        code: "required_gates_incomplete",
        blocking: evalResult.blocking,
        matrix: evalResult.matrix,
      },
      { status: 409 }
    );
  }

  const record = markVerified({
    sha,
    actorUserId: gate.actor.userId,
    layers: layerCheck.layers,
    impactScope: impact,
  });

  const persist = await tryPersistLedgerRow(gate.sb, record, evidence);
  await appendAdminRouteAudit(gate.sb, req, {
    actorId: gate.actor.userId,
    targetType: "deploy_promotion",
    targetId: sha,
    action: "deploy.mark_verified",
    before: { status: existing.status },
    after: {
      status: record.status,
      layers: layerCheck.layers,
      impact_scope: impact,
      ledger_persisted: persist.persisted,
    },
  });

  return NextResponse.json({
    ok: true,
    record,
    matrix: evalResult.matrix,
    ledgerPersisted: persist.persisted,
    ledgerError: persist.error ?? null,
  });
}
