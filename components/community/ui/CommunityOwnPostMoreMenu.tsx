"use client";

import { useState } from "react";
import { MoreHorizontal, Share2, Trash2 } from "lucide-react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { CM_BTN_TEXT_CLASS } from "@/lib/community/community-ui-classes";

type Props = {
  onShare: () => void;
  onDelete: () => void;
  deleteBusy?: boolean;
};

export function CommunityOwnPostMoreMenu({ onShare, onDelete, deleteBusy = false }: Props) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const itemClass = `flex w-full items-center gap-2 px-4 py-3 text-left ${CM_BTN_TEXT_CLASS} text-[var(--cm-text)] hover:bg-[var(--cm-page-bg)]`;

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
            className="absolute right-0 top-full z-50 mt-1 min-w-[11rem] overflow-hidden rounded-2xl border border-[var(--cm-border)] bg-[var(--cm-card-bg)] py-1 shadow-lg"
            role="menu"
          >
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
                className={`${itemClass} text-[var(--cm-danger)]`}
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
