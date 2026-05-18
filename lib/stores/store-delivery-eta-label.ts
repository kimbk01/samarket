import type { AppLanguageCode } from "@/lib/i18n/config";
import { DEFAULT_APP_LANGUAGE } from "@/lib/i18n/config";
import { translate, type MessageKey } from "@/lib/i18n/messages";
import type { CommerceExtrasFromHours } from "@/lib/stores/store-commerce-extras";

function etaT(
  lang: AppLanguageCode,
  key: MessageKey,
  vars?: Record<string, string | number>
): string {
  return translate(lang, key, vars);
}

/** 라이딩 분이 없을 때 목록·카드에 쓰는 조리 중심 라벨 */
export function formatPrepOnlyEtaLabel(
  extras: Pick<CommerceExtrasFromHours, "estPrepLabel">,
  lang: AppLanguageCode = DEFAULT_APP_LANGUAGE
): string | null {
  const p = extras.estPrepLabel?.trim();
  if (!p) return null;
  return etaT(lang, "store_eta_about_label", { label: p });
}

/**
 * 조리(분) + 오토바이 구간(분) 합산 라벨.
 * `rideMinutes` 가 없으면 조리 라벨만 반환한다.
 */
export function buildStoreDeliveryEtaLabel(
  extras: CommerceExtrasFromHours,
  rideMinutes: number | null,
  lang: AppLanguageCode = DEFAULT_APP_LANGUAGE
): string {
  if (rideMinutes == null || !Number.isFinite(rideMinutes) || rideMinutes < 0) {
    return formatPrepOnlyEtaLabel(extras, lang) ?? etaT(lang, "store_eta_about_label", { label: extras.estPrepLabel });
  }
  const prep = extras.prepMinutes ?? 25;
  const total = prep + Math.round(rideMinutes);
  return etaT(lang, "store_eta_about_minutes", { minutes: total });
}

/** Google Routes 없이 조리 + 매장 수기 배달 구간 문구 */
export function buildStoreDeliveryEtaLabelWithManualRide(
  extras: CommerceExtrasFromHours,
  manualRideDisplay: string | null,
  lang: AppLanguageCode = DEFAULT_APP_LANGUAGE
): string {
  const m = manualRideDisplay?.trim() ?? "";
  const prepPart = formatPrepOnlyEtaLabel(extras, lang);
  if (m) {
    if (prepPart) return etaT(lang, "store_eta_prep_delivery_manual", { prep: prepPart, manual: m });
    return etaT(lang, "store_eta_delivery_manual", { manual: m });
  }
  return formatPrepOnlyEtaLabel(extras, lang) ?? etaT(lang, "store_eta_about_label", { label: extras.estPrepLabel });
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
  },
  lang: AppLanguageCode = DEFAULT_APP_LANGUAGE
): string {
  const prepCore =
    extras.prepMinutes != null && Number.isFinite(extras.prepMinutes) ?
      etaT(lang, "store_prep_minutes_unit", { minutes: Math.round(extras.prepMinutes) })
    : (extras.estPrepLabel?.trim() || "");
  const prepLine = prepCore ? etaT(lang, "store_eta_prep_about", { prep: prepCore }) : "";

  const routeCtx = opts?.routeContextPresent === true;
  const delOk = opts?.deliveryAvailable === true;
  const showDeliverySlot = routeCtx && delOk;
  const manual = (opts?.manualRideDisplay ?? "").trim();

  if (rideMinutes != null && Number.isFinite(rideMinutes) && rideMinutes >= 0) {
    const ride = Math.round(rideMinutes);
    if (prepLine) {
      return etaT(lang, "store_eta_prep_delivery_about_minutes", { prep: prepLine, minutes: ride });
    }
    return etaT(lang, "store_eta_delivery_about_minutes", { minutes: ride });
  }

  if (showDeliverySlot) {
    if (manual) {
      if (prepLine) return etaT(lang, "store_eta_prep_delivery_manual", { prep: prepLine, manual });
      return etaT(lang, "store_eta_delivery_manual", { manual });
    }
    if (prepLine) return etaT(lang, "store_eta_prep_delivery_dash", { prep: prepLine });
    return etaT(lang, "store_eta_delivery_dash");
  }

  if (prepLine) return prepLine;
  return formatPrepOnlyEtaLabel(extras, lang) ?? etaT(lang, "store_eta_about_label", { label: extras.estPrepLabel });
}
