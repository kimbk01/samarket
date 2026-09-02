import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";
import { validateSupportCategoryForOpen } from "@/lib/support/support-category-registry";
import { listEnabledSupportGuidance } from "@/lib/support/support-guidance-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/support/guidance?audience=&category=&issueType=
 * Customer-readable enabled guidance only (service path).
 */
export async function GET(req: NextRequest) {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;

  const sb = tryCreateSupabaseServiceClient();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  }

  const sp = req.nextUrl.searchParams;
  const audience = sp.get("audience") === "OWNER" ? "OWNER" : "MEMBER";
  const category = sp.get("category")?.trim() || "";
  const issueType = sp.get("issueType")?.trim() || "";

  const cat = validateSupportCategoryForOpen({
    audience,
    category,
    issueType,
    allowMissingIssue: false,
  });
  if (!cat.ok || !cat.issueType) {
    return NextResponse.json(
      { ok: false, error: cat.ok ? "missing_issue_type" : cat.error },
      { status: 400 }
    );
  }

  const res = await listEnabledSupportGuidance(sb, {
    audience,
    category: cat.category,
    issueType: cat.issueType,
  });
  if (!res.ok) {
    const status = res.error === "missing_guidance_table" ? 503 : 500;
    return NextResponse.json({ ok: false, error: res.error }, { status });
  }

  return NextResponse.json({
    ok: true,
    entries: res.entries.map((e) => ({
      id: e.id,
      audience: e.audience,
      category: e.category,
      issue_type: e.issue_type,
      title: e.title,
      body: e.body,
      cta_kind: e.cta_kind,
      cta_target: e.cta_target,
      escalation_allowed: e.escalation_allowed,
      revision: e.revision,
      sort_order: e.sort_order,
    })),
  });
}
