import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";
import type { SupportContext } from "@/lib/support/support-context";
import { openSupportCaseFromContext } from "@/lib/support/support-case-service";
import { buildSupportCaseRoute } from "@/lib/support/support-case-types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type OpenBody = {
  context?: SupportContext;
  initialBody?: string;
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

  const res = await openSupportCaseFromContext(sb, {
    userId: auth.userId,
    context,
    initialBody: body.initialBody,
  });

  if (!res.ok) {
    const status =
      res.error === "disabled_context" ||
      res.error === "missing_store_id" ||
      res.error === "member_case_must_not_have_store" ||
      res.error === "reference_incomplete" ||
      res.error === "invalid_reference_id"
        ? 400
        : res.error === "store_forbidden" ||
            res.error === "reference_forbidden" ||
            res.error === "reference_type_not_allowed"
          ? 403
          : res.error === "missing_table"
            ? 503
            : 500;
    return NextResponse.json({ ok: false, error: res.error }, { status });
  }

  return NextResponse.json({
    ok: true,
    case: res.case,
    sessionId: res.sessionId,
    created: res.created,
    href: buildSupportCaseRoute(res.case.id),
  });
}
