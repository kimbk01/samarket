/**
 * 3-E PRD-16 — 매장 이미지 고아 객체 GC 실행 (server-only).
 * 기본 dry-run(삭제 0, 목록만). `STORE_PRODUCT_IMAGES_ORPHAN_GC_DELETE_ENABLED=1` (Owner 승인) 일 때만 실삭제.
 * 참조 조회가 하나라도 실패한 매장·매장 행이 없는 폴더는 건너뛴다 (fail-closed).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { STORE_PRODUCT_IMAGES_BUCKET } from "@/lib/media/canonical-image-contract";
import {
  collectStoreImagePathsFromValues,
  planStoreProductImageOrphans,
  type StoreImageObject,
} from "@/lib/stores/store-product-images-orphan-gc";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LIST_PAGE = 1000;
const REMOVE_CHUNK = 100;

/** 참조 소스 — 없는 테이블(운영 미생성)은 참조 0 으로 본다. 그 외 오류는 매장 건너뜀. */
const REFERENCE_SOURCES: Array<{ table: string; column: "id" | "store_id"; select: string }> = [
  { table: "stores", column: "id", select: "*" },
  { table: "store_products", column: "store_id", select: "id, thumbnail_url, images_json, description_html" },
  { table: "store_banners", column: "store_id", select: "*" },
  { table: "store_notices", column: "store_id", select: "*" },
  { table: "gift_certificate_products", column: "store_id", select: "id, image_url" },
  { table: "gift_certificate_applications", column: "store_id", select: "id, image_url" },
];

function isMissingTableError(err: { message?: unknown; code?: unknown } | null): boolean {
  if (!err) return false;
  const code = String(err.code ?? "");
  if (code === "42P01" || code === "PGRST205") return true;
  const msg = String(err.message ?? "");
  return /relation .* does not exist|could not find the table/i.test(msg);
}

export type StoreImagesOrphanGcStoreResult = {
  store_id: string;
  objects: number;
  referenced_kept: number;
  young_kept: number;
  orphans: number;
  orphan_sample: string[];
  removed: number;
  skipped?: "store_missing" | "reference_query_failed" | "list_failed";
};

export type StoreImagesOrphanGcResult = {
  dry_run: boolean;
  stores_scanned: number;
  stores_skipped: number;
  objects: number;
  orphans: number;
  removed: number;
  remove_failed: number;
  stores: StoreImagesOrphanGcStoreResult[];
};

async function listStoreFolderObjects(
  sb: SupabaseClient<any>,
  storeId: string
): Promise<StoreImageObject[] | null> {
  const out: StoreImageObject[] = [];
  for (let offset = 0; ; offset += LIST_PAGE) {
    const { data, error } = await sb.storage
      .from(STORE_PRODUCT_IMAGES_BUCKET)
      .list(storeId, { limit: LIST_PAGE, offset, sortBy: { column: "name", order: "asc" } });
    if (error) return null;
    const rows = data ?? [];
    for (const f of rows) {
      // 하위 폴더(id null)는 업로드 경로 SSOT(`{storeId}/{uuid}.{ext}`) 밖이라 다루지 않는다.
      if (!f || !f.id || !f.name) continue;
      out.push({ path: `${storeId}/${f.name}`, created_at: f.created_at ?? null });
    }
    if (rows.length < LIST_PAGE) break;
  }
  return out;
}

/** O-03 — 매장 이미지 교체 정리도 같은 참조 소스로 판정한다 (fail-closed: 실패 시 ok:false). */
export async function loadStoreImageReferencedPaths(
  sb: SupabaseClient<any>,
  storeId: string
): Promise<{ ok: true; paths: Set<string>; storeExists: boolean } | { ok: false }> {
  const values: unknown[] = [];
  let storeExists = false;
  for (const src of REFERENCE_SOURCES) {
    const { data, error } = await sb.from(src.table).select(src.select).eq(src.column, storeId);
    if (error) {
      if (isMissingTableError(error)) continue;
      console.error("[store-images-orphan-gc] reference query failed", src.table, storeId, error.message);
      return { ok: false };
    }
    const rows = (data ?? []) as unknown[];
    if (src.table === "stores") storeExists = rows.length > 0;
    values.push(...rows);
  }
  return { ok: true, paths: collectStoreImagePathsFromValues(storeId, values), storeExists };
}

/** GC 참조 묶음 읽기 — 매장 이만큼씩 표마다 1번(+쪽 넘김) */
const REF_STORE_CHUNK = 100;
/** 쪽 크기 — 서버 최대 행 수가 더 작아도 빈 쪽이 나올 때까지 실제 받은 행 수만큼 넘긴다 */
const REF_PAGE = 1000;

type StoreRefs = { paths: Set<string>; storeExists: boolean };

/**
 * 2026-11-27 최종 설계 단계 2 — GC 전용 참조 묶음 읽기.
 * 이전: 매장마다 표 6개를 따로 읽음(운영 11-26 하루 826번 · 매장 폴더 약 118개 × 7).
 * 지금: 매장 id 묶음(최대 100)으로 표마다 1번, 1,000행씩 빈 쪽이 나올 때까지 끝까지 읽는다(잘린 응답으로 참조를 놓치지 않게).
 * 판정은 `loadStoreImageReferencedPaths` 와 같다(같은 참조 소스·없는 표는 참조 0·그 밖의 오류는 묶음 전체 건너뜀 = fail-closed).
 * 매장 1곳 정리(O-03)는 기존 `loadStoreImageReferencedPaths` 를 그대로 쓴다.
 */
export async function loadStoreImageReferencedPathsForStores(
  sb: SupabaseClient<any>,
  storeIds: readonly string[]
): Promise<Map<string, StoreRefs> | null> {
  const values = new Map<string, unknown[]>();
  for (const id of storeIds) values.set(id, []);
  const existing = new Set<string>();
  if (!storeIds.length) return new Map();

  for (const src of REFERENCE_SOURCES) {
    const select = src.select === "*" || src.select.split(",").map((c) => c.trim()).includes(src.column)
      ? src.select
      : `${src.select}, ${src.column}`;
    let from = 0;
    let missingTable = false;
    for (;;) {
      const { data, error } = await sb
        .from(src.table)
        .select(select)
        .in(src.column, [...storeIds])
        .order("id", { ascending: true })
        .range(from, from + REF_PAGE - 1);
      if (error) {
        if (isMissingTableError(error)) {
          missingTable = true;
          break;
        }
        console.error("[store-images-orphan-gc] batched reference query failed", src.table, error.message);
        return null;
      }
      const rows = (data ?? []) as unknown as Record<string, unknown>[];
      if (rows.length === 0) break;
      for (const r of rows) {
        const sid = String(r?.[src.column] ?? "");
        const bucket = values.get(sid);
        if (!bucket) continue;
        bucket.push(r);
        if (src.table === "stores") existing.add(sid);
      }
      from += rows.length;
    }
    if (missingTable) continue;
  }

  const out = new Map<string, StoreRefs>();
  for (const id of storeIds) {
    out.set(id, {
      paths: collectStoreImagePathsFromValues(id, values.get(id) ?? []),
      storeExists: existing.has(id),
    });
  }
  return out;
}

export async function runStoreProductImagesOrphanGc(input: {
  sb: SupabaseClient<any>;
  dryRun: boolean;
  nowMs?: number;
  sampleLimit?: number;
}): Promise<{ ok: true; result: StoreImagesOrphanGcResult } | { ok: false; error: "storage_list_failed" }> {
  const { sb, dryRun } = input;
  const nowMs = input.nowMs ?? Date.now();
  const sampleLimit = input.sampleLimit ?? 20;

  const folders: string[] = [];
  for (let offset = 0; ; offset += LIST_PAGE) {
    const { data, error } = await sb.storage
      .from(STORE_PRODUCT_IMAGES_BUCKET)
      .list("", { limit: LIST_PAGE, offset, sortBy: { column: "name", order: "asc" } });
    if (error) {
      console.error("[store-images-orphan-gc] root list failed", error.message);
      return { ok: false, error: "storage_list_failed" };
    }
    const rows = data ?? [];
    for (const f of rows) {
      if (f && !f.id && typeof f.name === "string" && UUID_RE.test(f.name)) folders.push(f.name);
    }
    if (rows.length < LIST_PAGE) break;
  }

  const result: StoreImagesOrphanGcResult = {
    dry_run: dryRun,
    stores_scanned: 0,
    stores_skipped: 0,
    objects: 0,
    orphans: 0,
    removed: 0,
    remove_failed: 0,
    stores: [],
  };

  let chunkRefs: Map<string, StoreRefs> | null = null;
  for (let index = 0; index < folders.length; index++) {
    const storeId = folders[index];
    if (index % REF_STORE_CHUNK === 0) {
      chunkRefs = await loadStoreImageReferencedPathsForStores(sb, folders.slice(index, index + REF_STORE_CHUNK));
    }
    const row: StoreImagesOrphanGcStoreResult = {
      store_id: storeId,
      objects: 0,
      referenced_kept: 0,
      young_kept: 0,
      orphans: 0,
      orphan_sample: [],
      removed: 0,
    };
    const refs = chunkRefs?.get(storeId) ?? null;
    if (!refs || !refs.storeExists) {
      row.skipped = !refs ? "reference_query_failed" : "store_missing";
      result.stores_skipped++;
      result.stores.push(row);
      continue;
    }
    const objects = await listStoreFolderObjects(sb, storeId);
    if (!objects) {
      row.skipped = "list_failed";
      result.stores_skipped++;
      result.stores.push(row);
      continue;
    }
    const plan = planStoreProductImageOrphans({
      storeId,
      objects,
      referencedPaths: refs.paths,
      nowMs,
    });
    row.objects = objects.length;
    row.referenced_kept = plan.keptReferenced;
    row.young_kept = plan.keptYoung;
    row.orphans = plan.orphanPaths.length;
    row.orphan_sample = plan.orphanPaths.slice(0, sampleLimit);

    if (!dryRun && plan.orphanPaths.length > 0) {
      for (let i = 0; i < plan.orphanPaths.length; i += REMOVE_CHUNK) {
        const chunk = plan.orphanPaths.slice(i, i + REMOVE_CHUNK);
        const { error } = await sb.storage.from(STORE_PRODUCT_IMAGES_BUCKET).remove(chunk);
        if (error) {
          console.error("[store-images-orphan-gc] remove failed", storeId, error.message);
          result.remove_failed += chunk.length;
        } else {
          row.removed += chunk.length;
        }
      }
    }

    result.stores_scanned++;
    result.objects += row.objects;
    result.orphans += row.orphans;
    result.removed += row.removed;
    result.stores.push(row);
  }

  return { ok: true, result };
}
