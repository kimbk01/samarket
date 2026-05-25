"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";
import {
  SECTOR_HEADER_ACTION_CLASS,
  SECTOR_HEADER_ACTION_PRIMARY_CLASS,
} from "@/lib/ui/sector-header-classes";

export function SectorHeaderActionButton({
  children,
  primary = false,
  active = false,
  className = "",
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
  primary?: boolean;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      data-active={active ? "true" : "false"}
      className={[
        SECTOR_HEADER_ACTION_CLASS,
        primary || active ? SECTOR_HEADER_ACTION_PRIMARY_CLASS : "",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      {...rest}
    >
      {children}
    </button>
  );
}

export function SectorHeaderActionLink({
  href,
  children,
  primary = false,
  className = "",
  "aria-label": ariaLabel,
}: {
  href: string;
  children: ReactNode;
  primary?: boolean;
  className?: string;
  "aria-label"?: string;
}) {
  return (
    <a
      href={href}
      aria-label={ariaLabel}
      className={[
        SECTOR_HEADER_ACTION_CLASS,
        primary ? SECTOR_HEADER_ACTION_PRIMARY_CLASS : "",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {children}
    </a>
  );
}
