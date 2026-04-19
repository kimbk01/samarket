import { NextRequest, NextResponse } from "next/server";
import { getRouteUserId } from "@/lib/auth/get-route-user-id";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";
import { sanitizeProductHtml } from "@/lib/html/sanitize-product-html";
import {
  canOwnerSellProducts,
  getStoreIfOwner,
} from "@/lib/stores/owner-product-gate";
import { parseProductOptionsJsonField } from "@/lib/stores/parse-product-options-json";
import { discountPriceFromPercent } from "@/lib/stores/store-product-pricing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  context: { params: Promise<{ storeId: string }> }
) {
  const userId = await getRouteUserId();
  if (!userId) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const { storeId } = await context.params;
  const id = typeof storeId === "string" ? storeId.trim() : "";
  if (!id) {
    return NextResponse.json({ ok: false, error: "missing_store_id" }, { status: 400 });
  }

  const supabase = tryGetSupabaseForStores();
  if (!supabase) {
    return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  }

  const { data: store, error: sErr } = await supabase
    .from("stores")
    .select("id, owner_user_id")
    .eq("id", id)
    .maybeSingle();

  if (sErr || !store) {
    return NextResponse.json({ ok: false, error: "store_not_found" }, { status: 404 });
  }
  if (store.owner_user_id !== userId) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const { data: products, error: pErr } = await supabase
    .from("store_products")
    .select(
      [
        "id, store_id, title, summary, description_html, price, discount_price, discount_percent, stock_qty, track_inventory",
        "thumbnail_url, product_status, pickup_available, local_delivery_available, shipping_available",
        "category_id, menu_section_id, item_type, is_featured, sort_order",
        "created_at, updated_at",
        "store_menu_sections ( id, name, sort_order, is_hidden )",
        "store_product_categories ( name, slug )",
      ].join(", ")
    )
    .eq("store_id", id)
    .not("product_status", "eq", "deleted")
    .order("is_featured", { ascending: false })
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: false });

  if (pErr) {
    console.error("[GET products]", pErr);
    return NextResponse.json({ ok: false, error: pErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, products: products ?? [] });
}

type CreateBody = {
  title?: string;
  summary?: string;
  description_html?: string;
  price?: number;
  discount_price?: number | null;
  stock_qty?: number;
  product_status?: string;
  pickup_available?: boolean;
  local_delivery_available?: boolean;
  shipping_available?: boolean;
  thumbnail_url?: string | null;
  category_id?: string | null;
  menu_section_id?: string | null;
  item_type?: string;
  is_featured?: boolean;
  sort_order?: number;
  options_json?: unknown[] | null;
  /** 0 또는 생략: 할인 없음. 1–100: 할인가 자동 계산 */
  discount_percent?: number | null;
  track_inventory?: boolean;
};

/** 매장 승인 필수. `active` 상품은 판매 승인 필수, `draft`는 판매 승인 없이 생성 가능 */
export async function POST(
  req: NextRequest,
  context: { params: Promise<{ storeId: string }> }
) {
  const userId = await getRouteUserId();
  if (!userId) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const { storeId } = await context.params;
  const sid = typeof storeId === "string" ? storeId.trim() : "";
  if (!sid) {
    return NextResponse.json({ ok: false, error: "missing_store_id" }, { status: 400 });
  }

  const supabase = tryGetSupabaseForStores();
  if (!supabase) {
    return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  }

  const gate = await getStoreIfOwner(supabase, userId, sid);
  if (!gate.ok) {
    return NextResponse.json({ ok: false, error: gate.error }, { status: gate.status });
  }
  if (gate.store.approval_status !== "approved") {
    return NextResponse.json({ ok: false, error: "store_not_approved" }, { status: 400 });
  }

  let body: CreateBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const title = String(body.title ?? "").trim();
  if (title.length < 1) {
    return NextResponse.json({ ok: false, error: "title_required" }, { status: 400 });
  }

  const price = Number(body.price);
  if (!Number.isFinite(price) || price < 0) {
    return NextResponse.json({ ok: false, error: "invalid_price" }, { status: 400 });
  }

  const stockQty = Number(body.stock_qty ?? 0);
  const stock = Number.isFinite(stockQty) && stockQty >= 0 ? Math.floor(stockQty) : 0;

  const priceFloored = Math.floor(price);
  let discount_percent: number | null = null;
  let discount: number | null = null;
  if (body.discount_percent !== undefined) {
    if (body.discount_percent === null) {
      discount_percent = null;
      discount = null;
    } else {
      const pct = Math.floor(Number(body.discount_percent));
      if (Number.isFinite(pct) && pct > 0 && pct <= 100) {
        discount_percent = pct;
        discount = discountPriceFromPercent(priceFloored, pct);
      } else {
        discount_percent = null;
        discount = null;
      }
    }
  } else if (body.discount_price != null && typeof body.discount_price === "number") {
    const d = Number(body.discount_price);
    if (Number.isFinite(d) && d >= 0) discount = Math.floor(d);
  }

  /** 생략 시 재고 미관리(무제한) */
  const track_inventory = body.track_inventory === true;

  const statusRaw = body.product_status !== undefined ? String(body.product_status).trim() : "hidden";
  const product_status = ["draft", "active", "hidden"].includes(statusRaw) ? statusRaw : "hidden";

  if (
    product_status === "active" &&
    !(await canOwnerSellProducts(supabase, sid))
  ) {
    return NextResponse.json({ ok: false, error: "sales_not_approved" }, { status: 403 });
  }

  const descRaw = String(body.description_html ?? "").trim();

  let category_id: string | null = null;
  if (body.category_id != null) {
    const cid = String(body.category_id).trim();
    if (cid) {
      const { data: cat } = await supabase
        .from("store_product_categories")
        .select("id")
        .eq("id", cid)
        .eq("is_active", true)
        .maybeSingle();
      if (!cat) {
        return NextResponse.json({ ok: false, error: "invalid_category_id" }, { status: 400 });
      }
      category_id = cid;
    }
  }

  let menu_section_id: string | null = null;
  if (body.menu_section_id !== undefined && body.menu_section_id !== null) {
    const mid = String(body.menu_section_id).trim();
    if (mid) {
      const { data: sec, error: secErr } = await supabase
        .from("store_menu_sections")
        .select("id")
        .eq("id", mid)
        .eq("store_id", sid)
        .maybeSingle();
      if (secErr && /column|does not exist|schema cache/i.test(String(secErr.message))) {
        return NextResponse.json({ ok: false, error: "migration_pending" }, { status: 503 });
      }
      if (!sec) {
        return NextResponse.json({ ok: false, error: "invalid_menu_section_id" }, { status: 400 });
      }
      menu_section_id = mid;
    }
  }

  const itemRaw = String(body.item_type ?? "product").trim();
  const item_type = ["product", "menu", "service"].includes(itemRaw) ? itemRaw : "product";
  const sortRaw = Number(body.sort_order ?? 0);
  const sort_order = Number.isFinite(sortRaw) ? Math.max(0, Math.min(9999, Math.floor(sortRaw))) : 0;

  let options_json: unknown[] = [];
  if (body.options_json !== undefined) {
    const parsed = parseProductOptionsJsonField(body.options_json);
    if (!parsed.ok) {
      return NextResponse.json({ ok: false, error: "invalid_options_json" }, { status: 400 });
    }
    options_json = parsed.value;
  }

  const row = {
    store_id: sid,
    title,
    summary: String(body.summary ?? "").trim() || null,
    description_html: descRaw ? sanitizeProductHtml(descRaw) : null,
    price: priceFloored,
    discount_price: discount,
    discount_percent,
    stock_qty: stock,
    track_inventory,
    product_status,
    pickup_available: !!body.pickup_available,
    local_delivery_available: !!body.local_delivery_available,
    shipping_available: !!body.shipping_available,
    thumbnail_url: body.thumbnail_url ? String(body.thumbnail_url).trim() || null : null,
    category_id,
    menu_section_id,
    item_type,
    is_featured: !!body.is_featured,
    sort_order,
    options_json,
  };

  const { data: created, error: insErr } = await supabase
    .from("store_products")
    .insert(row)
    .select("id")
    .maybeSingle();

  if (insErr) {
    console.error("[POST product]", insErr);
    return NextResponse.json({ ok: false, error: insErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, product: created });
}
