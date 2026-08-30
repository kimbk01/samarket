"use client";

/**
 * PRODUCT CUT 2 — Policy slot visual (not campaign preview).
 * Shows organic × N → ad slot using resolved interval/max only.
 */

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { buildPolicySlotMarkerSequence } from "@/lib/stores/advertising/delivery-ad-placement-preview";

export function DeliveryAdPolicySlotPreview({
  intervalEveryN,
  maxInsertion,
  surfaceEnabled,
}: {
  intervalEveryN: number;
  maxInsertion: number | null;
  surfaceEnabled: boolean;
}) {
  const { t } = useI18n();
  const markers = buildPolicySlotMarkerSequence({ intervalEveryN, maxInsertion });
  const organicCount = markers.filter((m) => m === "organic").length;
  const adSlots = markers.filter((m) => m === "ad_slot").length;

  return (
    <div
      className="rounded-ui-rect border border-sam-border bg-sam-app p-3"
      data-delivery-ad-policy-slot-preview="true"
      aria-label={t("delivery_ads_policy_slot_preview_aria")}
    >
      <p className="text-[12px] font-bold text-sam-fg">{t("delivery_ads_policy_slot_preview_title")}</p>
      {!surfaceEnabled ? (
        <p className="mt-2 text-[12px] text-amber-800">{t("delivery_ads_preview_surface_disabled")}</p>
      ) : null}
      <ul className="mt-3 space-y-1.5">
        {markers.map((m, i) =>
          m === "organic" ? (
            <li
              key={`o-${i}`}
              className="rounded-ui-rect border border-dashed border-sam-border bg-sam-surface px-3 py-2 text-[12px] text-sam-muted"
            >
              {t("delivery_ads_policy_slot_organic")}
            </li>
          ) : (
            <li
              key={`a-${i}`}
              className="rounded-ui-rect border border-signature/40 bg-signature/5 px-3 py-2 text-[12px] font-semibold text-signature"
            >
              {t("delivery_ads_policy_slot_ad")}
            </li>
          )
        )}
      </ul>
      <p className="mt-2 text-[11px] text-sam-muted">
        {t("delivery_ads_policy_slot_summary")
          .replace("{organic}", String(Math.max(0, organicCount - (adSlots > 0 ? 1 : 0))))
          .replace("{interval}", String(intervalEveryN))
          .replace("{max}", maxInsertion == null ? "—" : String(maxInsertion))}
      </p>
    </div>
  );
}
