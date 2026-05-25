"use client";

import type { ReactNode } from "react";
import { SectorHeaderTitleCluster } from "@/components/layout/sector-header";

/** 1단 제목 + 선택 부제 — 섹터 헤더 grid 중앙 슬롯 */
export function AppTier1HeaderTitleCluster({
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
  if (!subtitle?.trim()) return title;
  return (
    <SectorHeaderTitleCluster
      title={title}
      subtitle={subtitle}
      subtitleHref={subtitleHref}
      align={align}
    />
  );
}
