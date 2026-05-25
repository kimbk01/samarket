"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import {
  SECTOR_HEADER_SUBTITLE_CLASS,
  SECTOR_HEADER_TITLE_CLASS,
  SECTOR_HEADER_TITLE_CLUSTER_CLASS,
  SECTOR_HEADER_TITLE_CLUSTER_LEFT_CLASS,
  SECTOR_HEADER_TITLE_LEFT_CLASS,
} from "@/lib/ui/sector-header-classes";

export function SectorHeaderTitle({
  children,
  align = "center",
  as: Tag = "span",
}: {
  children: ReactNode;
  align?: "center" | "left";
  as?: "span" | "h1";
}) {
  return (
    <Tag
      className={[
        SECTOR_HEADER_TITLE_CLASS,
        align === "left" ? SECTOR_HEADER_TITLE_LEFT_CLASS : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {children}
    </Tag>
  );
}

export function SectorHeaderTitleCluster({
  title,
  subtitle,
  subtitleHref,
  align = "center",
}: {
  title: ReactNode;
  subtitle?: string;
  subtitleHref?: string;
  align?: "center" | "left";
}) {
  if (!subtitle?.trim()) {
    return <SectorHeaderTitle align={align}>{title}</SectorHeaderTitle>;
  }
  return (
    <span
      className={[
        SECTOR_HEADER_TITLE_CLUSTER_CLASS,
        align === "left" ? SECTOR_HEADER_TITLE_CLUSTER_LEFT_CLASS : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <SectorHeaderTitle align={align} as="span">
        {title}
      </SectorHeaderTitle>
      {subtitleHref ? (
        <Link href={subtitleHref} className={SECTOR_HEADER_SUBTITLE_CLASS}>
          {subtitle}
        </Link>
      ) : (
        <span className={SECTOR_HEADER_SUBTITLE_CLASS}>{subtitle}</span>
      )}
    </span>
  );
}
