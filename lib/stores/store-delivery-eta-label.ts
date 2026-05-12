import type { CommerceExtrasFromHours } from "@/lib/stores/store-commerce-extras";

/** 라이딩 분이 없을 때 목록·카드에 쓰는 조리 중심 라벨 */
export function formatPrepOnlyEtaLabel(extras: Pick<CommerceExtrasFromHours, "estPrepLabel">): string | null {
  const p = extras.estPrepLabel?.trim();
  if (!p) return null;
  return `약 ${p}`;
}

/**
 * 조리(분) + 오토바이 구간(분) 합산 라벨.
 * `rideMinutes` 가 없으면 조리 라벨만 반환한다.
 */
export function buildStoreDeliveryEtaLabel(
  extras: CommerceExtrasFromHours,
  rideMinutes: number | null
): string {
  if (rideMinutes == null || !Number.isFinite(rideMinutes) || rideMinutes < 0) {
    return formatPrepOnlyEtaLabel(extras) ?? `약 ${extras.estPrepLabel}`;
  }
  const prep = extras.prepMinutes ?? 25;
  const total = prep + Math.round(rideMinutes);
  return `약 ${total}분`;
}
