import { NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/admin/require-admin-permission";
import {
  assertPhase1Layers,
  isShaFormat,
  type DeployPromoteLayer,
} from "@/lib/admin/deploy-promotion/deploy-promotion-ssot";
import {
  getDeployPromotionRecord,
  upsertDeployPromotionRecord,
} from "@/lib/admin/deploy-promotion/deploy-promotion-store";
import { promoteWebShaViaGithub } from "@/lib/admin/deploy-promotion/promote-web-sha-github";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Web-only promote. Requires:
 * - super admin
 * - confirmSha === sha
 * - reauthConfirm === "PROMOTE"
 * - record status verified for that sha
 * - DIBAY_PROMOTE_ENABLED + GitHub token (Owner console)
 */
export async function POST(req: Request) {
  const gate = await requireSuperAdmin();
  if (!gate.ok) return gate.response;

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
  if ((body.reauthConfirm ?? "").trim() !== "PROMOTE") {
    return NextResponse.json({ ok: false, error: "reauth_confirm_required" }, { status: 400 });
  }

  const layerCheck = assertPhase1Layers(body.layers?.length ? body.layers : ["web"]);
  if (!layerCheck.ok) {
    return NextResponse.json({ ok: false, error: layerCheck.error }, { status: 400 });
  }

  const existing = getDeployPromotionRecord(sha);
  if (!existing || existing.status !== "verified") {
    return NextResponse.json({ ok: false, error: "sha_not_verified" }, { status: 409 });
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
