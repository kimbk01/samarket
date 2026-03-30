import {
  getMergedBrowsePrimaryBySlug,
  getMergedBrowseSubIndustry,
  listMergedBrowsePrimaryIndustries,
  listMergedBrowseSubIndustries,
} from "./browse-industry-merge";
import type { BrowsePrimaryIndustry, BrowseSubIndustry } from "./types";

/** 기본·어드민 추가 업종 병합 (브라우저 저장분은 클라이언트에서만 반영). 매장 목록은 DB(`/api/stores/browse`)만 사용. */
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
