/**
 * PATCH /api/posts/[postId]/owner-trade-update
 * 본인 trade 글 수정 — 거래 라이프사이클·카테고리별 핵심 필드 검증 (클라이언트와 동일 규칙)
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import { assertVerifiedMemberForAction } from "@/lib/auth/member-access";
import {
  allowAnyPostUpdate,
  allowEditCoreFields,
  allowsCancelledPartialEdit,
  allowsRestrictedPartialEdit,
  deriveTradeLifecycleStatus,
  flattenPostForTradeCompare,
  mergeTradePostFromPatch,
  resolveTradeKindFromCategory,
  validateRestrictedMetaPatch,
} from "@/lib/trade/trade-lifecycle-policy";

export const dynamic = "force-dynamic";

type PatchBody = {
  categoryId?: string;
  title?: string;
  content?: string;
  price?: number | null;
  region?: string;
  city?: string;
  barangay?: string;
  imageUrls?: string[] | null;
  meta?: Record<string, unknown> | null;
  isFreeShare?: boolean;
  isPriceOfferEnabled?: boolean;
  /** 본문 append 전용 (협의·진행 단계) */
  descriptionAppend?: string | null;
};

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ postId: string }> }
) {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;
  const userId = auth.userId;

  let sb: ReturnType<typeof getSupabaseServer>;
  try {
    sb = getSupabaseServer();
  } catch {
    return NextResponse.json({ ok: false, error: "서버 설정이 필요합니다." }, { status: 500 });
  }

  const { postId } = await params;
  const id = typeof postId === "string" ? postId.trim() : "";
  if (!id) {
    return NextResponse.json({ ok: false, error: "postId 필요" }, { status: 400 });
  }

  const access = await assertVerifiedMemberForAction(sb as any, userId);
  if (!access.ok) {
    return NextResponse.json({ ok: false, error: access.error }, { status: access.status });
  }

  let body: PatchBody;
  try {
    body = (await req.json()) as PatchBody;
  } catch {
    return NextResponse.json({ ok: false, error: "JSON 본문이 필요합니다." }, { status: 400 });
  }

  const sbAny = sb as import("@supabase/supabase-js").SupabaseClient;
  let { data: row, error: fetchErr } = await sbAny
    .from("posts")
    .select(
      "id, user_id, trade_category_id, category_id, title, content, price, region, city, barangay, images, thumbnail_url, meta, status, seller_listing_state, is_free_share, is_price_offer"
    )
    .eq("id", id)
    .maybeSingle();

  if (fetchErr && /seller_listing_state/i.test(String(fetchErr.message))) {
    const r2 = await sbAny
      .from("posts")
      .select(
        "id, user_id, trade_category_id, category_id, title, content, price, region, city, barangay, images, thumbnail_url, meta, status, is_free_share, is_price_offer"
      )
      .eq("id", id)
      .maybeSingle();
    row = r2.data ? ({ ...r2.data, seller_listing_state: null } as typeof row) : null;
    fetchErr = r2.error;
  }

  if (fetchErr) {
    return NextResponse.json({ ok: false, error: fetchErr.message }, { status: 500 });
  }
  if (!row) {
    return NextResponse.json({ ok: false, error: "글을 찾을 수 없습니다." }, { status: 404 });
  }

  const owner = String((row as { user_id?: string }).user_id ?? "");
  if (!owner || owner !== userId) {
    return NextResponse.json({ ok: false, error: "본인 글만 수정할 수 있습니다." }, { status: 403 });
  }

  const lifecycle = deriveTradeLifecycleStatus({
    status: (row as { status?: string }).status,
    seller_listing_state: (row as { seller_listing_state?: string | null }).seller_listing_state,
    meta: (row as { meta?: Record<string, unknown> | null }).meta,
  });

  if (!allowAnyPostUpdate(lifecycle)) {
    return NextResponse.json(
      { ok: false, error: "이 상태에서는 수정할 수 없습니다.", code: "trade_lifecycle_locked" },
      { status: 403 }
    );
  }

  const catId =
    String((row as { trade_category_id?: string }).trade_category_id ?? "").trim() ||
    String((row as { category_id?: string }).category_id ?? "").trim();
  let catSlug = "market";
  let catIcon = "";
  if (catId) {
    const { data: cat } = await sbAny.from("categories").select("slug, icon_key").eq("id", catId).maybeSingle();
    if (cat) {
      catSlug = String((cat as { slug?: string }).slug ?? "market");
      catIcon = String((cat as { icon_key?: string }).icon_key ?? "");
    }
  }
  const tradeKind = resolveTradeKindFromCategory({ slug: catSlug, icon_key: catIcon });

  const before = flattenPostForTradeCompare(row as Record<string, unknown>);
  const proposed = mergeTradePostFromPatch(before, body, tradeKind);

  if (allowEditCoreFields(lifecycle)) {
    /* draft / active — 전체 수정 */
  } else if (allowsRestrictedPartialEdit(lifecycle) || allowsCancelledPartialEdit(lifecycle)) {
    const v = validateRestrictedMetaPatch(tradeKind, before, proposed);
    if (!v.ok) {
      return NextResponse.json({ ok: false, error: v.error, code: "trade_edit_restricted" }, { status: 403 });
    }
  } else {
    return NextResponse.json({ ok: false, error: "이 상태에서는 수정할 수 없습니다." }, { status: 403 });
  }

  const now = new Date().toISOString();
  const patchDb: Record<string, unknown> = {
    trade_category_id: proposed.trade_category_id,
    title: proposed.title,
    content: proposed.content,
    price: proposed.price,
    region: proposed.region,
    city: proposed.city,
    barangay: proposed.barangay,
    images: proposed.images,
    thumbnail_url: proposed.thumbnail_url,
    meta: proposed.meta,
    is_free_share: proposed.is_free_share,
    is_price_offer: proposed.is_price_offer,
    updated_at: now,
  };

  const { error: updErr } = await sbAny.from("posts").update(patchDb).eq("id", id).eq("user_id", userId);

  if (updErr) {
    return NextResponse.json({ ok: false, error: updErr.message ?? "저장 실패" }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    tradeLifecycleStatus: lifecycle,
  });
}
