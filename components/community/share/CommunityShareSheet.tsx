"use client";

import { Link2, Share2 } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { DibayBottomSheet } from "@/components/ui/dibay-overlay";
import { OverlayUi } from "@/lib/ui/dibay-overlay-contract";
import { DibayToast } from "@/components/ui/dibay-overlay/DibayToast";
import type { UseCommunityPostShareReturn } from "@/lib/community/share/use-community-post-share";

type Props = Pick<
  UseCommunityPostShareReturn,
  "sheetOpen" | "toast" | "busy" | "closeSheet" | "handleCopyLink" | "handleNativeShare"
>;

function ShareOptionButton({
  icon,
  title,
  description,
  disabled,
  onClick,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`${OverlayUi.selectCard} !min-h-16 !gap-3`}
    >
      <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[color:var(--overlay-secondary)] text-[color:var(--overlay-primary)]">
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[length:var(--overlay-body-1-size)] font-semibold text-[color:var(--overlay-text-primary)]">
          {title}
        </span>
        <span className={`mt-0.5 block truncate ${OverlayUi.caption}`}>{description}</span>
      </span>
    </button>
  );
}

export function CommunityShareSheet({
  sheetOpen,
  toast,
  busy,
  closeSheet,
  handleCopyLink,
  handleNativeShare,
}: Props) {
  const { t } = useI18n();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const toastNode =
    mounted && toast && typeof document !== "undefined" && document.body
      ? createPortal(
          <DibayToast message={toast} tone="success" />,
          document.body
        )
      : null;

  return (
    <>
      <DibayBottomSheet
        open={sheetOpen}
        onClose={closeSheet}
        title={t("community_share_sheet_title")}
        ariaLabel={t("community_share_sheet_title")}
      >
        <div className="flex flex-col gap-3 pb-1">
          <ShareOptionButton
            icon={<Share2 className="h-5 w-5" strokeWidth={2} />}
            title={t("community_share_option_native")}
            description={t("community_share_option_native_desc")}
            disabled={busy}
            onClick={() => void handleNativeShare()}
          />
          <ShareOptionButton
            icon={<Link2 className="h-5 w-5" strokeWidth={2} />}
            title={t("community_share_option_copy")}
            description={t("community_share_option_copy_desc")}
            disabled={busy}
            onClick={() => void handleCopyLink()}
          />
        </div>
      </DibayBottomSheet>
      {toastNode}
    </>
  );
}
