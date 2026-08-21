import { NextRequest, NextResponse } from "next/server";
import { isRouteAdmin } from "@/lib/auth/is-route-admin";
import { appendAuditLog } from "@/lib/audit/append-audit-log";
import { getRouteUserId } from "@/lib/auth/get-route-user-id";
import {
  buildAdminStoreProductPatch,
  isAdminStoreProductAction,
} from "@/lib/stores/admin-store-product-ops";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type PatchBody = {
  action?: string;
  memo?: string;
};

/**
 * Limited Admin product ops on store_products SSOT.
 * block / hide / activate / sold_out / approve_review / reject_review
 * — not Owner menu CRUD.
 */
export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ productId: string }> }
) {
  if (!(await isRouteAdmin())) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const { productId } = await context.params;
  const id = typeof productId === "string" ? productId.trim() : "";
  if (!id) {
    return NextResponse.json({ ok: false, error: "missing_id" }, { status: 400 });
  }

  let body: PatchBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const actionRaw = String(body.action ?? "").trim();
  if (!isAdminStoreProductAction(actionRaw)) {
    return NextResponse.json({ ok: false, error: "unknown_action" }, { status: 400 });
  }
  const memo = String(body.memo ?? "").trim() || null;

  const sb = tryGetSupabaseForStores();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  }

  const { data: row, error: findErr } = await sb
    .from("store_products")
    .select("id, product_status, admin_review_status")
    .eq("id", id)
    .maybeSingle();

  if (findErr || !row) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }

  const patch = buildAdminStoreProductPatch(actionRaw, memo);
  const before = {
    product_status: row.product_status,
    admin_review_status: (row as { admin_review_status?: string }).admin_review_status,
  };

  const { error: upErr } = await sb.from("store_products").update(patch).eq("id", id);
  if (upErr) {
    console.error("[admin/store-products PATCH]", upErr);
    return NextResponse.json({ ok: false, error: upErr.message }, { status: 500 });
  }

  const actorId = await getRouteUserId();
  await appendAuditLog(sb, {
    actor_type: "admin",
    actor_id: actorId,
    target_type: "store_product",
    target_id: id,
    action: `store_product.${actionRaw}`,
    before_json: before,
    after_json: { ...patch, memo },
  });

  return NextResponse.json({ ok: true });
}
