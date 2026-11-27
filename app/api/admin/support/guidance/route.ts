import { NextRequest, NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/admin/require-admin-permission";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";
import { appendAdminRouteAudit } from "@/lib/admin/audit/append-admin-route-audit";
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
  // 고객 문의 최종 감사 D4: 고객 접수 검증에 쓰이는 안내문 = `support` 키 (다른 고객지원 API 와 같다)
  const gate = await requireAdminPermission("support");
  if (!gate.ok) return gate.response;
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
  // 고객 문의 최종 감사 D4: 쓰기도 `support` 키 · 권한 확인이 본 관리자 id 를 그대로 쓴다
  const gate = await requireAdminPermission("support");
  if (!gate.ok) return gate.response;
  const auth = { userId: gate.actor.userId };

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

  await appendAdminRouteAudit(sb, req, {
    actorId: auth.userId,
    targetType: "support_guidance",
    targetId: res.entry.id,
    action: body.id ? "support_guidance.update" : "support_guidance.create",
    after: res.entry as unknown as Record<string, unknown>,
  });
  return NextResponse.json({ ok: true, entry: res.entry });
}
