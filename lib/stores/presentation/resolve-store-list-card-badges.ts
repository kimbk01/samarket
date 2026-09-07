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
 * CATEGORY / browse / home list badge semantic resolver.
 * - isFeatured → recommended only (instant discount 금지)
 * - pickup/free/out-of-range는 실제 DIBAY 플래그·fee authority만
 * - CUT 9: OOR면 free_delivery 등 주문 가능 암시 뱃지 억제 (후보 집합/랭킹은 변경하지 않음)
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

  const outOfRange = Boolean(input.outOfRangeLabel?.trim());

  if (input.freeDeliveryProven && !outOfRange) {
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

  if (outOfRange && input.outOfRangeLabel) {
    out.push({
      kind: "out_of_range",
      label: input.outOfRangeLabel,
      className: "bg-sam-warning-soft text-sam-warning",
    });
  }

  return out;
}

/** Shared OOR badge copy from discovery DTO fields (no client distance math). */
export function formatStoreCardOutOfRangeLabel(args: {
  distanceOutOfRange: boolean;
  maxDeliveryDistanceKm: number | null | undefined;
  labelWithMax: (km: number) => string;
  labelGeneric: string;
}): string | null {
  if (!args.distanceOutOfRange) return null;
  if (args.maxDeliveryDistanceKm != null && Number.isFinite(args.maxDeliveryDistanceKm)) {
    return args.labelWithMax(args.maxDeliveryDistanceKm);
  }
  return args.labelGeneric;
}
