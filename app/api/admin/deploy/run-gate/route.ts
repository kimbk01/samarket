import { NextResponse } from "next/server";
import { isShaFormat } from "@/lib/admin/deploy-promotion/deploy-promotion-ssot";
import {
  getOrCreatePromotionRecord,
  hydratePromotionRecordFromLedger,
  listEvidenceForSha,
  tryPersistLedgerRow,
  upsertEvidence,
} from "@/lib/admin/deploy-promotion/deploy-promotion-store";
import { DEPLOY_GATE_CATALOG } from "@/lib/admin/deploy-promotion/deploy-evidence-gates";
import { runDeployGate } from "@/lib/admin/deploy-promotion/run-deploy-gate";
import { requireDeployOwner } from "@/lib/admin/deploy-promotion/deploy-owner";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Owner-only. Runs a server-side gate and records evidence (no manual PASS).
 */
export async function POST(req: Request) {
  const gate = await requireDeployOwner();
  if (!gate.ok) return gate.response;

  let body: { sha?: string; gateId?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const sha = (body.sha ?? "").trim().toLowerCase();
  const gateId = (body.gateId ?? "").trim();
  if (!isShaFormat(sha)) {
    return NextResponse.json({ ok: false, error: "invalid_sha" }, { status: 400 });
  }
  if (!DEPLOY_GATE_CATALOG.some((g) => g.gateId === gateId)) {
    return NextResponse.json({ ok: false, error: "unknown_gate" }, { status: 400 });
  }

  await hydratePromotionRecordFromLedger(gate.sb, sha);
  getOrCreatePromotionRecord(sha);
  const evidence = await runDeployGate({
    gateId,
    sha,
    actorUserId: gate.actor.userId,
  });
  upsertEvidence(evidence);
  const allEvidence = listEvidenceForSha(sha);
  const record = getOrCreatePromotionRecord(sha);
  await tryPersistLedgerRow(gate.sb, record, allEvidence);

  return NextResponse.json({
    ok: true,
    evidence,
    allEvidence,
  });
}
