"use client";

import { useState } from "react";
import { MoreHorizontal, Pencil, Share2, Trash2 } from "lucide-react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { OverlayUi } from "@/lib/ui/dibay-overlay-contract";
import { useRegisterOpenOverlay } from "@/lib/ui/use-register-open-overlay";

type Props = {
  onShare: () => void;
  onDelete: () => void;
  onEdit?: () => void;
  deleteBusy?: boolean;
};

export function CommunityOwnPostMoreMenu({
  onShare,
  onDelete,
  onEdit,
  deleteBusy = false,
}: Props) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  /** 재감사 S-2 (G-8 마무리): 메뉴가 열려 있으면 팝업 광고를 띄우지 않는다 */
  useRegisterOpenOverlay(open);
  const itemClass = OverlayUi.popoverItem;

  return (
    <div className="relative shrink-0">
      <button
        type="button"
        className="flex h-9 w-9 items-center justify-center rounded-full text-[var(--cm-text-secondary)] hover:bg-[var(--cm-page-bg)]"
        aria-label={t("community_more_aria")}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <MoreHorizontal className="h-5 w-5" strokeWidth={1.8} />
      </button>
      {open ? (
        <>
          <button
            type="button"
            className="fixed inset-0 z-40 cursor-default bg-black/20"
            aria-label={t("common_close")}
            onClick={() => setOpen(false)}
          />
          <ul
            className="absolute right-0 top-full z-50 mt-1 min-w-[11rem] overflow-hidden max-w-[min(92vw,280px)] rounded-[length:var(--overlay-radius-md)] border border-[color:var(--overlay-border)] bg-[color:var(--overlay-surface)] text-[color:var(--overlay-text-primary)] shadow-[var(--overlay-elevation-2)]"
            role="menu"
          >
            {onEdit ? (
              <li role="none">
                <button
                  type="button"
                  role="menuitem"
                  className={itemClass}
                  onClick={() => {
                    setOpen(false);
                    onEdit();
                  }}
                >
                  <Pencil className="h-4 w-4 shrink-0" />
                  {t("common_edit")}
                </button>
              </li>
            ) : null}
            <li role="none">
              <button
                type="button"
                role="menuitem"
                className={itemClass}
                onClick={() => {
                  setOpen(false);
                  onShare();
                }}
              >
                <Share2 className="h-4 w-4 shrink-0" />
                {t("community_share_label")}
              </button>
            </li>
            <li role="none">
              <button
                type="button"
                role="menuitem"
                disabled={deleteBusy}
                className={OverlayUi.popoverItemDanger}
                onClick={() => {
                  setOpen(false);
                  onDelete();
                }}
              >
                <Trash2 className="h-4 w-4 shrink-0" />
                {t("community_delete")}
              </button>
            </li>
          </ul>
        </>
      ) : null}
    </div>
  );
}
