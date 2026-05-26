"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { storesBrowsePrimaryPath } from "@/components/stores/browse/stores-browse-paths";
import { STORES_HOME_CARD } from "@/lib/stores/stores-home-ui";

const SLIDES = [
  {
    id: "browse-food",
    href: () => storesBrowsePrimaryPath("restaurant"),
    eyebrowKey: "store_promo_eyebrow" as const,
    titleKey: "store_promo_title" as const,
    subtitleKey: "store_promo_subtitle" as const,
    bg: "linear-gradient(135deg, var(--dibay-green) 0%, var(--dibay-brown) 100%)",
  },
  {
    id: "browse-mart",
    href: () => storesBrowsePrimaryPath("mart"),
    eyebrowKey: "store_feed_eyebrow" as const,
    titleKey: "store_more_food_link" as const,
    subtitleKey: "store_order_now_subtitle" as const,
    bg: "linear-gradient(135deg, color-mix(in srgb, var(--dibay-green) 88%, var(--dibay-card)) 0%, var(--dibay-green) 100%)",
  },
] as const;

/** 140~180px 캐러셀 — 정적 슬라이드 */
export function StoresHomeHeroBanner() {
  const { t } = useI18n();
  const [index, setIndex] = useState(0);
  const slide = SLIDES[index] ?? SLIDES[0];

  const advance = useCallback(() => {
    setIndex((i) => (i + 1) % SLIDES.length);
  }, []);

  useEffect(() => {
    const id = window.setInterval(advance, 5000);
    return () => window.clearInterval(id);
  }, [advance]);

  return (
    <div className="relative overflow-hidden rounded-[var(--delivery-radius)]">
      <Link
        href={slide.href()}
        className={`block min-h-[140px] max-h-[180px] p-4 text-white ${STORES_HOME_CARD} border-0`}
        style={{ background: slide.bg }}
      >
        <p className="text-[11px] font-semibold uppercase tracking-wide opacity-90">{t(slide.eyebrowKey)}</p>
        <p className="mt-1 text-[17px] font-bold leading-snug">{t(slide.titleKey)}</p>
        <p className="mt-1 text-[13px] leading-snug opacity-90">{t(slide.subtitleKey)}</p>
      </Link>
      <div className="absolute bottom-2 right-3 flex gap-1" aria-hidden>
        {SLIDES.map((s, i) => (
          <span
            key={s.id}
            className={`h-1.5 w-1.5 rounded-full ${i === index ? "bg-white" : "bg-white/40"}`}
          />
        ))}
      </div>
    </div>
  );
}
