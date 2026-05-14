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

/** Google Routes 없이 조리 + 매장 수기 배달 구간 문구 */
export function buildStoreDeliveryEtaLabelWithManualRide(
  extras: CommerceExtrasFromHours,
  manualRideDisplay: string | null
): string {
  const m = manualRideDisplay?.trim() ?? "";
  const prepPart = formatPrepOnlyEtaLabel(extras);
  if (m) {
    if (prepPart) return `${prepPart} · 배달 ${m}`;
    return `배달 ${m}`;
  }
  return formatPrepOnlyEtaLabel(extras) ?? `약 ${extras.estPrepLabel}`;
}

/**
 * browse 목록 카드 시간 줄 — **조리**와 **배달(라이딩)** 을 한 줄에 분리.
 * `rideMinutes` 없으면 조리만(또는 레거시 `약 …분` 한 줄).
 * `routeContextPresent` 이고 배달 가능이면 matrix 실패 시에도 `배달 —` 로 자리를 표시한다.
 */
export function buildBrowseStoreListEtaLabel(
  extras: CommerceExtrasFromHours,
  rideMinutes: number | null,
  opts?: {
    deliveryAvailable?: boolean;
    routeContextPresent?: boolean;
    /** 전역 store 모드일 때만 호출부에서 넘김 — 목록 `배달 —` 대체 */
    manualRideDisplay?: string | null;
  }
): string {
  const prepCore =
    extras.prepMinutes != null && Number.isFinite(extras.prepMinutes) ?
      `${Math.round(extras.prepMinutes)}분`
    : (extras.estPrepLabel?.trim() || "");
  const prepLine = prepCore ? `조리 약 ${prepCore}` : "";

  const routeCtx = opts?.routeContextPresent === true;
  const delOk = opts?.deliveryAvailable === true;
  const showDeliverySlot = routeCtx && delOk;
  const manual = (opts?.manualRideDisplay ?? "").trim();

  if (rideMinutes != null && Number.isFinite(rideMinutes) && rideMinutes >= 0) {
    if (prepLine) return `${prepLine} · 배달 약 ${Math.round(rideMinutes)}분`;
    return `배달 약 ${Math.round(rideMinutes)}분`;
  }

  if (showDeliverySlot) {
    if (manual) {
      if (prepLine) return `${prepLine} · 배달 ${manual}`;
      return `배달 ${manual}`;
    }
    if (prepLine) return `${prepLine} · 배달 —`;
    return `배달 —`;
  }

  if (prepLine) return prepLine;
  return formatPrepOnlyEtaLabel(extras) ?? `약 ${extras.estPrepLabel}`;
}
