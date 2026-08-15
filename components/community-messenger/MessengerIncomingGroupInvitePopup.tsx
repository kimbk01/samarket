"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { BOTTOM_NAV_FIX_OFFSET_ABOVE_BOTTOM_CLASS } from "@/lib/main-menu/bottom-nav-config";
import { DibayOverlayButton } from "@/components/ui/dibay-overlay";
import { OverlayUi } from "@/lib/ui/dibay-overlay-contract";
import type { IncomingGroupInvitePopupEntry } from "@/lib/community-messenger/stores/incoming-friend-request-popup-store";

type Props = {
  invite: IncomingGroupInvitePopupEntry;
  onDismiss: () => void;
  onOpen: () => void;
  layout?: "viewport" | "stack";
};

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

  return (
    <div
      className={outerClass}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={subtitleId}
      data-dibay-overlay="incoming-group-invite"
    >
      <div className={`${OverlayUi.dialogPanel} !max-w-[min(100%,22rem)] sm:!max-w-lg !opacity-100 !scale-100`}>
        <button
          type="button"
          onClick={onDismiss}
          className="dibay-overlay-btn dibay-overlay-btn--text absolute right-2 top-2 z-[1] !min-h-11 !w-11 !flex-none !p-0"
          aria-label={t("nav_close")}
        >
          <svg className="h-6 w-6 opacity-70" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        <div className="flex gap-3 px-1 pb-1 pt-1">
          <div
            className="relative flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-[length:var(--overlay-radius-lg)] bg-[color:var(--overlay-secondary)] text-[length:var(--overlay-body-1-size)] font-semibold text-[color:var(--overlay-primary)]"
            aria-hidden
          >
            {initial}
          </div>
          <div className="min-w-0 flex-1 pr-10 pt-0.5">
            <div
              className={`mb-1 inline-flex rounded-[length:var(--overlay-radius-sm)] border border-[color:var(--overlay-border)] bg-[color:var(--overlay-secondary)] px-1.5 py-0.5 ${OverlayUi.caption} font-semibold`}
            >
              {t("cm_ui_group_invite")}
            </div>
            <p id={titleId} className={`${OverlayUi.titleSheet} !text-left truncate`}>
              {roomTitle}
            </p>
            <p id={subtitleId} className={`mt-1 ${OverlayUi.bodySecondary} !text-left`}>
              {t("cm_ui_group_invite_added_by", { name: inviterLabel })}
            </p>
          </div>
        </div>

        <div className="mt-3 flex flex-col gap-2">
          <DibayOverlayButton roleTone="primary" onClick={onOpen} className="!flex-none w-full">
            {t("cm_ui_open_group_room")}
          </DibayOverlayButton>
          <DibayOverlayButton roleTone="secondary" onClick={onDismiss} className="!flex-none w-full">
            {t("nav_close")}
          </DibayOverlayButton>
        </div>
      </div>
    </div>
  );
}
