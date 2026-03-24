import { NextRequest, NextResponse } from "next/server";
import { getRouteUserId } from "@/lib/auth/get-route-user-id";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";
import { makeStoreSlug } from "@/lib/stores/make-store-slug";

export const dynamic = "force-dynamic";

/** 내 매장 목록 */
export async function GET() {
  const userId = await getRouteUserId();
  if (!userId) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const supabase = tryGetSupabaseForStores();
  if (!supabase) {
    return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  }

  const { data, error } = await supabase
    .from("stores")
    .select(
      [
        "id, owner_user_id, store_name, slug, business_type, owner_can_edit_store_identity",
        "store_category_id, store_topic_id",
        "description, kakao_id, phone, email, website_url",
        "region, city, district, address_line1, address_line2, lat, lng",
        "profile_image_url, order_alert_sound_url, business_hours_json, gallery_images_json, is_open",
        "delivery_available, pickup_available, reservation_available, visit_available",
        "approval_status, is_visible, rejected_reason, revision_note",
        "created_at, updated_at, approved_at",
        "store_categories ( name, slug ), store_topics ( name, slug )",
      ].join(", ")
    )
    .eq("owner_user_id", userId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[GET /api/me/stores]", error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  type MeStoreRow = Record<string, unknown> & { id: string };
  const list = (data ?? []) as unknown as MeStoreRow[];
  const ids = list.map((s) => s.id);
  const permByStore: Record<string, { allowed_to_sell: boolean; sales_status: string }> = {};
  if (ids.length > 0) {
    const { data: perms } = await supabase
      .from("store_sales_permissions")
      .select("store_id, allowed_to_sell, sales_status")
      .in("store_id", ids);
    for (const p of perms ?? []) {
      permByStore[p.store_id as string] = {
        allowed_to_sell: !!p.allowed_to_sell,
        sales_status: String(p.sales_status ?? ""),
      };
    }
  }

  return NextResponse.json({
    ok: true,
    stores: list.map((s) => ({
      ...s,
      sales_permission: permByStore[s.id] ?? null,
    })),
  });
}

type ApplyBody = {
  shopName?: string;
  description?: string;
  phone?: string;
  kakaoId?: string;
  region?: string;
  city?: string;
  addressLabel?: string;
  category?: string;
};

/** 매장 등록 신청 (1건 제한: 진행중·승인 매장이 있으면 409) */
export async function POST(req: NextRequest) {
  const userId = await getRouteUserId();
  if (!userId) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const supabase = tryGetSupabaseForStores();
  if (!supabase) {
    return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  }

  let body: ApplyBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const shopName = String(body.shopName ?? "").trim();
  if (shopName.length < 2) {
    return NextResponse.json({ ok: false, error: "shopName_required" }, { status: 400 });
  }

  const { data: blockers, error: blockErr } = await supabase
    .from("stores")
    .select("id")
    .eq("owner_user_id", userId)
    .in("approval_status", [
      "pending",
      "under_review",
      "revision_requested",
      "approved",
      "suspended",
    ])
    .limit(1);

  if (blockErr) {
    console.error("[POST /api/me/stores] block check", blockErr);
    return NextResponse.json({ ok: false, error: blockErr.message }, { status: 500 });
  }
  if (blockers && blockers.length > 0) {
    return NextResponse.json(
      { ok: false, error: "already_has_active_application" },
      { status: 409 }
    );
  }

  const description = String(body.description ?? "").trim() || null;
  const kakaoId = String(body.kakaoId ?? "").trim() || null;

  /** business_hours_json 은 DB 기본 `{}` — 승인 후 매장 설정에서 영업·공지 등과 동일 스키마로 채움 */
  const insertRow = {
    owner_user_id: userId,
    store_name: shopName,
    business_type: String(body.category ?? "").trim() || null,
    description,
    kakao_id: kakaoId,
    phone: String(body.phone ?? "").trim() || null,
    region: String(body.region ?? "").trim() || null,
    city: String(body.city ?? "").trim() || null,
    district: String(body.addressLabel ?? "").trim() || null,
    address_line1: String(body.addressLabel ?? "").trim() || null,
    approval_status: "pending",
    is_visible: false,
  };

  let inserted: Record<string, unknown> | null = null;
  let insErr: { code?: string; message: string } | null = null;

  for (let attempt = 0; attempt < 3; attempt++) {
    const slug = makeStoreSlug(shopName);
    const result = await supabase
      .from("stores")
      .insert({ ...insertRow, slug })
      .select(
        "id, owner_user_id, store_name, slug, business_type, description, kakao_id, phone, region, city, district, address_line1, approval_status, rejected_reason, created_at, updated_at, approved_at, profile_image_url"
      )
      .maybeSingle();

    insErr = result.error;
    inserted = result.data as Record<string, unknown> | null;
    if (!insErr) break;
    if (insErr.code === "23503") {
      return NextResponse.json(
        { ok: false, error: "owner_not_in_auth_users" },
        { status: 400 }
      );
    }
    if (insErr.code !== "23505") {
      console.error("[POST /api/me/stores]", insErr);
      return NextResponse.json({ ok: false, error: insErr.message }, { status: 500 });
    }
  }

  if (insErr || !inserted) {
    return NextResponse.json({ ok: false, error: "slug_collision" }, { status: 409 });
  }

  return NextResponse.json({ ok: true, store: inserted });
}
