"use client";

import Link from "next/link";
import { BOARD_LABEL, type CustomerCenterContentType } from "@/lib/notices/customer-center-content";
import { buildCustomerCenterBoardListPath } from "@/lib/notices/customer-center-content-paths";
import { DIBAY_SECONDARY_TABS_CLASS, dibaySecondaryTabClass } from "@/lib/ui/dibay-secondary-tabs";

const BOARDS: CustomerCenterContentType[] = ["notice", "system", "marketing"];

/** Board family switcher only — never notification-domain tabs. Visual SSOT only. */
export function CustomerCenterBoardSwitcher({
  active,
  language,
}: {
  active: CustomerCenterContentType;
  language: "ko" | "en";
}) {
  return (
    <div className={DIBAY_SECONDARY_TABS_CLASS} role="tablist" aria-label="customer center boards">
      {BOARDS.map((type) => {
        const selected = type === active;
        return (
          <Link
            key={type}
            href={buildCustomerCenterBoardListPath(type)}
            role="tab"
            aria-selected={selected}
            className={dibaySecondaryTabClass(selected)}
          >
            {BOARD_LABEL[type][language === "en" ? "en" : "ko"]}
          </Link>
        );
      })}
    </div>
  );
}
