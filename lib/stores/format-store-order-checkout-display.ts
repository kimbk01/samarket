/** 주문 카드·상세 — 체크아웃 시점 Routes 기반 요약 (DB 스냅샷) */
import type { AppLanguageCode } from "@/lib/i18n/config";
import { translate } from "@/lib/i18n/messages";
import { getRuntimeAppLanguage } from "@/lib/i18n/runtime-app-language";

export function formatCheckoutRouteKmFromMeters(m: number | null | undefined): string | null {
  if (m == null || !Number.isFinite(m) || m < 0) return null;
  if (m < 1000) return `${Math.round(m)}m`;
  return `${(m / 1000).toFixed(1)}km`;
}

/**
 * 문구는 `formatStoreOrderCheckoutEtaSummaryI18n`(`lib/mypage/store-order-detail-i18n.ts`)과 같은 키.
 * `language` 를 넘기지 않으면 화면 언어.
 */
export function formatStoreOrderCheckoutEtaSummary(
  args: {
    checkout_eta_minutes?: number | null;
    checkout_route_distance_meters?: number | null;
  },
  language: AppLanguageCode = getRuntimeAppLanguage()
): string | null {
  const eta = args.checkout_eta_minutes;
  const dist = formatCheckoutRouteKmFromMeters(args.checkout_route_distance_meters);
  const etaOk = eta != null && Number.isFinite(eta) && eta > 0;
  if (etaOk && dist) {
    return translate(language, "mypage_comp_checkout_eta_minutes_distance", {
      minutes: Math.round(eta),
      distance: dist,
    });
  }
  if (etaOk) return translate(language, "mypage_comp_checkout_eta_minutes_only", { minutes: Math.round(eta) });
  if (dist) return translate(language, "mypage_comp_checkout_route_distance_only", { distance: dist });
  return null;
}
