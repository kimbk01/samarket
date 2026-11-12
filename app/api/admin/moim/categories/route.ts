/**
 * /api/admin/moim/categories — 모임 카테고리 관리 (설계 moim §8). 권한 키 `moim`.
 * GET → { categories } · POST { id?, slug, labelKo, labelEn, sortOrder, isActive, isRestricted, expectedUpdatedAt(수정 시), reason(필수) }
 */
import { NextResponse, type NextRequest } from "next/server";
import { requireAdminPermission } from "@/lib/admin/require-admin-permission";
import { listAdminMoimCategories } from "@/lib/admin/moim/moim-admin-queries.server";
import { moimAdminBad, moimAdminJson, moimAdminReason, moimAdminRpcResponse, moimAdminUuid } from "@/lib/admin/moim/moim-admin-route.server";
import { moimAdminCategorySave } from "@/lib/moim/server/moim-rpc.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const gate = await requireAdminPermission("moim");
  if (!gate.ok) return gate.response;
  return NextResponse.json({ ok: true, categories: await listAdminMoimCategories(gate.sb) });
}

export async function POST(req: NextRequest) {
  const gate = await requireAdminPermission("moim");
  if (!gate.ok) return gate.response;
  const b = await moimAdminJson<Record<string, unknown>>(req);
  if (!b) return moimAdminBad();
  const reason = moimAdminReason(b.reason);
  if (!reason) return moimAdminBad("moim_admin_reason_required");
  const id = b.id == null || b.id === "" ? null : moimAdminUuid(b.id);
  if (b.id && !id) return moimAdminBad("moim_category_invalid");
  if (id && typeof b.expectedUpdatedAt !== "string") return moimAdminBad("moim_conflict", 409);
  const sortOrder = Math.floor(Number(b.sortOrder ?? 0));
  const r = await moimAdminCategorySave(
    gate.actor.userId,
    {
      id,
      slug: typeof b.slug === "string" ? b.slug.trim() : "",
      labelKo: typeof b.labelKo === "string" ? b.labelKo : "",
      labelEn: typeof b.labelEn === "string" ? b.labelEn : "",
      sortOrder: Number.isFinite(sortOrder) ? Math.max(-100000, Math.min(100000, sortOrder)) : 0,
      isActive: b.isActive !== false,
      isRestricted: b.isRestricted === true,
      expectedUpdatedAt: typeof b.expectedUpdatedAt === "string" ? b.expectedUpdatedAt : null,
    },
    reason,
    gate.sb
  );
  return moimAdminRpcResponse(r);
}
