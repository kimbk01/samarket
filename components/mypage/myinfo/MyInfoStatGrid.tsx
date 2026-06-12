"use client";

import Link from "next/link";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import {
  MYPAGE_HOME_CARD_CLASS,
  MYPAGE_HOME_SECTION_HEADER_CLASS,
  MYPAGE_HOME_SECTION_LABEL_CLASS,
  MYPAGE_HOME_STAT_CELL_CLASS,
  MYPAGE_HOME_STAT_GRID_CLASS,
  MYPAGE_HOME_STAT_LABEL_CLASS,
  MYPAGE_HOME_STAT_VALUE_ACCENT_CLASS,
  MYPAGE_HOME_STAT_VALUE_CLASS,
} from "@/lib/ui/mypage-home-starbucks-styles";

export type MyInfoStatItem = {
  label: string;
  value: string;
  href: string;
  accent?: boolean;
};

export function MyInfoStatGrid({
  title,
  items,
  onItemPress,
}: {
  title?: string;
  items: MyInfoStatItem[];
  /** 비로그인 — 탭 시 로그인 유도 */
  onItemPress?: (href: string) => void;
}) {
  const { t } = useI18n();
  const oddLast = items.length % 2 === 1;

  return (
    <section className={MYPAGE_HOME_CARD_CLASS}>
      <div className={MYPAGE_HOME_SECTION_HEADER_CLASS}>
        <h2 className={MYPAGE_HOME_SECTION_LABEL_CLASS}>{title ?? t("mypage_comp_stat_grid_title_default")}</h2>
      </div>
      <div className={MYPAGE_HOME_STAT_GRID_CLASS}>
        {items.map((it, index) => {
          const isLastOddMobile = oddLast && index === items.length - 1;
          const cellClass = `${MYPAGE_HOME_STAT_CELL_CLASS} ${
            isLastOddMobile ? "col-span-2 md:col-span-1" : ""
          } ${index >= 2 ? "border-t border-[#D4E9E2]/60 md:border-t-0" : ""}`;
          const content = (
            <>
              <p className={MYPAGE_HOME_STAT_LABEL_CLASS}>{it.label}</p>
              <p className={it.accent ? MYPAGE_HOME_STAT_VALUE_ACCENT_CLASS : MYPAGE_HOME_STAT_VALUE_CLASS}>
                {it.value}
              </p>
            </>
          );
          if (onItemPress) {
            return (
              <button
                key={`${it.label}:${it.href}`}
                type="button"
                onClick={() => onItemPress(it.href)}
                className={`${cellClass} text-left`}
              >
                {content}
              </button>
            );
          }
          return (
            <Link key={`${it.label}:${it.href}`} href={it.href} className={cellClass}>
              {content}
            </Link>
          );
        })}
      </div>
    </section>
  );
}
