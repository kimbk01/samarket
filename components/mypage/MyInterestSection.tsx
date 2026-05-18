"use client";

import Link from "next/link";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { MessageKey } from "@/lib/i18n/messages";
import { MYPAGE_TRADE_FAVORITES_HREF } from "@/lib/mypage/trade-hub-paths";

const ITEMS: { labelKey: MessageKey; href: string; icon: React.ReactNode; countKey?: "favorites" }[] = [
  { labelKey: "mypage_comp_interest_favorites", href: MYPAGE_TRADE_FAVORITES_HREF, icon: <HeartIcon />, countKey: "favorites" },
  { labelKey: "mypage_comp_interest_keyword_alerts", href: "/mypage/settings/notifications", icon: <TagIcon /> },
];

interface MyInterestSectionProps {
  favoriteCount?: number | null;
}

export function MyInterestSection({ favoriteCount }: MyInterestSectionProps) {
  const { t } = useI18n();
  return (
    <section className="rounded-ui-rect border border-sam-border bg-sam-surface p-4">
      <h2 className="mb-3 sam-text-body-secondary font-semibold text-muted">{t("mypage_comp_section_my_interest")}</h2>
      <ul className="space-y-0">
        {ITEMS.map((item, i) => (
          <li key={item.labelKey}>
            <Link
              href={item.href}
              className="flex items-center gap-3 py-3 sam-text-body text-foreground"
            >
              <span className="flex h-8 w-8 items-center justify-center text-foreground">
                {item.icon}
              </span>
              <span className="flex-1">
                {t(item.labelKey)}
                {item.countKey === "favorites" &&
                  favoriteCount != null &&
                  favoriteCount > 0 && (
                    <span className="ml-2 sam-text-helper font-normal text-sam-muted">
                      {t("mypage_comp_interest_count_suffix", { count: favoriteCount })}
                    </span>
                  )}
              </span>
              <ChevronRight />
            </Link>
            {i < ITEMS.length - 1 && <hr className="border-sam-border" />}
          </li>
        ))}
      </ul>
      {favoriteCount != null && favoriteCount === 0 && (
        <p className="-mt-1 pb-1 sam-text-helper text-muted">{t("mypage_comp_interest_empty_hint")}</p>
      )}
    </section>
  );
}

function HeartIcon() {
  return (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"
      />
    </svg>
  );
}
function TagIcon() {
  return (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z"
      />
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
