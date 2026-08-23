export type StoreListCardBadgeKind =
  | "status"
  | "recommended"
  | "free_delivery"
  | "pickup"
  | "out_of_range";

export type StoreListCardBadge = {
  kind: StoreListCardBadgeKind;
  label: string;
  className: string;
};

export type ResolveStoreListCardBadgesInput = {
  statusLabel: string;
  statusClassName: string;
  /** `isFeatured` — discount 아님. 추천 semantic만. */
  isFeatured: boolean;
  recommendedLabel: string;
  pickupAvailable: boolean;
  pickupLabel: string;
  /** fee authority가 free를 증명한 경우에만 true */
  freeDeliveryProven: boolean;
  freeDeliveryLabel: string;
  outOfRangeLabel: string | null;
};

/**
 * CATEGORY / browse list badge semantic resolver.
 * - isFeatured → recommended only (instant discount 금지)
 * - pickup/free/out-of-range는 실제 DIBAY 플래그·fee authority만
 */
export function resolveStoreListCardBadges(
  input: ResolveStoreListCardBadgesInput
): StoreListCardBadge[] {
  const out: StoreListCardBadge[] = [
    {
      kind: "status",
      label: input.statusLabel,
      className: input.statusClassName,
    },
  ];

  if (input.isFeatured) {
    out.push({
      kind: "recommended",
      label: input.recommendedLabel,
      className: "bg-sam-warning-soft text-sam-warning",
    });
  }

  if (input.freeDeliveryProven) {
    out.push({
      kind: "free_delivery",
      label: input.freeDeliveryLabel,
      className: "bg-sam-success-soft text-sam-success",
    });
  }

  if (input.pickupAvailable) {
    out.push({
      kind: "pickup",
      label: input.pickupLabel,
      className: "bg-sam-surface-muted text-sam-muted",
    });
  }

  if (input.outOfRangeLabel) {
    out.push({
      kind: "out_of_range",
      label: input.outOfRangeLabel,
      className: "bg-sam-warning-soft text-sam-warning",
    });
  }

  return out;
}
