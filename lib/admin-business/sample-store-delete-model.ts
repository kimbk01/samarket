/**
 * 3-C §9-4 — 관리자 샘플 매장 삭제: 미리보기 형태·결과 분류·Storage 삭제 계획 (순수 · 클라이언트 안전).
 * DB 함수: `admin_sample_store_delete_preview` (DB-4) · `admin_delete_sample_store` (DB-5)
 * 마이그레이션 `20270708130000_admin_sample_store_delete.sql`.
 */
import { isCanonicalDerivativePath } from "@/lib/media/canonical-image-path";
import { storeImageBaseKey } from "@/lib/stores/store-product-images-orphan-gc";
import { isStoreOwnedImageStoragePath } from "@/lib/stores/store-owned-image-urls";

export const SAMPLE_STORE_DELETE_MAX = 500;

export type SampleStoreImageRef = { path: string; shared: boolean };

export type SampleStoreBlockingRef = {
  constraint: string;
  table: string;
  count: number;
  level?: number;
  via?: string;
};

export type SampleStoreDeletePreview = {
  store_id: string;
  exists: boolean;
  store_kind?: string | null;
  store_name?: string | null;
  slug?: string | null;
  approval_status?: string | null;
  is_visible?: boolean | null;
  menu_count?: number;
  option_count?: number;
  section_count?: number;
  images?: SampleStoreImageRef[];
  image_count?: number;
  shared_image_count?: number;
  banner_campaigns?: { id: string; lifecycle_status: string | null }[];
  banner_campaign_live_count?: number;
  paid_campaign_count?: number;
  ad_creative_count?: number;
  coupon_count?: number;
  coupon_live_count?: number;
  promotion_count?: number;
  promotion_active_count?: number;
  favorite_count?: number;
  blocking_refs?: SampleStoreBlockingRef[];
  deletable: boolean;
  reasons: string[];
};

export type SampleStoreDeleteOutcome = "deleted" | "already_deleted" | "blocked" | "failed";

export type SampleStoreDeleteResult = {
  store_id: string;
  store_name?: string | null;
  outcome: SampleStoreDeleteOutcome;
  reasons?: string[];
  error?: string;
  menu_count?: number;
  image_count?: number;
  storage_removed?: number;
  storage_failed?: string[];
  storage_skipped_shared?: number;
};

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** DB jsonb → 미리보기 (형식이 틀린 행은 삭제 불가로 둔다 — fail-closed). */
export function normalizeSampleStoreDeletePreview(raw: unknown): SampleStoreDeletePreview | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const storeId = typeof r.store_id === "string" ? r.store_id : "";
  if (!storeId) return null;
  const images = Array.isArray(r.images)
    ? (r.images as unknown[])
        .map((x) => {
          const o = x as { path?: unknown; shared?: unknown };
          return typeof o?.path === "string" ? { path: o.path, shared: o.shared !== false } : null;
        })
        .filter((x): x is SampleStoreImageRef => x != null)
    : [];
  const reasons = Array.isArray(r.reasons) ? (r.reasons as unknown[]).map((x) => String(x)) : [];
  const exists = r.exists === true;
  return {
    store_id: storeId,
    exists,
    store_kind: typeof r.store_kind === "string" ? r.store_kind : null,
    store_name: typeof r.store_name === "string" ? r.store_name : null,
    slug: typeof r.slug === "string" ? r.slug : null,
    approval_status: typeof r.approval_status === "string" ? r.approval_status : null,
    is_visible: typeof r.is_visible === "boolean" ? r.is_visible : null,
    menu_count: num(r.menu_count),
    option_count: num(r.option_count),
    section_count: num(r.section_count),
    images,
    image_count: images.length,
    shared_image_count: images.filter((i) => i.shared).length,
    banner_campaigns: Array.isArray(r.banner_campaigns)
      ? (r.banner_campaigns as { id?: unknown; lifecycle_status?: unknown }[]).map((c) => ({
          id: String(c?.id ?? ""),
          lifecycle_status: c?.lifecycle_status == null ? null : String(c.lifecycle_status),
        }))
      : [],
    banner_campaign_live_count: num(r.banner_campaign_live_count),
    paid_campaign_count: num(r.paid_campaign_count),
    ad_creative_count: num(r.ad_creative_count),
    coupon_count: num(r.coupon_count),
    coupon_live_count: num(r.coupon_live_count),
    promotion_count: num(r.promotion_count),
    promotion_active_count: num(r.promotion_active_count),
    favorite_count: num(r.favorite_count),
    blocking_refs: Array.isArray(r.blocking_refs) ? (r.blocking_refs as SampleStoreBlockingRef[]) : [],
    // 서버 판정 + 샘플 여부를 TS 에서도 다시 본다 (화면 값 신뢰 안 함 — 3중 보호의 1단계)
    deletable: exists && r.deletable === true && r.store_kind === "sample" && reasons.length === 0,
    reasons: exists ? reasons : reasons.length ? reasons : ["not_found"],
  };
}

export type SampleStoreDeletePreviewSummary = {
  requested: number;
  existing: number;
  deletable: number;
  blocked: number;
  missing: number;
  menu_count: number;
  option_count: number;
  section_count: number;
  image_count: number;
  shared_image_count: number;
  favorite_count: number;
  banner_campaign_count: number;
  coupon_count: number;
  promotion_count: number;
};

export function summarizeSampleStoreDeletePreview(
  previews: readonly SampleStoreDeletePreview[]
): SampleStoreDeletePreviewSummary {
  const s: SampleStoreDeletePreviewSummary = {
    requested: previews.length,
    existing: 0,
    deletable: 0,
    blocked: 0,
    missing: 0,
    menu_count: 0,
    option_count: 0,
    section_count: 0,
    image_count: 0,
    shared_image_count: 0,
    favorite_count: 0,
    banner_campaign_count: 0,
    coupon_count: 0,
    promotion_count: 0,
  };
  for (const p of previews) {
    if (!p.exists) {
      s.missing++;
      continue;
    }
    s.existing++;
    if (p.deletable) s.deletable++;
    else s.blocked++;
    s.menu_count += p.menu_count ?? 0;
    s.option_count += p.option_count ?? 0;
    s.section_count += p.section_count ?? 0;
    s.image_count += p.image_count ?? 0;
    s.shared_image_count += p.shared_image_count ?? 0;
    s.favorite_count += p.favorite_count ?? 0;
    s.banner_campaign_count += p.banner_campaigns?.length ?? 0;
    s.coupon_count += p.coupon_count ?? 0;
    s.promotion_count += p.promotion_count ?? 0;
  }
  return s;
}

/** 확인 토큰 원문 — 대상 id·존재·유형·건수·삭제 가능 여부. 미리보기 후 하나라도 바뀌면 토큰이 달라진다. */
export function sampleStoreDeleteTokenSource(previews: readonly SampleStoreDeletePreview[]): string {
  return [...previews]
    .sort((a, b) => a.store_id.localeCompare(b.store_id))
    .map((p) =>
      [
        p.store_id,
        p.exists ? 1 : 0,
        p.store_kind ?? "",
        p.menu_count ?? 0,
        p.option_count ?? 0,
        p.section_count ?? 0,
        p.image_count ?? 0,
        p.shared_image_count ?? 0,
        p.deletable ? 1 : 0,
        [...p.reasons].sort().join("+"),
      ].join("|")
    )
    .join("\n");
}

export type SampleStoreStoragePlan = {
  /** 원본 경로 — 원본 + 표준 파생본(hero·feed)을 함께 지운다 */
  originals: string[];
  /** 원본 없이 파생본만 참조된 경로 — 그 경로만 지운다 */
  derivativesOnly: string[];
  /** 다른 행이 참조해 보존한 경로 수 */
  skippedShared: number;
  /** 매장 폴더 밖이라 건드리지 않은 경로 수 */
  skippedForeign: number;
};

/**
 * ⑤ Storage — 트랜잭션 후 「다른 행이 참조하지 않는 파일」만 삭제 대상.
 * 원본·파생본은 같은 기본 키로 묶고, 묶음 중 하나라도 공유면 묶음 전체 보존.
 */
export function planSampleStoreStorageRemoval(
  storeId: string,
  images: readonly SampleStoreImageRef[]
): SampleStoreStoragePlan {
  const plan: SampleStoreStoragePlan = { originals: [], derivativesOnly: [], skippedShared: 0, skippedForeign: 0 };
  const groups = new Map<string, { paths: string[]; shared: boolean }>();
  for (const img of images) {
    const path = String(img.path ?? "").trim();
    if (!path || !isStoreOwnedImageStoragePath(storeId, path)) {
      plan.skippedForeign++;
      continue;
    }
    const key = storeImageBaseKey(path);
    const g = groups.get(key) ?? { paths: [], shared: false };
    g.paths.push(path);
    if (img.shared) g.shared = true;
    groups.set(key, g);
  }
  for (const g of groups.values()) {
    if (g.shared) {
      plan.skippedShared += g.paths.length;
      continue;
    }
    const originals = g.paths.filter((p) => !isCanonicalDerivativePath(p));
    if (originals.length > 0) plan.originals.push(...originals);
    else plan.derivativesOnly.push(...g.paths);
  }
  plan.originals.sort();
  plan.derivativesOnly.sort();
  return plan;
}

export function summarizeSampleStoreDeleteResults(results: readonly SampleStoreDeleteResult[]): {
  requested: number;
  deleted: number;
  already_deleted: number;
  blocked: number;
  failed: number;
} {
  const count = (o: SampleStoreDeleteOutcome) => results.filter((r) => r.outcome === o).length;
  return {
    requested: results.length,
    deleted: count("deleted"),
    already_deleted: count("already_deleted"),
    blocked: count("blocked"),
    failed: count("failed"),
  };
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function parseSampleStoreDeleteIds(
  raw: unknown
): { ok: true; ids: string[] } | { ok: false; error: "store_ids_required" | "too_many_store_ids" } {
  if (!Array.isArray(raw)) return { ok: false, error: "store_ids_required" };
  const ids = [...new Set(raw.map((x) => String(x ?? "").trim().toLowerCase()).filter((x) => UUID_RE.test(x)))];
  if (ids.length === 0) return { ok: false, error: "store_ids_required" };
  if (ids.length > SAMPLE_STORE_DELETE_MAX) return { ok: false, error: "too_many_store_ids" };
  return { ok: true, ids };
}

/** 삭제 불가 사유 코드 → 관리자 문구 */
export function sampleStoreDeleteReasonLabel(code: string, ko: boolean): string {
  const map: Record<string, [string, string]> = {
    not_found: ["이미 없는 매장", "Store not found"],
    not_sample_store: ["샘플 매장이 아님 (실제·테스트 매장 보호)", "Not a sample store"],
    restrict_references: ["주문·정산·캐시 등 보존 데이터가 연결됨", "Linked records must be kept"],
    ad_campaign_not_ended: ["진행 중인 광고 캠페인 — 먼저 종료 필요", "Ad campaign not ended"],
    paid_ad_history_would_cascade: ["유료 광고 이력이 함께 지워짐 — 삭제 불가", "Paid ad history would be removed"],
  };
  const hit = map[code];
  return hit ? (ko ? hit[0] : hit[1]) : code;
}
