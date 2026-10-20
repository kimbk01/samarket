import { NextResponse } from "next/server";
import { isShaFormat } from "@/lib/admin/deploy-promotion/deploy-promotion-ssot";
import {
  cancelVerified,
  hydratePromotionRecordFromLedger,
  listEvidenceForSha,
  tryPersistLedgerRow,
} from "@/lib/admin/deploy-promotion/deploy-promotion-store";
import { requireDeployOwner } from "@/lib/admin/deploy-promotion/deploy-owner";
import { appendAdminRouteAudit } from "@/lib/admin/audit/append-admin-route-audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const gate = await requireDeployOwner();
  if (!gate.ok) return gate.response;

  let body: { sha?: string };
  try {
    body = (await req.json()) as { sha?: string };
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const sha = (body.sha ?? "").trim().toLowerCase();
  if (!isShaFormat(sha)) {
    return NextResponse.json({ ok: false, error: "invalid_sha" }, { status: 400 });
  }

  await hydratePromotionRecordFromLedger(gate.sb, sha);
  const record = cancelVerified({ sha, actorUserId: gate.actor.userId });
  if (!record) {
    return NextResponse.json(
      { ok: false, error: "not_verified_or_missing" },
      { status: 409 }
    );
  }

  await tryPersistLedgerRow(gate.sb, record, listEvidenceForSha(sha));
  await appendAdminRouteAudit(gate.sb, req, {
    actorId: gate.actor.userId,
    targetType: "deploy_promotion",
    targetId: sha,
    action: "deploy.cancel_verified",
    after: { status: record.status },
  });
  return NextResponse.json({ ok: true, record });
}
