import { NextResponse } from "next/server";
import { isShaFormat } from "@/lib/admin/deploy-promotion/deploy-promotion-ssot";
import { requireDeployOwner } from "@/lib/admin/deploy-promotion/deploy-owner";
import { appendAdminRouteAudit } from "@/lib/admin/audit/append-admin-route-audit";
import { evaluateProductionRollbackExecution } from "@/lib/admin/deploy-promotion/deploy-execution-guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Production Instant Rollback — Area B BLOCKED.
 * Distinct from GitHub main revert; post-rollback must lock re-promote.
 */
export async function POST(req: Request) {
  const gate = await requireDeployOwner();
  if (!gate.ok) return gate.response;

  const exec = evaluateProductionRollbackExecution();
  if (!exec.allowed) {
    return NextResponse.json(
      {
        ok: false,
        error: exec.reason,
        code: "rollback_execution_blocked",
        message: exec.messageKo,
        messageEn: exec.messageEn,
        note: "Vercel Instant Rollback ≠ GitHub main revert. Re-promote lock required after real rollback.",
      },
      { status: 503 }
    );
  }

  let body: { sha?: string; reauthConfirm?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const sha = (body.sha ?? "").trim().toLowerCase();
  if (!isShaFormat(sha)) {
    return NextResponse.json({ ok: false, error: "invalid_sha" }, { status: 400 });
  }

  await appendAdminRouteAudit(gate.sb, req, {
    actorId: gate.actor.userId,
    targetType: "deploy_promotion",
    targetId: sha,
    action: "deploy.rollback_attempt",
    after: { outcome: "rollback_path_reserved" },
  });

  return NextResponse.json(
    {
      ok: false,
      error: "rollback_path_reserved",
      code: "rollback_execution_blocked",
    },
    { status: 503 }
  );
}
