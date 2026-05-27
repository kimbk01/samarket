"use client";

import { useCallback, useEffect, useLayoutEffect, useState } from "react";
import { markStoresHomePerf } from "@/lib/stores/stores-home-perf-marks";
import Link from "next/link";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { STORES_HOME_HERO_SLIDES } from "@/lib/stores/stores-home-hero-slides";
import { STORES_HOME_LCP_HERO_ATTR } from "@/lib/stores/stores-home-lcp-policy";
import { STORES_HOME_CARD } from "@/lib/stores/stores-home-ui";

/** 140~180px 캐러셀 — 정적 슬라이드 */
export function StoresHomeHeroBanner() {
  const { t } = useI18n();
  const [index, setIndex] = useState(0);
  const slide = STORES_HOME_HERO_SLIDES[index] ?? STORES_HOME_HERO_SLIDES[0];

  const advance = useCallback(() => {
    setIndex((i) => (i + 1) % STORES_HOME_HERO_SLIDES.length);
  }, []);

  useEffect(() => {
    const id = window.setInterval(advance, 5000);
    return () => window.clearInterval(id);
  }, [advance]);

  useLayoutEffect(() => {
    markStoresHomePerf("hero");
  }, []);

  return (
    <div
      className="relative overflow-hidden rounded-[var(--delivery-radius)]"
      data-stores-perf="hero"
    >
      <Link
        href={slide.href}
        prefetch={false}
        className={`block min-h-[140px] max-h-[180px] p-4 text-white ${STORES_HOME_CARD} border-0`}
        style={{ background: slide.bg }}
        {...{ [STORES_HOME_LCP_HERO_ATTR]: "hero" }}
      >
        <p className="text-[11px] font-semibold uppercase tracking-wide opacity-90">{t(slide.eyebrowKey)}</p>
        <p className="mt-1 text-[17px] font-bold leading-snug">
          {t(slide.titleKey)}
        </p>
        <p className="mt-1 text-[13px] leading-snug opacity-90">{t(slide.subtitleKey)}</p>
      </Link>
      <div className="absolute bottom-2 right-3 flex gap-1" aria-hidden>
        {STORES_HOME_HERO_SLIDES.map((s, i) => (
          <span
            key={s.id}
            className={`h-1.5 w-1.5 rounded-full ${i === index ? "bg-white" : "bg-white/40"}`}
          />
        ))}
      </div>
    </div>
  );
}
