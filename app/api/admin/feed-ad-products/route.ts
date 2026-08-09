import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import {
  listFeedAdProducts,
  updateFeedAdProduct,
  type FeedAdProductPatch,
} from "@/lib/ads/feed-ad-products";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/admin/feed-ad-products — all products (incl. inactive). */
export async function GET() {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;

  const sb = tryCreateSupabaseServiceClient();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  }

  const products = await listFeedAdProducts(sb, { activeOnly: false });
  return NextResponse.json({ ok: true, products });
}

/** PATCH /api/admin/feed-ad-products — update duration/price/active/sort/titles. */
export async function PATCH(req: NextRequest) {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;

  const sb = tryCreateSupabaseServiceClient();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  }

  let body: FeedAdProductPatch & { id?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const id = String(body.id ?? "").trim();
  if (!id) {
    return NextResponse.json({ ok: false, error: "missing_id" }, { status: 400 });
  }

  const result = await updateFeedAdProduct(sb, id, {
    durationDays: body.durationDays,
    pointCost: body.pointCost,
    titleKo: body.titleKo,
    titleEn: body.titleEn,
    isActive: body.isActive,
    sortOrder: body.sortOrder,
  });
  if (!result.ok) {
    const status = result.error === "not_found" ? 404 : 400;
    return NextResponse.json({ ok: false, error: result.error }, { status });
  }

  // Refetch from DB — never trust client-only state as persisted.
  const products = await listFeedAdProducts(sb, { activeOnly: false });
  const persisted = products.find((p) => p.id === id) ?? result.product;
  return NextResponse.json({ ok: true, product: persisted, products });
}
