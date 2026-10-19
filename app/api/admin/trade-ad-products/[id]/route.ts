import { NextRequest, NextResponse } from "next/server";
import { requireTradeAdmin } from "@/lib/admin/trade-admin/trade-admin-guards";
import { appendCommunityAdminAudit } from "@/lib/admin/community-admin/community-admin-audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** `load-trade-ad-product` 와 동일 컬럼 + 감사용 타임스탬프 */
const AD_PRODUCTS_PATCH_RETURN =
  "id, name, description, board_key, ad_type, duration_days, point_cost, priority_default, is_active, placement, service_type, category_id, region_target, allow_duplicate, auto_approve, created_at, updated_at";

type Body = Partial<{
  name: string;
  description: string;
  board_key: string | null;
  ad_type: string;
  duration_days: number;
  point_cost: number;
  priority_default: number;
  is_active: boolean;
  placement: string | null;
  service_type: string | null;
  category_id: string | null;
  region_target: string | null;
  allow_duplicate: boolean;
  auto_approve: boolean;
}>;

/**
 * PATCH /api/admin/trade-ad-products/[id] — 거래 광고 정책(ad_products) 수정.
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireTradeAdmin();
  if (!admin.ok) return admin.response;

  const id = (await params).id?.trim() ?? "";
  if (!id) {
    return NextResponse.json({ ok: false, error: "id 필요" }, { status: 400 });
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ ok: false, error: "JSON 본문이 필요합니다." }, { status: 400 });
  }

  const sb = admin.sb;
  const { data: before } = await sb.from("ad_products").select(AD_PRODUCTS_PATCH_RETURN).eq("id", id).maybeSingle();
  if (!before) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  const keys: (keyof Body)[] = [
    "name",
    "description",
    "board_key",
    "ad_type",
    "duration_days",
    "point_cost",
    "priority_default",
    "is_active",
    "placement",
    "service_type",
    "category_id",
    "region_target",
    "allow_duplicate",
    "auto_approve",
  ];
  for (const k of keys) {
    if (body[k] !== undefined) patch[k] = body[k];
  }

  const { data, error } = await sb
    .from("ad_products")
    .update(patch)
    .eq("id", id)
    .select(AD_PRODUCTS_PATCH_RETURN)
    .maybeSingle();
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  if (!data) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });

  // 홍보 상품·가격 변경 기록 (설계 v2 §F-4 — 금전과 무관한 설정, 기록 실패는 화면 경고)
  const audit = await appendCommunityAdminAudit(sb, req, {
    actorId: admin.userId,
    targetType: "trade_ad_product",
    targetId: id,
    action: "trade_ad_product.update",
    before: before as Record<string, unknown>,
    after: patch,
  });

  return NextResponse.json({ ok: true, row: data, ...(audit.ok ? {} : { auditWarning: true }) });
}
