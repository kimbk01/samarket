import { STORES_BROWSE_SUB_ALL, storesBrowsePath } from "@/components/stores/browse/stores-browse-paths";
import { readStoreDetailBrowseOrigin } from "@/lib/dibay/store-detail-browse-origin";
import { getBrowsePrimaryBySlug, listBrowsePrimaryIndustries } from "@/lib/stores/browse-taxonomy-seed-queries";

const DEFAULT_PRIMARY_SLUG = "restaurant";

export type StoreBrowseListHrefInput = {
  storeSlug?: string | null;
  storeCategorySlug?: string | null;
  businessType?: string | null;
};

type RelSlug = { slug?: string | null } | null | undefined;

function embedCategorySlug(rel: RelSlug | RelSlug[]): string | null {
  if (rel == null) return null;
  if (Array.isArray(rel)) return embedCategorySlug(rel[0]);
  const s = String(rel.slug ?? "").trim().toLowerCase();
  return s || null;
}

/** browse API·오너 폼과 동일 — `식당 · 한식` 등 */
function normalizeBizTypeSeparators(raw: string): string {
  return raw
    .trim()
    .replace(/\s*[\u00B7\u2219‧･]\s*/g, " · ")
    .replace(/\s*[-–—|]\s*/g, " · ");
}

function resolvePrimarySlugFromBusinessType(businessType: string | null | undefined): string | null {
  const bt = (businessType ?? "").trim();
  if (!bt) return null;
  const primaries = listBrowsePrimaryIndustries();
  const norm = normalizeBizTypeSeparators(bt);
  const parts = norm.split(" · ").map((s) => s.trim()).filter(Boolean);
  const head = (parts[0] ?? norm).toLowerCase();
  for (const p of primaries) {
    const slug = p.slug.toLowerCase();
    const name = p.nameKo.trim().toLowerCase();
    if (head === slug || head === name) return p.slug;
  }
  const lower = bt.toLowerCase();
  for (const p of primaries) {
    if (lower.includes(p.slug.toLowerCase()) || lower.includes(p.nameKo.trim().toLowerCase())) {
      return p.slug;
    }
  }
  return null;
}

function normalizePrimarySlug(candidate: string | null | undefined): string {
  const raw = (candidate ?? "").trim().toLowerCase();
  if (!raw) return DEFAULT_PRIMARY_SLUG;
  return getBrowsePrimaryBySlug(raw)?.slug ?? raw;
}

/**
 * 매장 상세 뒤로가기 — browse 진입 시 저장한 1·2차 업종 목록으로 복귀.
 */
export function resolveStoreBrowseListHref(input: StoreBrowseListHrefInput): string {
  const slug = input.storeSlug?.trim();
  const fromSession = slug ? readStoreDetailBrowseOrigin(slug) : null;
  const fromCategory = input.storeCategorySlug?.trim()
    ? normalizePrimarySlug(input.storeCategorySlug)
    : null;
  const bizPrimary = resolvePrimarySlugFromBusinessType(input.businessType);
  const fromBiz = bizPrimary ? normalizePrimarySlug(bizPrimary) : null;

  const primary =
    (fromSession?.primarySlug && getBrowsePrimaryBySlug(fromSession.primarySlug)
      ? fromSession.primarySlug
      : null) ??
    fromCategory ??
    fromBiz ??
    DEFAULT_PRIMARY_SLUG;

  const sub = fromSession?.subSlug ?? STORES_BROWSE_SUB_ALL;
  return storesBrowsePath(normalizePrimarySlug(primary), sub);
}

export function storeCategorySlugFromStoreRow(
  store: {
    store_categories?: RelSlug | RelSlug[];
    business_type?: string | null;
  } | null
): string | null {
  if (!store) return null;
  return embedCategorySlug(store.store_categories as RelSlug | RelSlug[]);
}

export function resolveStoreBrowseListHrefFromStore(
  store: {
    slug: string;
    store_categories?: RelSlug | RelSlug[];
    business_type?: string | null;
  } | null
): string {
  if (!store?.slug?.trim()) return storesBrowsePath(DEFAULT_PRIMARY_SLUG, "all");
  return resolveStoreBrowseListHref({
    storeSlug: store.slug,
    storeCategorySlug: storeCategorySlugFromStoreRow(store),
    businessType: store.business_type ?? null,
  });
}
