/**
 * 22단계: 광고 유틸 (라벨, 필터)
 */
export {
  adTargetLabel,
  adPlacementLabel,
  adApplicationStatusLabel,
  adPaymentStatusLabel,
  adPaymentMethodLabel,
  AD_APPLICATION_STATUS_FILTER_VALUES,
  AD_TARGET_LABELS,
  AD_PLACEMENT_LABELS,
  AD_APPLICATION_STATUS_LABELS,
  AD_PAYMENT_STATUS_LABELS,
  AD_PAYMENT_METHOD_LABELS,
  AD_APPLICATION_STATUS_OPTIONS,
} from "@/lib/ads/ad-label-i18n";

import type { AdApplicationStatus } from "@/lib/types/ad-application";

export interface AdminAdApplicationFilters {
  applicationStatus: AdApplicationStatus | "";
}

export function filterAdApplications<T extends { applicationStatus: AdApplicationStatus }>(
  list: T[],
  filters: AdminAdApplicationFilters
): T[] {
  if (!filters.applicationStatus) return [...list];
  return list.filter((a) => a.applicationStatus === filters.applicationStatus);
}
