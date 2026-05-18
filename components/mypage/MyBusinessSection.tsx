"use client";

import Link from "next/link";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { MessageKey } from "@/lib/i18n/messages";

const ITEMS: { labelKey: MessageKey; href: string; icon: React.ReactNode }[] = [
  { labelKey: "mypage_comp_business_store_apply", href: "/stores/owner/apply", icon: <BuildingIcon /> },
  { labelKey: "mypage_comp_business_store_manage", href: "/stores/owner", icon: <StoreManageIcon /> },
  { labelKey: "mypage_comp_business_ads", href: "/my/ads", icon: <MegaphoneIcon /> },
];

export function MyBusinessSection() {
  const { t } = useI18n();
  return (
    <section className="rounded-ui-rect border border-sam-border bg-sam-surface p-4">
      <h2 className="mb-3 sam-text-body-secondary font-semibold text-muted">{t("mypage_comp_section_my_business")}</h2>
      <ul className="space-y-0">
        {ITEMS.map((item, i) => (
          <li key={item.labelKey}>
            <Link
              href={item.href}
              className="flex items-center gap-3 py-3 sam-text-body text-sam-fg"
            >
              <span className="flex h-8 w-8 items-center justify-center text-sam-muted">
                {item.icon}
              </span>
              <span className="flex-1">{t(item.labelKey)}</span>
              <ChevronRight />
            </Link>
            {i < ITEMS.length - 1 && <hr className="border-sam-border" />}
          </li>
        ))}
      </ul>
    </section>
  );
}

function BuildingIcon() {
  return (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
    </svg>
  );
}

function StoreManageIcon() {
  return (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z"
      />
    </svg>
  );
}
function MegaphoneIcon() {
  return (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13a3 3 0 001.17-5.764m.5-3.228a3 3 0 00-5.614-.614" />
    </svg>
  );
}

function ChevronRight() {
  return (
    <svg className="h-5 w-5 text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
    </svg>
  );
}
