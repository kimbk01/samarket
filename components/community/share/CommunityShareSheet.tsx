"use client";

import { Check, Link2, Share2, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type PointerEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { getMainAppScrollRootCached } from "@/lib/layout/main-app-scroll-root";
import { useBottomNavScrollChromeHidden } from "@/lib/layout/bottom-nav-scroll-chrome-context";
import { MAIN_BOTTOM_NAV_SHEET_Z_CLASS } from "@/lib/main-menu/bottom-nav-config";
import type { UseCommunityPostShareReturn } from "@/lib/community/share/use-community-post-share";

const SHARE_SHEET_EXIT_MS = 360;

type Props = Pick<
  UseCommunityPostShareReturn,
  "sheetOpen" | "toast" | "busy" | "closeSheet" | "handleCopyLink" | "handleNativeShare"
>;

type SheetMotionPhase = "entering" | "entered" | "exiting";

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
      className="flex w-full min-h-[64px] items-center gap-3 rounded-[20px] border border-[#E7E7E7] bg-white px-4 py-3 text-left transition duration-150 active:scale-[0.98] disabled:opacity-50"
    >
      <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#EAF4EF] text-[#006241]">
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[16px] font-semibold text-[#1a1a1a]">{title}</span>
        <span className="mt-0.5 block truncate text-[13px] text-[#6b7280]">{description}</span>
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
  const bottomNavHiddenByScroll = useBottomNavScrollChromeHidden();
  const dragStartY = useRef<number | null>(null);
  const wasOpenRef = useRef(false);
  const [mounted, setMounted] = useState(false);
  const [present, setPresent] = useState(false);
  const [motionPhase, setMotionPhase] = useState<SheetMotionPhase>("entering");

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (sheetOpen) {
      wasOpenRef.current = true;
      setPresent(true);
      setMotionPhase("entering");
      const id = requestAnimationFrame(() => {
        requestAnimationFrame(() => setMotionPhase("entered"));
      });
      return () => cancelAnimationFrame(id);
    }
    if (!wasOpenRef.current) return;
    wasOpenRef.current = false;
    setMotionPhase("exiting");
    const timer = window.setTimeout(() => {
      setPresent(false);
      setMotionPhase("entering");
    }, SHARE_SHEET_EXIT_MS);
    return () => window.clearTimeout(timer);
  }, [sheetOpen]);

  useEffect(() => {
    if (!present) return;
    const prevBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const mainRoot = getMainAppScrollRootCached();
    const prevMainOverflow = mainRoot?.style.overflow ?? "";
    if (mainRoot) mainRoot.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevBodyOverflow;
      if (mainRoot) mainRoot.style.overflow = prevMainOverflow;
    };
  }, [present]);

  const requestClose = useCallback(() => {
    if (!sheetOpen || motionPhase === "exiting") return;
    closeSheet();
  }, [closeSheet, motionPhase, sheetOpen]);

  useEffect(() => {
    if (!present) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") requestClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [present, requestClose]);

  const onHandlePointerDown = useCallback((event: PointerEvent<HTMLDivElement>) => {
    dragStartY.current = event.clientY;
    event.currentTarget.setPointerCapture(event.pointerId);
  }, []);

  const onHandlePointerUp = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      if (dragStartY.current == null) return;
      const delta = event.clientY - dragStartY.current;
      dragStartY.current = null;
      if (delta > 72) requestClose();
    },
    [requestClose]
  );

  if (!mounted || !present || typeof document === "undefined" || !document.body) return null;

  const panelMotionClass =
    motionPhase === "exiting"
      ? "community-share-sheet-panel--exiting"
      : motionPhase === "entered"
        ? "community-share-sheet-panel--entered"
        : "community-share-sheet-panel--entering";

  const panelScrollHiddenClass = bottomNavHiddenByScroll ? "community-share-sheet-panel--nav-hidden" : "";

  const toastNode = toast ? (
    <div className="pointer-events-none fixed inset-x-0 bottom-[max(5rem,env(safe-area-inset-bottom))] z-[1400] flex justify-center px-4">
      <p className="flex max-w-sm items-center gap-2 rounded-full bg-[#1f2937] px-4 py-2.5 text-[14px] font-medium text-white shadow-lg">
        <Check className="h-4 w-4 shrink-0 text-[#86efac]" aria-hidden />
        <span>{toast}</span>
      </p>
    </div>
  ) : null;

  return createPortal(
    <>
      <div
        className={`community-share-sheet-host fixed inset-0 ${MAIN_BOTTOM_NAV_SHEET_Z_CLASS}`}
        role="presentation"
      >
        <button
          type="button"
          className="absolute inset-0 cursor-default bg-transparent"
          aria-label={t("community_share_sheet_close")}
          onClick={requestClose}
        />
        <div
          role="dialog"
          aria-modal="true"
          aria-label={t("community_share_sheet_title")}
          className={`community-share-sheet-panel flex w-full flex-col overflow-hidden rounded-t-[24px] border border-[#E7E7E7] bg-[#F7F7F5] shadow-[0_-8px_32px_rgba(0,0,0,0.08)] ${panelMotionClass} ${panelScrollHiddenClass}`}
          onClick={(event) => event.stopPropagation()}
        >
          <div
            className="flex touch-none justify-center pt-3"
            onPointerDown={onHandlePointerDown}
            onPointerUp={onHandlePointerUp}
            onPointerCancel={onHandlePointerUp}
            aria-hidden
          >
            <span className="h-1 w-10 rounded-full bg-[#D9D9D9]" />
          </div>

          <div className="flex items-center justify-between gap-2 px-5 pb-3 pt-1">
            <h2 className="truncate text-[18px] font-bold text-[#1a1a1a]">{t("community_share_sheet_title")}</h2>
            <button
              type="button"
              onClick={requestClose}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[#6b7280] transition hover:bg-black/5 active:scale-[0.98]"
              aria-label={t("community_share_sheet_close")}
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="flex flex-col gap-3 px-5 pb-4">
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
        </div>
      </div>
      {toastNode}
    </>,
    document.body
  );
}
