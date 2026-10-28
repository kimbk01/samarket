import { randomUUID } from "crypto";
import { enforceStoreOwnerImageUploadQuota } from "@/lib/security/rate-limit-presets";
import { NextRequest, NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/admin/require-admin-permission";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";
import { storeProductListDerivativeOriginalPath } from "@/lib/media/canonical-image-path";
import {
  prepareStoreProductImageUpload,
  uploadPreparedStoreProductImage,
} from "@/lib/stores/catalog/store-product-image-upload-core.server";
import { appendAuditLog } from "@/lib/audit/append-audit-log";
import { getAuditRequestMeta } from "@/lib/audit/request-meta";
import { requireAdminSampleStore } from "@/lib/stores/sample/admin-sample-store.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST — 샘플 매장 이미지 업로드 (매장 대표·커버·메뉴). 오너 업로드와 같은 변환·파생본·저장 경로
 * (`store-product-images/{storeId}/…`) — 고아 파일 정리 크론(`/api/cron/store-product-images-orphan-gc`, 일 1회)도 같다.
 */
export async function POST(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const gate = await requireAdminPermission("business");
  if (!gate.ok) return gate.response;
  const sb = tryGetSupabaseForStores();
  if (!sb) return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  const { id } = await context.params;
  const sid = String(id ?? "").trim();
  const sample = await requireAdminSampleStore(sb, sid);
  if (!sample.ok) return sample.response;
  // HB-8 — 오너 매장 이미지 업로드와 같은 매장·사용자 횟수 제한
  const upRl = await enforceStoreOwnerImageUploadQuota(gate.actor.userId, sid);
  if (!upRl.ok) return upRl.response;

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_form" }, { status: 400 });
  }
  const prepared = await prepareStoreProductImageUpload(form);
  if (!prepared.ok) return NextResponse.json(prepared.outcome.json, { status: prepared.outcome.status });
  const { processed } = prepared;
  const path = storeProductListDerivativeOriginalPath(sid, randomUUID(), processed.ext);
  const uploaded = await uploadPreparedStoreProductImage(sb, path, processed);
  if (uploaded.status === 200) {
    const rm = getAuditRequestMeta(req);
    await appendAuditLog(sb, {
      actor_type: "admin",
      actor_id: gate.actor.userId,
      target_type: "store",
      target_id: sid,
      action: "store.sample.image_upload",
      after_json: { path: (uploaded.json as { path?: unknown }).path ?? null },
      ip: rm.ip,
      user_agent: rm.userAgent,
    });
  }
  return NextResponse.json(uploaded.json, uploaded.status === 200 ? undefined : { status: uploaded.status });
}
