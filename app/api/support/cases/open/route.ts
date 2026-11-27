import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";
import type { SupportContext } from "@/lib/support/support-context";
import { openSupportCaseFromContext } from "@/lib/support/support-case-service";
import { buildSupportCaseRoute } from "@/lib/support/support-case-types";
import { checkSupportCustomerPostRate } from "@/lib/support/support-customer-rate-limit";
import { toSupportRequesterCaseView } from "@/lib/support/support-requester-view";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type OpenBody = {
  context?: SupportContext;
  initialBody?: string;
  issueType?: string | null;
  initialSummary?: string | null;
  guidanceKey?: string | null;
  guidanceRevision?: number | null;
  guidanceOutcome?: string | null;
  /** Structured triage: when true, issueType is required. */
  requireIssueType?: boolean;
  explicitOtherSelection?: boolean;
};

/** POST /api/support/cases/open — server-validated case open/create */
export async function POST(req: NextRequest) {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;

  const sb = tryCreateSupabaseServiceClient();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  }

  let body: OpenBody;
  try {
    body = (await req.json()) as OpenBody;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const context = body.context;
  if (!context || typeof context !== "object") {
    return NextResponse.json({ ok: false, error: "missing_context" }, { status: 400 });
  }

  // 고객 문의 최종 감사 D5: 접수도 고객 글 1건(새 문의 첫 글 또는 진행 중 문의에 붙는 글) → 같은 속도 제한
  if ((await checkSupportCustomerPostRate(sb, auth.userId)) === "rate_limited") {
    return NextResponse.json({ ok: false, error: "rate_limited" }, { status: 429 });
  }

  const res = await openSupportCaseFromContext(sb, {
    userId: auth.userId,
    context,
    initialBody: body.initialBody,
    issueType: body.issueType,
    initialSummary: body.initialSummary,
    guidanceKey: body.guidanceKey,
    guidanceRevision: body.guidanceRevision,
    guidanceOutcome: body.guidanceOutcome,
    // Contextual Production callers omit issueType — centralized compat.
    allowMissingIssue: body.requireIssueType === true ? false : true,
    explicitOtherSelection: body.explicitOtherSelection === true,
  });

  if (!res.ok) {
    const status =
      res.error === "disabled_context" ||
      res.error === "missing_store_id" ||
      res.error === "member_case_must_not_have_store" ||
      res.error === "reference_incomplete" ||
      res.error === "invalid_reference_id" ||
      res.error === "missing_category" ||
      res.error === "invalid_category" ||
      res.error === "missing_issue_type" ||
      res.error === "invalid_issue_type" ||
      res.error === "generic_other_forbidden" ||
      res.error === "guidance_not_found" ||
      res.error === "guidance_disabled" ||
      res.error === "guidance_audience_mismatch" ||
      res.error === "guidance_category_mismatch" ||
      res.error === "guidance_issue_mismatch" ||
      res.error === "guidance_revision_mismatch" ||
      res.error === "invalid_guidance_outcome"
        ? 400
        : res.error === "store_forbidden" ||
            res.error === "reference_forbidden" ||
            res.error === "reference_type_not_allowed"
          ? 403
          : res.error === "missing_table" || res.error === "missing_guidance_table"
            ? 503
            : // 2차 재감사 F: 동시 접수 경합 끝에 붙을 문의가 종료됐다 — 화면이 아는 코드(다시 누르면 새 문의)
              res.error === "case_closed"
              ? 409
              : 500;
    return NextResponse.json({ ok: false, error: res.error }, { status });
  }

  return NextResponse.json({
    ok: true,
    case: toSupportRequesterCaseView(res.case),
    sessionId: res.sessionId,
    created: res.created,
    href: buildSupportCaseRoute(res.case.id),
  });
}
