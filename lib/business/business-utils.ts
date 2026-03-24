/**
 * 21단계: 상점 유틸 (slug, 라벨, 필터)
 */

import type { BusinessProfileStatus } from "@/lib/types/business";

export function slugify(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "");
}

export const BUSINESS_STATUS_LABELS: Record<BusinessProfileStatus, string> = {
  pending: "심사중",
  active: "운영중",
  paused: "일시중지",
  rejected: "반려",
};

export const BUSINESS_STATUS_OPTIONS: {
  value: BusinessProfileStatus | "";
  label: string;
}[] = [
  { value: "", label: "전체" },
  { value: "pending", label: "심사중" },
  { value: "active", label: "운영중" },
  { value: "paused", label: "일시중지" },
  { value: "rejected", label: "반려" },
];

export interface AdminBusinessFilters {
  status: BusinessProfileStatus | "";
}

export function filterBusinessProfiles<T extends { status: BusinessProfileStatus }>(
  list: T[],
  filters: AdminBusinessFilters
): T[] {
  if (!filters.status) return [...list];
  return list.filter((p) => p.status === filters.status);
}
