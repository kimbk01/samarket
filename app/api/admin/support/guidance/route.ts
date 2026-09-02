import { NextRequest, NextResponse } from "next/server";
import { isRouteAdmin } from "@/lib/auth/is-route-admin";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";
import { validateSupportCategoryForOpen } from "@/lib/support/support-category-registry";
import {
  adminUpsertSupportGuidanceEntry,
  listEnabledSupportGuidance,
} from "@/lib/support/support-guidance-service";
import type { SupportGuidanceCtaKind } from "@/lib/support/support-guidance-authority";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/admin/support/guidance?audience=&category=&issueType= */
export async function GET(req: NextRequest) {
  if (!(await isRouteAdmin())) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }
  const sb = tryCreateSupabaseServiceClient();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  }

  const sp = req.nextUrl.searchParams;
  const audience = sp.get("audience") === "OWNER" ? "OWNER" : "MEMBER";
  const category = sp.get("category")?.trim() || "";
  const issueType = sp.get("issueType")?.trim() || "";
  if (!category || !issueType) {
    return NextResponse.json({ ok: false, error: "missing_query" }, { status: 400 });
  }

  const res = await listEnabledSupportGuidance(sb, { audience, category, issueType });
  if (!res.ok) {
    const status = res.error === "missing_guidance_table" ? 503 : 500;
    return NextResponse.json({ ok: false, error: res.error }, { status });
  }
  return NextResponse.json({ ok: true, entries: res.entries });
}

type UpsertBody = {
  id?: string;
  audience?: "MEMBER" | "OWNER";
  category?: string;
  issueType?: string;
  title?: string;
  body?: string;
  enabled?: boolean;
  sortOrder?: number;
  ctaKind?: SupportGuidanceCtaKind;
  ctaTarget?: string | null;
  escalationAllowed?: boolean;
};

/** POST /api/admin/support/guidance — Admin server authority upsert */
export async function POST(req: NextRequest) {
  if (!(await isRouteAdmin())) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;

  const sb = tryCreateSupabaseServiceClient();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  }

  let body: UpsertBody;
  try {
    body = (await req.json()) as UpsertBody;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const audience = body.audience === "OWNER" ? "OWNER" : "MEMBER";
  const category = body.category?.trim() || "";
  const issueType = body.issueType?.trim() || "";
  const cat = validateSupportCategoryForOpen({
    audience,
    category,
    issueType,
    allowMissingIssue: false,
  });
  if (!cat.ok) {
    return NextResponse.json({ ok: false, error: cat.error }, { status: 400 });
  }

  const res = await adminUpsertSupportGuidanceEntry(sb, {
    adminUserId: auth.userId,
    id: body.id,
    audience,
    category: cat.category,
    issueType: cat.issueType!,
    title: body.title ?? "",
    body: body.body ?? "",
    enabled: body.enabled,
    sortOrder: body.sortOrder,
    ctaKind: body.ctaKind,
    ctaTarget: body.ctaTarget,
    escalationAllowed: body.escalationAllowed,
  });

  if (!res.ok) {
    const status =
      res.error === "missing_guidance_table"
        ? 503
        : res.error.startsWith("invalid_") ||
            res.error.startsWith("cta_") ||
            res.error.startsWith("missing_")
          ? 400
          : 500;
    return NextResponse.json({ ok: false, error: res.error }, { status });
  }

  return NextResponse.json({ ok: true, entry: res.entry });
}
