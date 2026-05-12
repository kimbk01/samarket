/** 주문 카드·상세 — 체크아웃 시점 Routes 기반 요약 (DB 스냅샷) */

export function formatCheckoutRouteKmFromMeters(m: number | null | undefined): string | null {
  if (m == null || !Number.isFinite(m) || m < 0) return null;
  if (m < 1000) return `${Math.round(m)}m`;
  return `${(m / 1000).toFixed(1)}km`;
}

export function formatStoreOrderCheckoutEtaSummary(args: {
  checkout_eta_minutes?: number | null;
  checkout_route_distance_meters?: number | null;
}): string | null {
  const eta = args.checkout_eta_minutes;
  const dist = formatCheckoutRouteKmFromMeters(args.checkout_route_distance_meters);
  const etaOk = eta != null && Number.isFinite(eta) && eta > 0;
  if (etaOk && dist) return `예상 배달 약 ${Math.round(eta)}분 · 경로 ${dist}`;
  if (etaOk) return `예상 배달 약 ${Math.round(eta)}분`;
  if (dist) return `경로 ${dist}`;
  return null;
}
