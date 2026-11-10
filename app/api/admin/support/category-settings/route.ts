import { NextRequest, NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/admin/require-admin-permission";
import { appendAdminRouteAudit } from "@/lib/admin/audit/append-admin-route-audit";
import { validateSupportCategorySettingInput } from "@/lib/support/support-category-settings";
import {
  listSupportCategorySettings,
  upsertSupportCategorySetting,
} from "@/lib/support/support-category-settings-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET — 문의 유형 설정 전체 + 표 적용 여부 (고객지원 `support` 권한) */
export async function GET() {
  const gate = await requireAdminPermission("support");
  if (!gate.ok) return gate.response;
  const res = await listSupportCategorySettings(gate.sb);
  if (!res.ok) return NextResponse.json({ ok: false, error: res.error }, { status: 500 });
  return NextResponse.json({ ok: true, rows: res.rows, tableMissing: res.tableMissing });
}

/** PUT — 분야 또는 세부 1개의 이름(ko/en)·순서·노출 저장 (감사 기록) */
export async function PUT(req: NextRequest) {
  const gate = await requireAdminPermission("support");
  if (!gate.ok) return gate.response;
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  const v = validateSupportCategorySettingInput(body);
  if (!v.ok) return NextResponse.json({ ok: false, error: v.error }, { status: 400 });
  const res = await upsertSupportCategorySetting(gate.sb, { row: v.row, adminUserId: gate.actor.userId });
  if (!res.ok) {
    return NextResponse.json({ ok: false, error: res.error }, { status: res.error === "missing_table" ? 503 : 500 });
  }
  await appendAdminRouteAudit(gate.sb, req, {
    actorId: gate.actor.userId,
    targetType: "support_category_setting",
    targetId: `${v.row.audience}|${v.row.category_id}|${v.row.issue_id}`,
    action: "support_category_setting.update",
    before: (res.before ?? null) as unknown as Record<string, unknown> | null,
    after: res.row as unknown as Record<string, unknown>,
  });
  return NextResponse.json({ ok: true, row: res.row });
}
