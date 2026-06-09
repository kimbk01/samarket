"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { BOTTOM_NAV_FIX_OFFSET_ABOVE_BOTTOM_CLASS } from "@/lib/main-menu/bottom-nav-config";
import { Sam } from "@/lib/ui/sam-component-classes";
import type { IncomingGroupInvitePopupEntry } from "@/lib/community-messenger/stores/incoming-friend-request-popup-store";

type Props = {
  invite: IncomingGroupInvitePopupEntry;
  onDismiss: () => void;
  onOpen: () => void;
  layout?: "viewport" | "stack";
};

const MOBILE_PRESS =
  "touch-manipulation select-none transition-[transform,opacity] duration-100 will-change-transform active:scale-[0.98] motion-reduce:transition-none motion-reduce:active:scale-100";

export function MessengerIncomingGroupInvitePopup({
  invite,
  onDismiss,
  onOpen,
  layout = "viewport",
}: Props) {
  const { t } = useI18n();
  const roomTitle = invite.roomTitle.trim() || t("cm_ui_group");
  const inviterLabel = invite.inviterLabel.trim() || t("common_partner");
  const titleId = `messenger-incoming-group-title-${invite.id}`;
  const subtitleId = `messenger-incoming-group-sub-${invite.id}`;
  const initial = roomTitle.slice(0, 1) || "#";

  const outerClass =
    layout === "stack"
      ? "pointer-events-auto relative w-full max-w-lg shrink-0 self-center"
      : `pointer-events-auto fixed inset-x-0 z-[94] px-3 sm:px-4 ${BOTTOM_NAV_FIX_OFFSET_ABOVE_BOTTOM_CLASS}`;

  const panelClass =
    "relative mx-auto w-full max-w-[min(100%,22rem)] overflow-hidden rounded-2xl border border-sam-border bg-sam-surface text-sam-fg shadow-[0_12px_48px_rgba(15,23,42,0.18)] ring-1 ring-black/[0.05] sm:max-w-lg";

  return (
    <div
      className={outerClass}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={subtitleId}
    >
      <div className={panelClass}>
        <button
          type="button"
          onClick={onDismiss}
          className={`${Sam.btn.base} ${Sam.btn.ghostCombo} absolute right-2 top-2 z-[1] !h-11 !min-h-11 !w-11 !max-w-none shrink-0 rounded-full !border-0 !px-0 !py-0 text-sam-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sam-primary ${MOBILE_PRESS}`}
          aria-label={t("nav_close")}
        >
          <svg className="h-6 w-6 opacity-70" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        <div className="flex gap-3 px-4 pb-1 pt-4 sm:px-5 sm:pt-5">
          <div
            className="relative flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-sam-primary-soft ring-2 ring-sam-surface shadow-md sam-text-body-lg font-semibold text-sam-primary"
            aria-hidden
          >
            {initial}
          </div>
          <div className="min-w-0 flex-1 pr-10 pt-0.5">
            <div className="mb-1 inline-flex rounded-ui-rect border border-sam-border bg-sam-app px-1.5 py-0.5 sam-text-xxs font-semibold text-sam-fg/70">
              {t("cm_ui_group_invite")}
            </div>
            <p id={titleId} className={`${Sam.text.bodyLg} truncate font-semibold leading-snug text-sam-fg`}>
              {roomTitle}
            </p>
            <p id={subtitleId} className={`${Sam.text.bodySecondary} mt-1 leading-snug text-sam-fg/75`}>
              {t("cm_ui_group_invite_added_by", { name: inviterLabel })}
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-2 border-t border-sam-border px-4 py-3 sm:px-5">
          <button
            type="button"
            onClick={onOpen}
            className={`${Sam.btn.base} ${Sam.btn.primaryCombo} ${Sam.btn.block} min-h-[44px] rounded-xl px-4 font-semibold ${MOBILE_PRESS}`}
          >
            {t("cm_ui_open_group_room")}
          </button>
          <button
            type="button"
            onClick={onDismiss}
            className={`${Sam.btn.base} ${Sam.btn.outlineCombo} ${Sam.btn.block} min-h-[44px] rounded-xl px-4 font-semibold ${MOBILE_PRESS}`}
          >
            {t("nav_close")}
          </button>
        </div>
      </div>
    </div>
  );
}
