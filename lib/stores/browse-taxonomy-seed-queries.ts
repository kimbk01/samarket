/**
 * taxonomy API 미로드 시 UI·href 해석용 시드 catalog (localStorage mock 병합 없음).
 * authoritative: GET `/api/stores/taxonomy`
 */
import {
  BROWSE_PRIMARY_INDUSTRIES,
  BROWSE_SUB_INDUSTRIES,
} from "@/lib/stores/admin-store-taxonomy-seed-catalog";
import type { BrowsePrimaryIndustry, BrowseSubIndustry } from "@/lib/stores/browse-taxonomy-ui-types";

export function listBrowsePrimaryIndustries(): BrowsePrimaryIndustry[] {
  return [...BROWSE_PRIMARY_INDUSTRIES].sort((a, b) => a.sortOrder - b.sortOrder);
}

export function getBrowsePrimaryBySlug(slug: string): BrowsePrimaryIndustry | undefined {
  const pk = slug.trim().toLowerCase();
  return listBrowsePrimaryIndustries().find((p) => p.slug.toLowerCase() === pk);
}

export function listBrowseSubIndustries(primarySlug: string): BrowseSubIndustry[] {
  const pk = primarySlug.trim().toLowerCase();
  return BROWSE_SUB_INDUSTRIES.filter((s) => s.primarySlug.toLowerCase() === pk).sort(
    (a, b) => a.sortOrder - b.sortOrder
  );
}

export function getBrowseSubIndustry(
  primarySlug: string,
  subSlug: string
): BrowseSubIndustry | undefined {
  const sk = subSlug.trim().toLowerCase();
  return listBrowseSubIndustries(primarySlug).find((s) => s.slug.toLowerCase() === sk);
}
