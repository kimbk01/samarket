import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";

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
  const admin = await requireAdminApiUser();
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

  const sb = tryCreateSupabaseServiceClient();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "Supabase 서비스 클라이언트가 없습니다." }, { status: 503 });
  }

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

  return NextResponse.json({ ok: true, row: data });
}
