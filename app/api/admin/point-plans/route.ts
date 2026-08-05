import { NextRequest, NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/admin/require-admin-permission";
import { appendAuditLog } from "@/lib/audit/append-audit-log";
import { normalizeAppLanguage } from "@/lib/i18n/config";
import {
  createMemberPointPlan,
  listMemberPointPlans,
} from "@/lib/points/member-point-plans";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/admin/point-plans — all plans (active + inactive) */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const gate = await requireAdminPermission("point");
  if (!gate.ok) return gate.response;

  const lang = normalizeAppLanguage(
    req.headers.get("x-app-language") ?? req.cookies.get("app_language")?.value
  );
  const listed = await listMemberPointPlans(gate.sb, { language: lang });
  if (!listed.ok) {
    if (listed.code === "table_missing") {
      return NextResponse.json({ ok: true, plans: [] });
    }
    return NextResponse.json({ ok: false, error: listed.error }, { status: 500 });
  }
  return NextResponse.json({ ok: true, plans: listed.plans });
}

/** POST /api/admin/point-plans — create plan */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const gate = await requireAdminPermission("point");
  if (!gate.ok) return gate.response;

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const lang = normalizeAppLanguage(
    req.headers.get("x-app-language") ?? req.cookies.get("app_language")?.value
  );
  const created = await createMemberPointPlan(
    gate.sb,
    {
      nameKo: String(body.nameKo ?? body.name_ko ?? ""),
      nameEn: String(body.nameEn ?? body.name_en ?? ""),
      descriptionKo: String(body.descriptionKo ?? body.description_ko ?? ""),
      descriptionEn: String(body.descriptionEn ?? body.description_en ?? ""),
      paymentAmount: Number(body.paymentAmount ?? body.payment_amount ?? 0),
      pointAmount: Number(body.pointAmount ?? body.point_amount ?? 0),
      bonusAmount: Number(body.bonusAmount ?? body.bonus_amount ?? 0),
      currency: String(body.currency ?? "PHP"),
      isActive: body.isActive !== false && body.is_active !== false,
      sortOrder: Number(body.sortOrder ?? body.sort_order ?? 0),
    },
    lang
  );

  if (!created.ok) {
    const status = created.code === "invalid_input" ? 400 : created.code === "table_missing" ? 503 : 500;
    return NextResponse.json({ ok: false, error: created.error }, { status });
  }

  void appendAuditLog(gate.sb, {
    actor_type: "admin",
    actor_id: gate.actor.userId,
    target_type: "point_plan",
    target_id: created.plan.id,
    action: "admin_point_plan_create",
    after_json: { plan: created.plan },
  });

  return NextResponse.json({ ok: true, plan: created.plan });
}
