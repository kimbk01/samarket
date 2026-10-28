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
  /** HB-3 — 매장 행이 없는 폴더의 객체 수(삭제하지 않음 — 보고만, 폴더 삭제는 Owner 승인 후) */
  missing_store_folders: number;
  missing_store_objects: number;
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

async function loadReferencedPaths(
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

/**
 * HB-1 — 행 변경(교체·삭제) 뒤 지울 후보 중 같은 매장의 다른 행(상품·매장·배너·공지 등, GC 와 같은 참조 범위)이
 * 아직 쓰는 파일은 뺀다. 참조 조회가 실패하면 아무것도 지우지 않는다(나중에 GC 가 정리).
 */
export async function dropStillReferencedStoreImageUrls(
  sb: SupabaseClient<any>,
  storeId: string,
  urls: readonly string[]
): Promise<string[]> {
  if (urls.length === 0) return [];
  const refs = await loadReferencedPaths(sb, storeId);
  if (!refs.ok) return [];
  return urls.filter((url) => {
    const paths = collectStoreImagePathsFromValues(storeId, [url]);
    for (const p of paths) if (refs.paths.has(p)) return false;
    return true;
  });
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
    missing_store_folders: 0,
    missing_store_objects: 0,
    stores: [],
  };

  for (const storeId of folders) {
    const row: StoreImagesOrphanGcStoreResult = {
      store_id: storeId,
      objects: 0,
      referenced_kept: 0,
      young_kept: 0,
      orphans: 0,
      orphan_sample: [],
      removed: 0,
    };
    const refs = await loadReferencedPaths(sb, storeId);
    if (!refs.ok || !refs.storeExists) {
      row.skipped = !refs.ok ? "reference_query_failed" : "store_missing";
      if (refs.ok) {
        // HB-3 — 매장 없는 폴더는 지우지 않고 규모만 보고 (이전에는 객체 수 0 으로 숨겨짐)
        const missingObjects = await listStoreFolderObjects(sb, storeId);
        row.objects = missingObjects?.length ?? 0;
        row.orphan_sample = (missingObjects ?? []).slice(0, sampleLimit).map((o) => o.path);
        result.missing_store_folders++;
        result.missing_store_objects += row.objects;
      }
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
