"use client";

import Link from "next/link";
import { BOARD_LABEL, type CustomerCenterContentType } from "@/lib/notices/customer-center-content";
import { buildCustomerCenterBoardListPath } from "@/lib/notices/customer-center-content-paths";
import { CC_PILL_ACTIVE_CLASS, CC_PILL_IDLE_CLASS } from "@/lib/mypage/customer-center-ui";

const BOARDS: CustomerCenterContentType[] = ["notice", "system", "marketing"];

/** Board family switcher only — never notification-domain tabs. */
export function CustomerCenterBoardSwitcher({
  active,
  language,
}: {
  active: CustomerCenterContentType;
  language: "ko" | "en";
}) {
  return (
    <div
      className="flex min-w-0 gap-1.5 overflow-x-auto overscroll-x-contain pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      role="tablist"
      aria-label="customer center boards"
    >
      {BOARDS.map((type) => {
        const selected = type === active;
        return (
          <Link
            key={type}
            href={buildCustomerCenterBoardListPath(type)}
            role="tab"
            aria-selected={selected}
            className={`shrink-0 transition active:scale-[0.98] ${
              selected ? CC_PILL_ACTIVE_CLASS : CC_PILL_IDLE_CLASS
            }`}
          >
            {BOARD_LABEL[type][language === "en" ? "en" : "ko"]}
          </Link>
        );
      })}
    </div>
  );
}
