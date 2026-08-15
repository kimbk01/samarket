"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { DibayBottomSheet, DibayOverlayButton } from "@/components/ui/dibay-overlay";
import { OverlayUi } from "@/lib/ui/dibay-overlay-contract";

export type TradeBuyerPickCandidate = {
  buyerId: string;
  chatId: string;
  buyerNickname: string;
};

export function TradeBuyerPickerModal({
  open,
  title,
  subtitle,
  candidates,
  onClose,
  onSelect,
}: {
  open: boolean;
  title: string;
  subtitle?: string;
  candidates: TradeBuyerPickCandidate[];
  onClose: () => void;
  onSelect: (c: TradeBuyerPickCandidate) => void;
}) {
  const { t } = useI18n();

  return (
    <DibayBottomSheet open={open} onClose={onClose} title={title} ariaLabel={title}>
      {subtitle ? <p className={`mb-2 ${OverlayUi.bodySecondary}`}>{subtitle}</p> : null}
      <ul className="max-h-[min(60vh,360px)] overflow-y-auto py-1">
        {candidates.map((c) => (
          <li key={c.buyerId}>
            <button
              type="button"
              onClick={() => onSelect(c)}
              className={OverlayUi.actionSheetItem}
            >
              <span className="truncate font-medium">{c.buyerNickname}</span>
              <span className={`ml-auto shrink-0 ${OverlayUi.caption}`}>{t("mypage_comp_select")}</span>
            </button>
          </li>
        ))}
      </ul>
      <div className="mt-3">
        <DibayOverlayButton roleTone="secondary" onClick={onClose}>
          {t("common_cancel")}
        </DibayOverlayButton>
      </div>
    </DibayBottomSheet>
  );
}
