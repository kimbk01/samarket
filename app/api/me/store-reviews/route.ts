import { NextRequest, NextResponse } from "next/server";
import { requireAuth, requirePhoneVerified, validateActiveSession } from "@/lib/auth/server-guards";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type PostBody = {
  order_id?: string;
  rating?: number;
  content?: string;
  product_id?: string | null;
  /** 공개 매장 리뷰 탭에 안 보이게 (사장님·운영 검수용) */
  owner_only?: boolean;
  /** 업로드된 이미지 공개 URL, 최대 3 */
  image_urls?: unknown;
  /** product_id -> "up" | "down" */
  item_feedback?: unknown;
};

function isUnknownColumnError(message: string | undefined): boolean {
  if (!message) return false;
  const m = message.toLowerCase();
  return m.includes("column") && m.includes("does not exist");
}

function parseImageUrls(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const x of raw) {
    const s = String(x ?? "").trim();
    if (!s || !/^https?:\/\//i.test(s) || s.length > 2048) continue;
    out.push(s);
    if (out.length >= 3) break;
  }
  return out;
}

function parseItemFeedback(
  raw: unknown,
  allowedLineIds: Set<string>
): Record<string, "up" | "down"> {
  if (!raw || typeof raw !== "object") return {};
  const o = raw as Record<string, unknown>;
  const out: Record<string, "up" | "down"> = {};
  for (const [k, v] of Object.entries(o)) {
    const lineId = String(k ?? "").trim();
    if (!lineId || !allowedLineIds.has(lineId)) continue;
    const s = String(v ?? "").trim().toLowerCase();
    if (s === "up" || s === "down") out[lineId] = s;
  }
  return out;
}

/**
 * 구매자: 완료된 주문에 대한 리뷰 1건 등록 (주문당 1회)
 */
export async function POST(req: NextRequest) {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;
  const session = await validateActiveSession(auth.userId);
  if (!session.ok) return session.response;
  const phone = await requirePhoneVerified(auth.userId);
  if (!phone.ok) return phone.response;
  const buyerId = auth.userId;

  let body: PostBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const orderId = String(body.order_id ?? "").trim();
  const rating = Math.round(Number(body.rating));
  const content = String(body.content ?? "").trim();
  const productIdRaw = body.product_id != null ? String(body.product_id).trim() : "";
  const ownerOnly = body.owner_only === true;
  const imageUrls = parseImageUrls(body.image_urls);
  const itemFeedbackRaw = body.item_feedback;

  if (!orderId || !Number.isFinite(rating) || rating < 1 || rating > 5) {
    return NextResponse.json({ ok: false, error: "invalid_rating_or_order" }, { status: 400 });
  }
  if (!content || content.length > 2000) {
    return NextResponse.json({ ok: false, error: "invalid_content" }, { status: 400 });
  }

  const sb = tryGetSupabaseForStores();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  }

  const { data: order, error: oErr } = await sb
    .from("store_orders")
    .select("id, store_id, buyer_user_id, order_status")
    .eq("id", orderId)
    .maybeSingle();

  if (oErr || !order) {
    return NextResponse.json({ ok: false, error: "order_not_found" }, { status: 404 });
  }
  if (order.buyer_user_id !== buyerId) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }
  if (order.order_status !== "completed") {
    return NextResponse.json({ ok: false, error: "order_not_completed" }, { status: 400 });
  }

  const { data: existing } = await sb.from("store_reviews").select("id").eq("order_id", orderId).maybeSingle();
  if (existing) {
    return NextResponse.json({ ok: false, error: "review_already_exists" }, { status: 409 });
  }

  const { data: lineRows } = await sb
    .from("store_order_items")
    .select("id, product_id")
    .eq("order_id", orderId);
  const lines = (lineRows ?? []) as { id?: string; product_id?: string }[];
  const lineIdsInOrder = new Set(lines.map((r) => String(r.id ?? "").trim()).filter(Boolean));
  const productIdsInOrder = new Set(
    lines.map((r) => String(r.product_id ?? "").trim()).filter(Boolean)
  );

  let productId: string | null = null;
  if (productIdRaw) {
    if (!productIdsInOrder.has(productIdRaw)) {
      return NextResponse.json({ ok: false, error: "product_not_in_order" }, { status: 400 });
    }
    productId = productIdRaw;
  }

  const itemFeedback = parseItemFeedback(itemFeedbackRaw, lineIdsInOrder);
  const hasExtras =
    imageUrls.length > 0 || Object.keys(itemFeedback).length > 0 || ownerOnly === true;

  const baseRow = {
    order_id: orderId,
    store_id: order.store_id,
    product_id: productId,
    buyer_user_id: buyerId,
    rating,
    content,
    status: "visible" as const,
  };

  const extendedRow = {
    ...baseRow,
    image_urls: imageUrls,
    visible_to_public: !ownerOnly,
    item_feedback: itemFeedback,
  };

  let row: { id?: string } | null = null;
  let insErr = null as { message?: string } | null;

  if (hasExtras) {
    const ext = await sb.from("store_reviews").insert(extendedRow).select("id").maybeSingle();
    row = ext.data;
    insErr = ext.error;
    if (insErr && isUnknownColumnError(insErr.message)) {
      row = null;
      insErr = null;
    }
  }

  if (!row && !insErr) {
    const base = await sb.from("store_reviews").insert(baseRow).select("id").maybeSingle();
    row = base.data;
    insErr = base.error;
  }

  if (insErr) {
    if (insErr.message?.includes("store_reviews") && insErr.message?.includes("does not exist")) {
      return NextResponse.json({ ok: false, error: "store_reviews_table_missing" }, { status: 503 });
    }
    console.error("[POST store-reviews]", insErr);
    return NextResponse.json({ ok: false, error: insErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, id: row?.id });
}
