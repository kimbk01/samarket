/**
 * 3-E PRD-16 — `store-product-images/{storeId}/` 고아 객체 판정 (순수 · 테스트 대상).
 *
 * 오너 폼은 저장 전에 이미지를 먼저 올리므로(`upload-image` 라우트, DB 미갱신) 저장 실패·취소 시 객체가 남는다.
 * 판정 규칙:
 * - 소유 경로만 대상: `isStoreOwnedImageStoragePath` (P0-4 · `store-owned-image-urls.ts` 재사용).
 * - 참조 집합: 매장 행·상품(삭제 상태 포함 — soft delete 보존 계약 `canonical-image-lifecycle.server.ts`)·
 *   배너·공지·상품권 행 전체를 문자열로 훑어 `store-product-images/{storeId}/…` 경로를 모은다
 *   (알려지지 않은 이미지 컬럼이 생겨도 참조로 잡히도록 행 전체 스캔).
 * - 원본과 파생본(`.hero.webp` 등)은 같은 기본 키로 묶는다 — 원본이 참조되면 파생본도 보존.
 * - 생성 후 24시간이 지나지 않았거나 생성 시각을 모르면 보존 (업로드 직후 저장 중인 폼 보호).
 */
import { CANONICAL_DERIVATIVE_SUFFIX, STORE_PRODUCT_IMAGES_BUCKET } from "@/lib/media/canonical-image-contract";
import { isStoreOwnedImageStoragePath } from "@/lib/stores/store-owned-image-urls";

export const STORE_IMAGE_ORPHAN_MIN_AGE_MS = 24 * 60 * 60 * 1000;

const PATH_IN_TEXT_RE = new RegExp(`${STORE_PRODUCT_IMAGES_BUCKET}/([^"'\\s?#)\\\\<>,]+)`, "g");

/** 행(또는 임의 값) 안의 이 매장 소유 storage 경로 집합 */
export function collectStoreImagePathsFromValues(storeId: string, values: Iterable<unknown>): Set<string> {
  const out = new Set<string>();
  for (const v of values) {
    if (v == null) continue;
    let text: string;
    try {
      text = typeof v === "string" ? v : JSON.stringify(v);
    } catch {
      continue;
    }
    if (!text || !text.includes(STORE_PRODUCT_IMAGES_BUCKET)) continue;
    for (const m of text.matchAll(PATH_IN_TEXT_RE)) {
      const path = m[1] ?? "";
      if (isStoreOwnedImageStoragePath(storeId, path)) out.add(path);
    }
  }
  return out;
}

/** 원본·파생본 공통 키: 파생 접미사 또는 확장자를 뗀 경로 */
export function storeImageBaseKey(path: string): string {
  const p = path.trim();
  const lower = p.toLowerCase();
  for (const suffix of Object.values(CANONICAL_DERIVATIVE_SUFFIX)) {
    if (lower.endsWith(suffix)) return p.slice(0, -suffix.length);
  }
  return p.replace(/\.[^./]+$/, "");
}

export type StoreImageObject = { path: string; created_at: string | null };

export type StoreImageOrphanPlan = {
  orphanPaths: string[];
  keptReferenced: number;
  keptYoung: number;
  skippedUnsafe: number;
};

export function planStoreProductImageOrphans(input: {
  storeId: string;
  objects: StoreImageObject[];
  referencedPaths: Iterable<string>;
  nowMs: number;
  minAgeMs?: number;
}): StoreImageOrphanPlan {
  const minAge = input.minAgeMs ?? STORE_IMAGE_ORPHAN_MIN_AGE_MS;
  const refKeys = new Set<string>();
  for (const p of input.referencedPaths) refKeys.add(storeImageBaseKey(p));

  const plan: StoreImageOrphanPlan = { orphanPaths: [], keptReferenced: 0, keptYoung: 0, skippedUnsafe: 0 };
  for (const obj of input.objects) {
    if (!isStoreOwnedImageStoragePath(input.storeId, obj.path)) {
      plan.skippedUnsafe++;
      continue;
    }
    if (refKeys.has(storeImageBaseKey(obj.path))) {
      plan.keptReferenced++;
      continue;
    }
    const created = obj.created_at ? Date.parse(obj.created_at) : NaN;
    if (!Number.isFinite(created) || input.nowMs - created < minAge) {
      plan.keptYoung++;
      continue;
    }
    plan.orphanPaths.push(obj.path);
  }
  return plan;
}

/** 실삭제는 Owner 승인 후 env 로만 켠다 (D-5 — Storage 데이터 삭제). 기본 dry-run. */
export function isStoreProductImagesOrphanGcDeleteEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.STORE_PRODUCT_IMAGES_ORPHAN_GC_DELETE_ENABLED?.trim() === "1";
}
