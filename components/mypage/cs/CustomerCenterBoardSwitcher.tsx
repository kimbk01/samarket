"use client";

import { MyTabs } from "@/components/mypage/ds/MyTabs";
import { BOARD_LABEL, type CustomerCenterContentType } from "@/lib/notices/customer-center-content";
import { buildCustomerCenterBoardListPath } from "@/lib/notices/customer-center-content-paths";

const BOARDS: CustomerCenterContentType[] = ["notice", "system", "marketing"];

/**
 * Board family switcher only — never notification-domain tabs.
 * 내정보 공통 탭(`MyTabs`, 분류 설계 S6 2026-11-02) — 게시판마다 경로가 달라 링크형 탭. `?tab=` 불필요.
 */
export function CustomerCenterBoardSwitcher({
  active,
  language,
}: {
  active: CustomerCenterContentType;
  language: "ko" | "en";
}) {
  return (
    <MyTabs
      ariaLabel="customer center boards"
      value={active}
      items={BOARDS.map((type) => ({
        id: type,
        label: BOARD_LABEL[type][language === "en" ? "en" : "ko"],
        href: buildCustomerCenterBoardListPath(type),
        testId: `cc-board-chip-${type}`,
      }))}
    />
  );
}
