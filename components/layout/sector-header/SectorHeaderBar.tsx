"use client";

import type { ReactNode } from "react";
import {
  SECTOR_HEADER_BAR_CLASS,
  SECTOR_HEADER_BAR_WRAP_CLASS,
  SECTOR_HEADER_BAR_WITH_SUBTITLE_CLASS,
} from "@/lib/ui/sector-header-classes";

export function SectorHeaderBar({
  left,
  center,
  right,
  withSubtitle = false,
  centerAlign = "center",
}: {
  left?: ReactNode;
  center: ReactNode;
  right?: ReactNode;
  withSubtitle?: boolean;
  centerAlign?: "center" | "left";
}) {
  return (
    <div className={SECTOR_HEADER_BAR_WRAP_CLASS}>
      <div
        className={[
          SECTOR_HEADER_BAR_CLASS,
          withSubtitle ? SECTOR_HEADER_BAR_WITH_SUBTITLE_CLASS : "",
        ]
          .filter(Boolean)
          .join(" ")}
      >
        <div className="sector-header-bar__left">{left ?? <span aria-hidden className="block w-full" />}</div>
        <div
          className={[
            "sector-header-bar__center",
            centerAlign === "left" ? "sector-header-bar__center--left" : "",
          ]
            .filter(Boolean)
            .join(" ")}
        >
          {center}
        </div>
        <div className="sector-header-bar__right">{right ?? null}</div>
      </div>
    </div>
  );
}
