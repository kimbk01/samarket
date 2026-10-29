import { NextRequest } from "next/server";
import {
  appendAdminSampleCatalogAudit,
  requireAdminSampleCatalogStore,
} from "@/lib/admin-business/admin-sample-catalog-gate.server";
import { uploadStoreImageCore } from "@/lib/stores/owner-catalog/upload-image-core.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 3-C §9-3 — 관리자 샘플 매장 이미지 업로드 = 오너 업로드 코어 그대로 (같은 버킷·폴더·파생본). */
export async function POST(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const g = await requireAdminSampleCatalogStore(id);
  if (!g.ok) return g.response;
  const res = await uploadStoreImageCore(g.sb, g.store.id, g.actor, req);
  if (res.ok) {
    const json = (await res.clone().json().catch(() => null)) as { path?: string } | null;
    await appendAdminSampleCatalogAudit({
      sb: g.sb,
      actor: g.actor,
      storeId: g.store.id,
      action: "image_upload",
      req,
      after: { path: json?.path ?? null },
    });
  }
  return res;
}
