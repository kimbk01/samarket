import { NextRequest, NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/admin/require-admin-permission";
import { appendAuditLog } from "@/lib/audit/append-audit-log";
import { normalizeAppLanguage } from "@/lib/i18n/config";
import { updateMemberPointPlan } from "@/lib/points/member-point-plans";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** PATCH /api/admin/point-plans/[id] — update / deactivate plan */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const gate = await requireAdminPermission("point");
  if (!gate.ok) return gate.response;

  const { id } = await params;
  const planId = id?.trim();
  if (!planId) {
    return NextResponse.json({ ok: false, error: "invalid_id" }, { status: 400 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const lang = normalizeAppLanguage(
    req.headers.get("x-app-language") ?? req.cookies.get("app_language")?.value
  );

  const patch: Parameters<typeof updateMemberPointPlan>[2] = {};
  if (body.nameKo !== undefined || body.name_ko !== undefined) {
    patch.nameKo = String(body.nameKo ?? body.name_ko ?? "");
  }
  if (body.nameEn !== undefined || body.name_en !== undefined) {
    patch.nameEn = String(body.nameEn ?? body.name_en ?? "");
  }
  if (body.descriptionKo !== undefined || body.description_ko !== undefined) {
    patch.descriptionKo = String(body.descriptionKo ?? body.description_ko ?? "");
  }
  if (body.descriptionEn !== undefined || body.description_en !== undefined) {
    patch.descriptionEn = String(body.descriptionEn ?? body.description_en ?? "");
  }
  if (body.paymentAmount !== undefined || body.payment_amount !== undefined) {
    patch.paymentAmount = Number(body.paymentAmount ?? body.payment_amount ?? 0);
  }
  if (body.pointAmount !== undefined || body.point_amount !== undefined) {
    patch.pointAmount = Number(body.pointAmount ?? body.point_amount ?? 0);
  }
  if (body.bonusAmount !== undefined || body.bonus_amount !== undefined) {
    patch.bonusAmount = Number(body.bonusAmount ?? body.bonus_amount ?? 0);
  }
  if (body.currency !== undefined) patch.currency = String(body.currency);
  if (body.isActive !== undefined || body.is_active !== undefined) {
    patch.isActive = Boolean(body.isActive ?? body.is_active);
  }
  if (body.sortOrder !== undefined || body.sort_order !== undefined) {
    patch.sortOrder = Number(body.sortOrder ?? body.sort_order ?? 0);
  }

  const updated = await updateMemberPointPlan(gate.sb, planId, patch, lang);
  if (!updated.ok) {
    const status =
      updated.code === "not_found"
        ? 404
        : updated.code === "invalid_input"
          ? 400
          : updated.code === "table_missing"
            ? 503
            : 500;
    return NextResponse.json({ ok: false, error: updated.error }, { status });
  }

  void appendAuditLog(gate.sb, {
    actor_type: "admin",
    actor_id: gate.actor.userId,
    target_type: "point_plan",
    target_id: planId,
    action: "admin_point_plan_update",
    after_json: { plan: updated.plan, patch },
  });

  return NextResponse.json({ ok: true, plan: updated.plan });
}
