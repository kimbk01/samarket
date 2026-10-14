import { NextResponse } from "next/server";
import {
  assertPhase1Layers,
  assertPromoteReauth,
  canPromoteWeb,
  isShaFormat,
  type DeployPromoteLayer,
} from "@/lib/admin/deploy-promotion/deploy-promotion-ssot";
import {
  getDeployPromotionRecord,
  upsertDeployPromotionRecord,
} from "@/lib/admin/deploy-promotion/deploy-promotion-store";
import { requireDeployOwner } from "@/lib/admin/deploy-promotion/deploy-owner";
import { evaluateProductionPromoteExecution } from "@/lib/admin/deploy-promotion/deploy-execution-guard";
import { promoteWebShaViaGithub } from "@/lib/admin/deploy-promotion/promote-web-sha-github";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Web promote — Owner only.
 * Fail-closed until DIBAY_PROMOTE_ENABLED=1 AND DIBAY_PROMOTE_EXECUTION_UNLOCKED=1.
 * Area A: both unset → always 503. Do not unlock until auth-split proven.
 */
export async function POST(req: Request) {
  const gate = await requireDeployOwner();
  if (!gate.ok) return gate.response;

  const exec = evaluateProductionPromoteExecution();
  if (!exec.allowed) {
    return NextResponse.json(
      {
        ok: false,
        error: exec.reason,
        code: "production_execution_blocked",
        message: exec.messageKo,
        messageEn: exec.messageEn,
        ownerAction:
          "Complete Area B (GitHub/Vercel auth split). Do not set DIBAY_PROMOTE_EXECUTION_UNLOCKED until Cursor cannot share Owner prod deploy rights.",
      },
      { status: 503 }
    );
  }

  let body: {
    sha?: string;
    confirmSha?: string;
    reauthConfirm?: string;
    layers?: DeployPromoteLayer[];
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const sha = (body.sha ?? "").trim().toLowerCase();
  const confirmSha = (body.confirmSha ?? "").trim().toLowerCase();
  if (!isShaFormat(sha) || sha !== confirmSha) {
    return NextResponse.json({ ok: false, error: "sha_confirm_mismatch" }, { status: 400 });
  }
  if (!assertPromoteReauth(body.reauthConfirm ?? "")) {
    return NextResponse.json({ ok: false, error: "reauth_confirm_required" }, { status: 400 });
  }

  const layerCheck = assertPhase1Layers(body.layers?.length ? body.layers : ["web"]);
  if (!layerCheck.ok) {
    return NextResponse.json({ ok: false, error: layerCheck.error }, { status: 400 });
  }

  const existing = getDeployPromotionRecord(sha);
  if (!existing) {
    return NextResponse.json({ ok: false, error: "sha_not_verified" }, { status: 409 });
  }
  const promoteGate = canPromoteWeb(existing);
  if (!promoteGate.ok) {
    return NextResponse.json(
      { ok: false, error: promoteGate.reason ?? "cannot_promote" },
      { status: 409 }
    );
  }

  upsertDeployPromotionRecord({
    ...existing,
    status: "promoting",
    layers: layerCheck.layers,
    promotedBy: gate.actor.userId,
  });

  const result = await promoteWebShaViaGithub({ sha });
  if (!result.ok) {
    upsertDeployPromotionRecord({
      ...existing,
      status: "failed",
      layers: layerCheck.layers,
      promotedBy: gate.actor.userId,
      promotedAt: new Date().toISOString(),
      error: result.error,
    });
    return NextResponse.json(
      {
        ok: false,
        error: result.error,
        ownerAction: result.ownerAction ?? null,
      },
      { status: 503 }
    );
  }

  const record = upsertDeployPromotionRecord({
    ...existing,
    status: "success",
    layers: layerCheck.layers,
    promotedBy: gate.actor.userId,
    promotedAt: new Date().toISOString(),
    githubResult: `${result.mode}:${result.ref}`,
  });

  return NextResponse.json({ ok: true, record, result });
}
