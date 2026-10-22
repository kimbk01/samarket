import { NextRequest, NextResponse } from "next/server";
import { getRouteUserId } from "@/lib/auth/get-route-user-id";
import { validateActiveSession } from "@/lib/auth/server-guards";
import {
  isProductWriteDeniedMemberAccount,
  MEMBER_ACCOUNT_WRITE_DENIED_MESSAGE,
} from "@/lib/auth/member-account-state";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";
import { normalizeStoreOrderLineItem } from "@/lib/stores/normalize-store-order-line-item";
import {
  revalidateStoreCartLines,
  type StoreCartRevalidationLineInput,
} from "@/lib/stores/validate-store-order-checkout";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 장바구니는 상품당 1줄 — 메뉴 수 상한보다 넉넉한 방어 상한 */
const STORE_CART_REVALIDATE_MAX_LINES = 100;

/**
 * CRT-02 — 장바구니 줄 재검증(읽기 전용).
 * 주문 생성 라우트와 같은 인증·매장 게이트·상품 판정(`validateStoreOrderCheckout` 공용 함수)을 쓰고,
 * 주문·재고·쿠폰·상품권에는 쓰지 않는다. 주문 RPC 를 호출하지 않는다.
 */
export async function POST(req: NextRequest) {
  const buyerId = await getRouteUserId();
  if (!buyerId) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const session = await validateActiveSession(buyerId);
  if (!session.ok) return session.response;
  if (isProductWriteDeniedMemberAccount(session.profile)) {
    return NextResponse.json(
      { ok: false, error: MEMBER_ACCOUNT_WRITE_DENIED_MESSAGE, code: "member_activity_restricted" },
      { status: 403 }
    );
  }

  const sb = tryGetSupabaseForStores();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  }

  let body: { store_id?: unknown; fulfillment_type?: unknown; items?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const storeId = String(body.store_id ?? "").trim();
  const rawItems = Array.isArray(body.items) ? body.items : [];
  if (!storeId || rawItems.length === 0) {
    return NextResponse.json({ ok: false, error: "store_and_items_required" }, { status: 400 });
  }
  if (rawItems.length > STORE_CART_REVALIDATE_MAX_LINES) {
    return NextResponse.json({ ok: false, error: "invalid_line" }, { status: 400 });
  }

  const fulfillmentRaw = String(body.fulfillment_type ?? "pickup").trim();
  const fulfillment =
    fulfillmentRaw === "local_delivery" || fulfillmentRaw === "shipping"
      ? fulfillmentRaw
      : "pickup";

  const items: StoreCartRevalidationLineInput[] = [];
  for (const raw of rawItems) {
    const row = normalizeStoreOrderLineItem(raw);
    const lineId =
      raw && typeof raw === "object" ? String((raw as Record<string, unknown>).line_id ?? "").trim() : "";
    if (!row || !lineId) {
      return NextResponse.json({ ok: false, error: "invalid_line" }, { status: 400 });
    }
    items.push({ ...row, line_id: lineId });
  }

  const result = await revalidateStoreCartLines({
    sb,
    buyerId,
    storeId,
    fulfillment,
    items,
  });
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: result.status });
  }
  return NextResponse.json({ ok: true, lines: result.lines });
}
