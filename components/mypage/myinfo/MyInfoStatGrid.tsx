"use client";

import Link from "next/link";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { MYINFO_SURFACE, MYINFO_TYPO } from "./myinfo-theme";

export type MyInfoStatItem = {
  label: string;
  value: string;
  href: string;
  accent?: boolean;
};

export function MyInfoStatGrid({
  title,
  items,
}: {
  title?: string;
  items: MyInfoStatItem[];
}) {
  const { t } = useI18n();
  return (
    <section className="space-y-2">
      <h2 className={`${MYINFO_TYPO.sectionTitle} text-sam-fg`}>{title ?? t("mypage_comp_stat_grid_title_default")}</h2>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {items.map((it) => (
          <Link
            key={`${it.label}:${it.href}`}
            href={it.href}
            className={`${MYINFO_SURFACE.card} px-3 py-3 transition-colors hover:bg-sam-app active:bg-sam-app`}
          >
            <p className={`${MYINFO_TYPO.metaText} text-sam-muted`}>{it.label}</p>
            <p
              className={`${MYINFO_TYPO.number} mt-1 ${
                it.accent ? "text-[color:#1C8DB8]" : "text-sam-fg"
              }`}
            >
              {it.value}
            </p>
          </Link>
        ))}
      </div>
    </section>
  );
}

