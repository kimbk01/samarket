"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { useRegion } from "@/contexts/RegionContext";
import { useRepresentativeAddressLine } from "@/hooks/use-representative-address-line";
import {
  formatNeighborhoodRegionSubtitle,
  neighborhoodLocationLabelFromRegion,
  neighborhoodLocationMetaFromRegion,
} from "@/lib/neighborhood/location-key";
import {
  SAM_TIER1_HEADER_ACTION_BTN_CLASS,
  SAM_TIER1_HEADER_ICON_GLYPH_CLASS,
} from "@/lib/ui/tier1-header-icon";
import { AddressKindHeadPin } from "@/components/addresses/AddressKindHeadPin";
import { useClientMembershipState } from "@/hooks/use-client-membership-state";
import { openLoginRequiredSheet } from "@/lib/auth/require-auth-action";
import { navigateToMemberAddressBook } from "@/lib/addresses/mypage-addresses-return-to";

/**
 * 필라이프 헤더 주소 — 현재 PUBLIC 지역 표시 + 변경은 MEMBER ADDRESS BOOK 페이지 스택.
 * 자체 picker / 별도 주소 입력 없음.
 */
export function PhilifeHeaderAddressMenuButton({
  panelPlacement = "anchor",
}: {
  panelPlacement?: "anchor" | "top-right" | "anchor-top-right";
}) {
  const [open, setOpen] = useState(false);
  const [renderOpen, setRenderOpen] = useState(false);
  const [panelEntered, setPanelEntered] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null);
  const [panelOrigin, setPanelOrigin] = useState("top right");
  const { t } = useI18n();
  const router = useRouter();
  const pathname = usePathname() ?? "";
  const searchParams = useSearchParams();
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const closeTimerRef = useRef<number | null>(null);
  const membership = useClientMembershipState("philife-header-address-menu");
  const { currentRegion } = useRegion();
  const rep = useRepresentativeAddressLine();
  const meta = neighborhoodLocationMetaFromRegion(currentRegion);
  const label = neighborhoodLocationLabelFromRegion(currentRegion);
  const fallback = formatNeighborhoodRegionSubtitle(meta, (label || currentRegion?.label || "").trim());
  const isMemberViewer = membership.status === "member";
  const addressLine = !isMemberViewer
    ? membership.status === "checking"
      ? t("philife_addr_loading_line")
      : t("philife_addr_not_set")
    : rep.status === "loading"
      ? t("philife_addr_loading_line")
      : rep.line?.trim() || fallback || t("philife_addr_not_set");

  useEffect(() => {
    setMounted(true);
  }, []);

  const closeMenu = () => {
    if (!open && !renderOpen) return;
    if (closeTimerRef.current != null) {
      window.clearTimeout(closeTimerRef.current);
    }
    setPanelEntered(false);
    setOpen(false);
    closeTimerRef.current = window.setTimeout(() => {
      setRenderOpen(false);
      closeTimerRef.current = null;
    }, 240);
  };

  const toggleMenu = () => {
    if (!isMemberViewer) {
      openLoginRequiredSheet({ actionType: "address_save" });
      return;
    }
    if (open) {
      closeMenu();
      return;
    }
    if (closeTimerRef.current != null) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
    setRenderOpen(true);
    setPanelEntered(false);
    setOpen(true);
    requestAnimationFrame(() => setPanelEntered(true));
  };

  useEffect(() => {
    if (isMemberViewer) return;
    closeMenu();
  }, [isMemberViewer]);

  useEffect(() => {
    return () => {
      if (closeTimerRef.current != null) {
        window.clearTimeout(closeTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    const updateRect = () => {
      if (!buttonRef.current) return;
      setAnchorRect(buttonRef.current.getBoundingClientRect());
    };
    updateRect();
    window.addEventListener("resize", updateRect);
    window.addEventListener("scroll", updateRect, true);
    return () => {
      window.removeEventListener("resize", updateRect);
      window.removeEventListener("scroll", updateRect, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open || !anchorRect) return;
    const panel = panelRef.current;
    if (!panel) return;
    const panelRect = panel.getBoundingClientRect();
    const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(v, max));
    const x = clamp(anchorRect.left + anchorRect.width / 2 - panelRect.left, 10, panelRect.width - 10);
    const y = clamp(anchorRect.top + anchorRect.height / 2 - panelRect.top, 8, panelRect.height - 8);
    setPanelOrigin(`${Math.round(x)}px ${Math.round(y)}px`);
  }, [open, anchorRect]);

  const panelStyle: CSSProperties =
    panelPlacement === "top-right"
      ? { top: 8, right: 8 }
      : panelPlacement === "anchor-top-right" && anchorRect
        ? { top: Math.round(anchorRect.bottom + 8), right: Math.max(8, Math.round(window.innerWidth - anchorRect.right)) }
        : anchorRect
          ? { top: Math.round(anchorRect.bottom + 8), left: Math.max(8, Math.round(anchorRect.right - 300)) }
          : { top: 8, right: 8 };

  const openAddressBook = () => {
    closeMenu();
    navigateToMemberAddressBook(router, {
      pathname,
      search: searchParams?.toString() ? `?${searchParams.toString()}` : "",
    });
  };

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        className={`${SAM_TIER1_HEADER_ACTION_BTN_CLASS} community-tier1-header-address text-sam-primary active:bg-sam-primary/10`}
        aria-label={t("philife_addr_open_menu_aria")}
        aria-expanded={open}
        onClick={toggleMenu}
      >
        <AddressKindHeadPin kind="master" className={SAM_TIER1_HEADER_ICON_GLYPH_CLASS} />
      </button>
      {renderOpen && mounted && typeof document !== "undefined"
        ? createPortal(
            <div className="fixed inset-0 z-[70]" role="presentation">
              <button
                type="button"
                className="absolute inset-0 cursor-default bg-transparent"
                aria-label={t("philife_addr_close_menu_aria")}
                onClick={closeMenu}
              />
              <div
                ref={panelRef}
                role="dialog"
                aria-modal="true"
                className="absolute z-[71] w-[min(92vw,300px)] overflow-hidden rounded-[12px] border border-black/10 bg-white text-neutral-900 shadow-[0_10px_28px_rgba(0,0,0,0.18)]"
                style={{
                  ...panelStyle,
                  transformOrigin: panelOrigin,
                  transform:
                    panelPlacement === "anchor-top-right"
                      ? panelEntered
                        ? "translate3d(0,-100%,0) scale(1)"
                        : "translate3d(18px,calc(-100% - 18px),0) scale(0.82)"
                      : panelEntered
                        ? "translate3d(0,0,0) scale(1)"
                        : "translate3d(18px,-18px,0) scale(0.82)",
                  opacity: panelEntered ? 1 : 0,
                  transition:
                    "transform 260ms cubic-bezier(0.22, 1, 0.36, 1), opacity 200ms ease-out",
                  willChange: "transform, opacity",
                }}
                onPointerDown={(e) => e.stopPropagation()}
              >
                <div className="border-b border-black/10 px-3 py-2.5">
                  <p className="text-[12px] leading-4 text-neutral-500">{t("philife_addr_current_label")}</p>
                  <p className="mt-1 break-words text-[14px] font-medium leading-5 text-neutral-900">{addressLine}</p>
                </div>
                <button
                  type="button"
                  className="flex w-full items-center justify-between px-3 py-3 text-left text-[14px] leading-5 hover:bg-neutral-50"
                  onClick={openAddressBook}
                >
                  <span>{t("philife_addr_change")}</span>
                  <svg
                    className="h-4 w-4 text-neutral-500"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                    aria-hidden
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
