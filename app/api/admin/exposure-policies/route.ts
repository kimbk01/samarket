import { NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";
import {
  listExposurePolicyLogs,
  listExposureScorePolicies,
} from "@/lib/exposure/exposure-score-policies-db";
import { EXPOSURE_SCORE_POLICY_DEFAULTS } from "@/lib/exposure/exposure-score-policy-defaults";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;

  const sb = tryCreateSupabaseServiceClient();
  if (!sb) {
    return NextResponse.json({
      ok: true,
      policies: EXPOSURE_SCORE_POLICY_DEFAULTS,
      logs: [],
      source: "defaults",
    });
  }

  try {
    const [policies, logs] = await Promise.all([
      listExposureScorePolicies(sb),
      listExposurePolicyLogs(sb, 100),
    ]);
    return NextResponse.json({
      ok: true,
      policies: policies.length ? policies : EXPOSURE_SCORE_POLICY_DEFAULTS,
      logs,
      source: policies.length ? "supabase" : "defaults",
    });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
