import { NextRequest, NextResponse } from "next/server";
import { isRouteAdmin } from "@/lib/auth/is-route-admin";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";

export const dynamic = "force-dynamic";

type PatchBody = {
  action?: string;
  memo?: string;
};

/**
 * block → product_status blocked, admin_review rejected
 * hide → hidden
 * activate → active (검수 승인 처리)
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

  const action = String(body.action ?? "").trim();
  const memo = String(body.memo ?? "").trim() || null;

  const sb = tryGetSupabaseForStores();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  }

  const { data: row, error: findErr } = await sb
    .from("store_products")
    .select("id")
    .eq("id", id)
    .maybeSingle();

  if (findErr || !row) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }

  let patch: Record<string, unknown> = {};
  if (action === "block") {
    patch = {
      product_status: "blocked",
      admin_review_status: "rejected",
      admin_review_memo: memo,
    };
  } else if (action === "hide") {
    patch = {
      product_status: "hidden",
      admin_review_memo: memo,
    };
  } else if (action === "activate") {
    patch = {
      product_status: "active",
      admin_review_status: "approved",
      admin_review_memo: memo,
    };
  } else {
    return NextResponse.json({ ok: false, error: "unknown_action" }, { status: 400 });
  }

  const { error: upErr } = await sb.from("store_products").update(patch).eq("id", id);
  if (upErr) {
    console.error("[admin/store-products PATCH]", upErr);
    return NextResponse.json({ ok: false, error: upErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
