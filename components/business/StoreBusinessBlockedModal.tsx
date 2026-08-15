"use client";

import Link from "next/link";
import type { OwnerStoreGateState } from "@/lib/stores/store-admin-access";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import {
  getStoreBusinessBlockedCopy,
  showStoreBusinessApplyLink,
  showStoreBusinessProfilePreviewLink,
} from "@/components/business/store-business-blocked-copy";
import { DibayDialog, DibayOverlayButton } from "@/components/ui/dibay-overlay";
import { OverlayUi } from "@/lib/ui/dibay-overlay-contract";

type Props = {
  open: boolean;
  onClose: () => void;
  state: OwnerStoreGateState;
  firstStoreId?: string;
  /** 기본값: 내 정보로 — 내정보 위 모달에서는 "확인" 등으로 바꿀 수 있음 */
  primaryCloseLabel?: string;
};

export function StoreBusinessBlockedModal({
  open,
  onClose,
  state,
  firstStoreId,
  primaryCloseLabel,
}: Props) {
  const { t } = useI18n();
  const resolvedCloseLabel = primaryCloseLabel ?? t("business_phase7_618");

  const copy = getStoreBusinessBlockedCopy(state);
  const showProfile = showStoreBusinessProfilePreviewLink(state, firstStoreId);
  const showApply = showStoreBusinessApplyLink(state);
  const title = t(copy.titleKey);
  const body = "bodyText" in copy ? copy.bodyText : t(copy.bodyKey);

  return (
    <DibayDialog
      open={open}
      onClose={onClose}
      dismissible
      title={title}
      description={body}
      ariaLabel={title}
    >
      <div className={OverlayUi.actionsStack}>
        <DibayOverlayButton roleTone="primary" onClick={onClose}>
          {resolvedCloseLabel}
        </DibayOverlayButton>
        {showProfile && firstStoreId ? (
          <Link
            href={`/stores/owner/profile?storeId=${encodeURIComponent(firstStoreId)}`}
            onClick={onClose}
            className={`${OverlayUi.btn.secondary} text-center`}
          >
            {t("business_phase7_619")}
          </Link>
        ) : null}
        {showApply ? (
          <Link
            href="/stores/owner/apply"
            onClick={onClose}
            className={`${OverlayUi.btn.secondary} text-center`}
          >
            {t("store_biz_apply_store")}
          </Link>
        ) : null}
      </div>
    </DibayDialog>
  );
}
