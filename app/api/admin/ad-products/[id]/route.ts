import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { upsertAdProduct, getAdProductById } from "@/lib/ads/mock-ad-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
  const existing = getAdProductById(id);
  if (!existing) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }
  const body = (await req.json()) as Record<string, unknown>;
  upsertAdProduct({ ...existing, ...body, id, updatedAt: new Date().toISOString() });
  return NextResponse.json({ ok: true });
}
