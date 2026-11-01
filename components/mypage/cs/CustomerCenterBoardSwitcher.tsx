"use client";

import Link from "next/link";
import { BOARD_LABEL, type CustomerCenterContentType } from "@/lib/notices/customer-center-content";
import { buildCustomerCenterBoardListPath } from "@/lib/notices/customer-center-content-paths";
import { Sam } from "@/lib/ui/sam-component-classes";

const BOARDS: CustomerCenterContentType[] = ["notice", "system", "marketing"];

/**
 * Board family switcher only — never notification-domain tabs.
 * 최종 설계 S61 — `Sam.chip`(선택 = 연그린 + 그린 테두리, v2.1 §3.3). 게시판마다 경로가 달라 `?tab=` 불필요.
 */
export function CustomerCenterBoardSwitcher({
  active,
  language,
}: {
  active: CustomerCenterContentType;
  language: "ko" | "en";
}) {
  return (
    <div className="flex flex-wrap gap-2" role="tablist" aria-label="customer center boards">
      {BOARDS.map((type) => {
        const selected = type === active;
        return (
          <Link
            key={type}
            href={buildCustomerCenterBoardListPath(type)}
            role="tab"
            aria-selected={selected}
            data-testid={`cc-board-chip-${type}`}
            className={`${selected ? Sam.chip.activeCombo : Sam.chip.inactiveCombo} ${Sam.focusRing} min-h-9`}
          >
            {BOARD_LABEL[type][language === "en" ? "en" : "ko"]}
          </Link>
        );
      })}
    </div>
  );
}
