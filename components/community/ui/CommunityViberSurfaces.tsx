"use client";

import type { ReactNode } from "react";
import {
  COMMUNITY_BOTTOM_SHEET_PANEL_CLASS,
  COMMUNITY_DROPDOWN_PANEL_CLASS,
  COMMUNITY_MODAL_PANEL_CLASS,
  COMMUNITY_OVERLAY_BACKDROP_CLASS,
  COMMUNITY_TOAST_PANEL_CLASS,
} from "@/lib/philife/philife-flat-ui-classes";

export function CommunityOverlayBackdrop({
  onClick,
  ariaLabel = "닫기",
}: {
  onClick?: () => void;
  ariaLabel?: string;
}) {
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      onClick={onClick}
      className={COMMUNITY_OVERLAY_BACKDROP_CLASS}
    />
  );
}

export function CommunityModalPanel({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`${COMMUNITY_MODAL_PANEL_CLASS} ${className}`}>{children}</div>;
}

export function CommunityBottomSheetPanel({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={`${COMMUNITY_BOTTOM_SHEET_PANEL_CLASS} ${className}`}>{children}</div>;
}

export function CommunityDropdownPanel({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`${COMMUNITY_DROPDOWN_PANEL_CLASS} ${className}`}>{children}</div>;
}

export function CommunityToastPanel({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`${COMMUNITY_TOAST_PANEL_CLASS} ${className}`}>{children}</div>;
}
