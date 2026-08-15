"use client";

import { Check, Link2, Share2 } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { DibayBottomSheet } from "@/components/ui/dibay-overlay";
import { OverlayUi } from "@/lib/ui/dibay-overlay-contract";
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
      className="flex w-full min-h-[64px] items-center gap-3 rounded-[length:var(--overlay-radius-lg)] border border-[color:var(--overlay-border)] bg-[color:var(--overlay-surface)] px-4 py-3 text-left transition duration-100 active:scale-[var(--overlay-press-scale)] disabled:opacity-50"
    >
      <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[color:var(--overlay-secondary)] text-[color:var(--overlay-primary)]">
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[16px] font-semibold text-[color:var(--overlay-text-primary)]">
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
          <div className="pointer-events-none fixed inset-x-0 bottom-[max(5rem,var(--safe-bottom))] z-[1400] flex justify-center px-4">
            <p className="flex max-w-sm items-center gap-2 rounded-full bg-[#1f2937] px-4 py-2.5 text-[14px] font-medium text-white shadow-lg">
              <Check className="h-4 w-4 shrink-0 text-[#86efac]" aria-hidden />
              <span>{toast}</span>
            </p>
          </div>,
          document.body
        )
      : null;

  return (
    <>
      <DibayBottomSheet
        open={sheetOpen}
        onClose={closeSheet}
        title={t("community_share_sheet_title")}
        anchor="above-bottom-nav"
        ariaLabel={t("community_share_sheet_title")}
        panelClassName="!bg-[color:var(--overlay-secondary)]"
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
