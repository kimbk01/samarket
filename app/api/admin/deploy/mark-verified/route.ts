import { NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/admin/require-admin-permission";
import {
  isShaFormat,
  type DeployPromoteLayer,
} from "@/lib/admin/deploy-promotion/deploy-promotion-ssot";
import { upsertDeployPromotionRecord } from "@/lib/admin/deploy-promotion/deploy-promotion-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const gate = await requireSuperAdmin();
  if (!gate.ok) return gate.response;

  let body: { sha?: string; layers?: DeployPromoteLayer[] };
  try {
    body = (await req.json()) as { sha?: string; layers?: DeployPromoteLayer[] };
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const sha = (body.sha ?? "").trim().toLowerCase();
  if (!isShaFormat(sha)) {
    return NextResponse.json({ ok: false, error: "invalid_sha" }, { status: 400 });
  }

  const layers = body.layers?.length ? body.layers : (["web"] as DeployPromoteLayer[]);
  const record = upsertDeployPromotionRecord({
    sha,
    status: "verified",
    layers,
    verifiedBy: gate.actor.userId,
    verifiedAt: new Date().toISOString(),
  });

  return NextResponse.json({ ok: true, record });
}
