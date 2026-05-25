"use client";

import type { ReactNode } from "react";
import {
  SECTOR_HEADER_SHELL_CLASS,
  SECTOR_HEADER_SHELL_EMBEDDED_CLASS,
  SECTOR_HEADER_SHELL_FLAT_CLASS,
} from "@/lib/ui/sector-header-classes";

export function SectorHeaderShell({
  children,
  embedded = false,
  flat = false,
  className = "",
  sticky = true,
}: {
  children: ReactNode;
  embedded?: boolean;
  flat?: boolean;
  className?: string;
  /** false: standalone sticky (safe-area 포함) */
  sticky?: boolean;
}) {
  return (
    <div
      className={[
        SECTOR_HEADER_SHELL_CLASS,
        embedded ? SECTOR_HEADER_SHELL_EMBEDDED_CLASS : "",
        flat ? SECTOR_HEADER_SHELL_FLAT_CLASS : "",
        !sticky ? "relative top-auto" : "",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {children}
    </div>
  );
}
