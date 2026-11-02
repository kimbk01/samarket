"use client";

import { AllServicesSection } from "@/components/home/AllServicesSection";

/** 1단 제목 「전체 서비스」·뒤로 = 전역 헤더(`resolve-main-tier1` `/services`) — 페이지 자체 헤더 없음 (크롬 S2 2026-11-02) */
export function AllServicesContent() {
  return (
    <div className="space-y-6">
      <AllServicesSection />
    </div>
  );
}
