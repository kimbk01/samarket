import {
  getMergedBrowsePrimaryBySlug,
  getMergedBrowseSubIndustry,
  listMergedBrowsePrimaryIndustries,
  listMergedBrowseSubIndustries,
} from "./browse-industry-merge";
import { BROWSE_MOCK_STORES, getBrowseMockStoreBySlug } from "./mock-browse-stores";
import type { BrowseMockStore, BrowsePrimaryIndustry, BrowseSubIndustry } from "./types";

/** 기본·어드민 추가 업종 병합 (브라우저 저장분은 클라이언트에서만 반영) */
export function listBrowsePrimaryIndustries(): BrowsePrimaryIndustry[] {
  return listMergedBrowsePrimaryIndustries();
}

export function getBrowsePrimaryBySlug(slug: string): BrowsePrimaryIndustry | undefined {
  return getMergedBrowsePrimaryBySlug(slug);
}

export function listBrowseSubIndustries(primarySlug: string): BrowseSubIndustry[] {
  return listMergedBrowseSubIndustries(primarySlug);
}

export function getBrowseSubIndustry(primarySlug: string, subSlug: string): BrowseSubIndustry | undefined {
  return getMergedBrowseSubIndustry(primarySlug, subSlug);
}

export function listBrowseStoresForSub(primarySlug: string, subSlug: string): BrowseMockStore[] {
  return BROWSE_MOCK_STORES.filter(
    (s) => s.primarySlug === primarySlug.trim() && s.subSlug === subSlug.trim()
  );
}

export { getBrowseMockStoreBySlug };
