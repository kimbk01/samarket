/**
 * 3-C §9-4 — 관리자 샘플 매장 삭제 실행 (server-only).
 * ① 사전 확인 RPC → 확인 토큰 · ④ 매장별 개별 트랜잭션 RPC · ⑤ 공유되지 않은 Storage 파일만 삭제 ·
 * ⑥ 결과 분리 · ⑦ 매장별 감사 + 요약 1건 · ⑧ 공개 캐시 세대 증가·메뉴 스냅샷 무효화.
 */
import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { appendAuditLog } from "@/lib/audit/append-audit-log";
import { STORE_PRODUCT_IMAGES_BUCKET } from "@/lib/media/canonical-image-contract";
import { removeCanonicalImageAssetLogged } from "@/lib/media/canonical-image-lifecycle.server";
import { clearStoreHomeFeedServerCache } from "@/lib/stores/store-home-feed-server-cache";
import { invalidateStorePublicCachesForSlugOnServer } from "@/lib/stores/store-public-cache-invalidate-server";
import { invalidateStoreMenusSnapshotCacheByStoreId } from "@/lib/stores/store-menus-snapshot-invalidate-by-store-id";
import { bumpStorePublicSharedCacheGeneration } from "@/lib/stores/store-public-shared-cache-generation";
import {
  normalizeSampleStoreDeletePreview,
  planSampleStoreStorageRemoval,
  sampleStoreDeleteTokenSource,
  summarizeSampleStoreDeleteResults,
  type SampleStoreDeletePreview,
  type SampleStoreDeleteResult,
  type SampleStoreImageRef,
} from "@/lib/admin-business/sample-store-delete-model";

type AnySb = SupabaseClient<any>;

export const SAMPLE_STORE_DELETE_BATCH_AUDIT_ACTION = "store.sample_delete_batch";

export function buildSampleStoreDeleteConfirmToken(previews: readonly SampleStoreDeletePreview[]): string {
  return createHash("sha256").update(sampleStoreDeleteTokenSource(previews)).digest("hex").slice(0, 40);
}

function isMissingFunctionError(err: { message?: unknown; code?: unknown } | null): boolean {
  if (!err) return false;
  const code = String(err.code ?? "");
  const msg = String(err.message ?? "");
  return code === "PGRST202" || code === "42883" || /could not find the function|does not exist/i.test(msg);
}

export async function loadSampleStoreDeletePreview(
  sb: AnySb,
  ids: readonly string[]
): Promise<
  | { ok: true; previews: SampleStoreDeletePreview[]; token: string }
  | { ok: false; error: "migration_pending" | "preview_failed" }
> {
  const { data, error } = await sb.rpc("admin_sample_store_delete_preview", { p_store_ids: ids });
  if (error) {
    console.error("[sample-store-delete] preview", error.message);
    return { ok: false, error: isMissingFunctionError(error) ? "migration_pending" : "preview_failed" };
  }
  const rows = Array.isArray(data) ? data : [];
  const byId = new Map<string, SampleStoreDeletePreview>();
  for (const raw of rows) {
    const p = normalizeSampleStoreDeletePreview(raw);
    if (p) byId.set(p.store_id.toLowerCase(), p);
  }
  // 요청 id 마다 1행 (RPC 가 빼먹은 id 는 삭제 불가 — fail-closed)
  const previews = ids.map(
    (id) =>
      byId.get(id.toLowerCase()) ?? {
        store_id: id,
        exists: false,
        deletable: false,
        reasons: ["preview_missing"],
      }
  );
  return { ok: true, previews, token: buildSampleStoreDeleteConfirmToken(previews) };
}

/** 같은 client_request_id 의 이전 실행 결과 (감사 요약 행) — 재전송은 같은 결과를 돌려준다. */
export async function findSampleStoreDeleteBatchByClientRequestId(
  sb: AnySb,
  clientRequestId: string
): Promise<{ results: SampleStoreDeleteResult[] } | null> {
  const { data, error } = await sb
    .from("audit_logs")
    .select("after_json")
    .eq("action", SAMPLE_STORE_DELETE_BATCH_AUDIT_ACTION)
    .eq("target_id", `sample_delete:${clientRequestId}`)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  const results = (data as { after_json?: { results?: unknown } }).after_json?.results;
  return Array.isArray(results) ? { results: results as SampleStoreDeleteResult[] } : null;
}

export type SampleStoreStorageRemover = (input: {
  sb: AnySb;
  storeId: string;
  images: readonly SampleStoreImageRef[];
}) => Promise<{ removed: number; failed: string[]; skippedShared: number }>;

/** 기본 Storage 삭제 — 기존 canonical 삭제 함수(원본 + hero·feed 파생본). */
export const removeSampleStoreStorage: SampleStoreStorageRemover = async ({ sb, storeId, images }) => {
  const plan = planSampleStoreStorageRemoval(storeId, images);
  let removed = 0;
  const failed: string[] = [];
  for (const originalPath of plan.originals) {
    const r = await removeCanonicalImageAssetLogged({
      sb: sb as SupabaseClient,
      bucket: STORE_PRODUCT_IMAGES_BUCKET,
      originalPath,
      context: "admin/sample-store-delete",
    });
    if (r.failed.length > 0) failed.push(originalPath);
    else removed += 1;
  }
  if (plan.derivativesOnly.length > 0) {
    const { error } = await sb.storage.from(STORE_PRODUCT_IMAGES_BUCKET).remove(plan.derivativesOnly);
    if (error) {
      console.error("[sample-store-delete] derivative remove", storeId, error.message);
      failed.push(...plan.derivativesOnly);
    } else {
      removed += plan.derivativesOnly.length;
    }
  }
  return { removed, failed, skippedShared: plan.skippedShared };
};

export async function executeSampleStoreDelete(input: {
  sb: AnySb;
  previews: readonly SampleStoreDeletePreview[];
  actorId: string;
  requestMeta: { ip: string | null; userAgent: string | null };
  reason: string;
  clientRequestId: string | null;
  removeStorage?: SampleStoreStorageRemover;
}): Promise<{ results: SampleStoreDeleteResult[]; summary: ReturnType<typeof summarizeSampleStoreDeleteResults> }> {
  const { sb, actorId, requestMeta } = input;
  const removeStorage = input.removeStorage ?? removeSampleStoreStorage;
  const results: SampleStoreDeleteResult[] = [];
  const deletedSlugs: { id: string; slug: string | null }[] = [];

  for (const p of input.previews) {
    if (!p.exists) {
      results.push({ store_id: p.store_id, outcome: "already_deleted" });
      continue;
    }
    if (!p.deletable) {
      results.push({
        store_id: p.store_id,
        store_name: p.store_name ?? null,
        outcome: "blocked",
        reasons: p.reasons.length ? p.reasons : ["not_deletable"],
      });
      continue;
    }

    // 매장마다 개별 트랜잭션 (DB 함수 1회 호출 = 1 트랜잭션)
    const { data, error } = await sb.rpc("admin_delete_sample_store", {
      p_store_id: p.store_id,
      p_actor: actorId,
    });
    if (error) {
      console.error("[sample-store-delete] rpc", p.store_id, error.message);
      const nonSample = /non_sample_store_delete_forbidden/.test(String(error.message ?? ""));
      results.push({
        store_id: p.store_id,
        store_name: p.store_name ?? null,
        outcome: nonSample ? "blocked" : "failed",
        ...(nonSample ? { reasons: ["not_sample_store"] } : { error: "delete_failed" }),
      });
      continue;
    }
    const out = (data ?? {}) as {
      status?: string;
      reasons?: unknown;
      images?: unknown;
      menu_count?: unknown;
      image_count?: unknown;
      slug?: unknown;
      store_name?: unknown;
    };
    if (out.status === "already_deleted") {
      results.push({ store_id: p.store_id, store_name: p.store_name ?? null, outcome: "already_deleted" });
      continue;
    }
    if (out.status !== "deleted") {
      results.push({
        store_id: p.store_id,
        store_name: p.store_name ?? null,
        outcome: "blocked",
        reasons: Array.isArray(out.reasons) ? (out.reasons as unknown[]).map(String) : ["not_deletable"],
      });
      continue;
    }

    // ⑤ 트랜잭션 성공 후 — DB 가 삭제 직전에 판정한 「공유되지 않은」 파일만
    const images = (Array.isArray(out.images) ? out.images : []) as SampleStoreImageRef[];
    let storage = { removed: 0, failed: [] as string[], skippedShared: 0 };
    try {
      storage = await removeStorage({ sb, storeId: p.store_id, images });
    } catch (e) {
      console.error("[sample-store-delete] storage", p.store_id, e);
      storage = { removed: 0, failed: images.map((i) => i.path), skippedShared: 0 };
    }

    const result: SampleStoreDeleteResult = {
      store_id: p.store_id,
      store_name: typeof out.store_name === "string" ? out.store_name : p.store_name ?? null,
      outcome: "deleted",
      menu_count: Number(out.menu_count) || 0,
      image_count: Number(out.image_count) || 0,
      storage_removed: storage.removed,
      storage_failed: storage.failed,
      storage_skipped_shared: storage.skippedShared,
    };
    results.push(result);
    deletedSlugs.push({ id: p.store_id, slug: typeof out.slug === "string" ? out.slug : p.slug ?? null });

    // ⑦ 매장별 감사
    await appendAuditLog(sb as SupabaseClient, {
      actor_type: "admin",
      actor_id: actorId,
      target_type: "store",
      target_id: p.store_id,
      action: "store.sample_delete",
      before_json: {
        store_kind: p.store_kind ?? null,
        store_name: p.store_name ?? null,
        slug: p.slug ?? null,
        menu_count: p.menu_count ?? 0,
        option_count: p.option_count ?? 0,
        section_count: p.section_count ?? 0,
        image_count: p.image_count ?? 0,
      },
      after_json: {
        outcome: "deleted",
        reason: input.reason,
        client_request_id: input.clientRequestId,
        storage_removed: storage.removed,
        storage_failed: storage.failed,
        storage_skipped_shared: storage.skippedShared,
      },
      ip: requestMeta.ip,
      user_agent: requestMeta.userAgent,
    });
  }

  // ⑧ 공개 캐시 — 목록·검색·배너·상세에서 제거
  if (deletedSlugs.length > 0) {
    try {
      clearStoreHomeFeedServerCache();
      for (const d of deletedSlugs) {
        invalidateStoreMenusSnapshotCacheByStoreId(d.id);
        if (d.slug) invalidateStorePublicCachesForSlugOnServer(d.slug);
      }
    } catch {
      /* best-effort */
    }
    bumpStorePublicSharedCacheGeneration("admin_store.sample_delete");
  }

  const summary = summarizeSampleStoreDeleteResults(results);
  // ⑦ 일괄 요약 1건 (실행자·시각은 audit_logs.created_at(UTC) — 화면은 PHT 로 표시)
  await appendAuditLog(sb as SupabaseClient, {
    actor_type: "admin",
    actor_id: actorId,
    target_type: "store_bulk",
    target_id: input.clientRequestId ? `sample_delete:${input.clientRequestId}` : "sample_delete",
    action: SAMPLE_STORE_DELETE_BATCH_AUDIT_ACTION,
    before_json: null,
    after_json: {
      reason: input.reason,
      client_request_id: input.clientRequestId,
      ...summary,
      results,
    },
    ip: requestMeta.ip,
    user_agent: requestMeta.userAgent,
  });

  return { results, summary };
}
