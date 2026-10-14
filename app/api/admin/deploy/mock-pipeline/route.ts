import { NextResponse } from "next/server";
import {
  emptyPipeline,
  isShaFormat,
  PIPELINE_STAGE_ORDER,
  type DeployPipelineStageId,
  type DeployPipelineStageState,
} from "@/lib/admin/deploy-promotion/deploy-promotion-ssot";
import { setPipelineMock } from "@/lib/admin/deploy-promotion/deploy-promotion-store";
import { requireDeployOwner } from "@/lib/admin/deploy-promotion/deploy-owner";
import { isTestRuntimeSurface } from "@/lib/config/test-access-control";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * TEST-only mock of A/B/C/D stages — never touches Production/main.
 */
export async function POST(req: Request) {
  const gate = await requireDeployOwner();
  if (!gate.ok) return gate.response;

  if (!isTestRuntimeSurface()) {
    return NextResponse.json(
      {
        ok: false,
        error: "mock_pipeline_test_surface_only",
        message: "A/B/C/D mock is allowed only on TEST runtime surface.",
      },
      { status: 403 }
    );
  }

  let body: {
    sha?: string;
    /** When true, mark all stages pass (mock). */
    allPass?: boolean;
    failAt?: DeployPipelineStageId;
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

  const pipeline = emptyPipeline("mock_test");
  const now = new Date().toISOString();
  for (const id of PIPELINE_STAGE_ORDER) {
    let state: DeployPipelineStageState = "skipped_mock";
    if (body.failAt && id === body.failAt) {
      state = "fail";
    } else if (body.allPass !== false && !body.failAt) {
      state = "pass";
    } else if (body.failAt) {
      const failIdx = PIPELINE_STAGE_ORDER.indexOf(body.failAt);
      const idx = PIPELINE_STAGE_ORDER.indexOf(id);
      state = idx < failIdx ? "pass" : idx === failIdx ? "fail" : "idle";
    }
    pipeline.stages[id] = {
      state,
      detail: "mock_test_no_production_change",
      at: now,
    };
  }

  const record = setPipelineMock(sha, pipeline);
  return NextResponse.json({ ok: true, record, pipeline: record.pipeline });
}
