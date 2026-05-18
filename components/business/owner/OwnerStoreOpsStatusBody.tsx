"use client";

import { useRouter } from "next/navigation";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { BusinessOwnerOpsStrip } from "@/components/business/BusinessOwnerOpsStrip";
import { OWNER_STORE_STACK_Y_CLASS } from "@/lib/business/owner-store-stack";
import type { BusinessProfile } from "@/lib/types/business";
import type { StoreRow } from "@/lib/stores/db-store-mapper";

type Props = {
  row: StoreRow;
  profile: BusinessProfile;
  canSell: boolean;
};

export function OwnerStoreOpsStatusBody({ row, profile, canSell }: Props) {
  const { t } = useI18n();
  const router = useRouter();

  return (
    <div className={`max-w-full min-w-0 ${OWNER_STORE_STACK_Y_CLASS}`}>
      <p className="sam-text-helper leading-relaxed text-sam-muted">
        {t("owner_store_ops_intro_before")}{" "}
        <button
          type="button"
          onClick={() =>
            router.push(`/stores/owner/profile?storeId=${encodeURIComponent(row.id)}`)
          }
          className="font-medium text-signature underline"
        >
          {t("owner_store_ops_settings_link")}
        </button>{" "}
        {t("owner_store_ops_intro_after")}
      </p>
      <BusinessOwnerOpsStrip row={row} profile={profile} canSell={canSell} />
    </div>
  );
}
