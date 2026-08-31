"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { DeliveryAdLifecycleStatus } from "@/lib/stores/advertising/delivery-ad-lifecycle";
import { ownerLifecycleStatusI18nKey } from "@/lib/stores/advertising/owner-store-sponsored-contract";
import {
  DELIVERY_AD_OWNER_STATUS_BADGE_CLASS,
  ownerDeliveryAdStatusBadgeTone,
} from "@/lib/stores/advertising/delivery-ad-owner-ui-presentation";

export function DeliveryAdOwnerStatusBadge({
  status,
}: {
  status: DeliveryAdLifecycleStatus;
}) {
  const { t } = useI18n();
  const tone = ownerDeliveryAdStatusBadgeTone(status);
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-ui-rect border px-2 py-0.5 text-[11px] font-semibold ${DELIVERY_AD_OWNER_STATUS_BADGE_CLASS[tone]}`}
      data-owner-ads-status-badge={status}
    >
      {t(ownerLifecycleStatusI18nKey(status))}
    </span>
  );
}
