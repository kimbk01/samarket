import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { fetchAdProductByIdFromDb, updateAdProductInDb, type AdProductPatchInput } from "@/lib/ads/ad-products-supabase";
import type { AdProduct } from "@/lib/ads/types";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function patchFromBody(body: Record<string, unknown>): AdProductPatchInput {
  const patch: AdProductPatchInput = {};
  if (typeof body.name === "string") patch.name = body.name;
  if (typeof body.description === "string") patch.description = body.description;
  if (body.boardKey === null || typeof body.boardKey === "string") patch.boardKey = body.boardKey as string | null;
  if (typeof body.adType === "string") patch.adType = body.adType as AdProduct["adType"];
  if (typeof body.durationDays === "number") patch.durationDays = body.durationDays;
  if (typeof body.pointCost === "number") patch.pointCost = body.pointCost;
  if (typeof body.priorityDefault === "number") patch.priorityDefault = body.priorityDefault;
  if (typeof body.isActive === "boolean") patch.isActive = body.isActive;
  return patch;
}

/**
 * PATCH /api/admin/ad-products/[id]
 * 관리자: 광고 상품 수정
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;

  const { id } = await params;
  const svc = tryCreateSupabaseServiceClient();
  if (!svc) {
    return NextResponse.json({ ok: false, error: "db_unavailable" }, { status: 503 });
  }

  const existing = await fetchAdProductByIdFromDb(svc, id);
  if (!existing.ok) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const updated = await updateAdProductInDb(svc, id, patchFromBody(body));
  if (!updated.ok) {
    return NextResponse.json(
      { ok: false, error: updated.notFound ? "not_found" : updated.error ?? "update_failed" },
      { status: updated.notFound ? 404 : 400 }
    );
  }

  return NextResponse.json({ ok: true, product: updated.product });
}
