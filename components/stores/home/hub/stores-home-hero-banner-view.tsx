import type { AppLanguageCode } from "@/lib/i18n/config";
import { safeTranslate } from "@/lib/i18n/safe-translate";
import { STORES_HOME_HERO_SLIDES } from "@/lib/stores/stores-home-hero-slides";
import { STORES_HOME_CARD } from "@/lib/stores/stores-home-ui";

/** 히어로 캐러셀 — SSR 첫 슬라이드·정적 dots (인터랙션 없음) */
export function StoresHomeHeroBannerView({ language }: { language: AppLanguageCode }) {
  const slide = STORES_HOME_HERO_SLIDES[0];
  if (!slide) return null;

  return (
    <div
      className="relative overflow-hidden rounded-[var(--delivery-radius)]"
      data-stores-perf="hero"
    >
      <a
        href={slide.href}
        className={`block min-h-[140px] max-h-[180px] p-4 text-white ${STORES_HOME_CARD} border-0`}
        style={{ background: slide.bg }}
      >
        <p className="text-[11px] font-semibold uppercase tracking-wide opacity-90">
          {safeTranslate(language, slide.eyebrowKey, { fallbackKo: "", fallbackEn: "" })}
        </p>
        <p className="mt-1 text-[17px] font-bold leading-snug">
          {safeTranslate(language, slide.titleKey, { fallbackKo: "", fallbackEn: "" })}
        </p>
        <p className="mt-1 text-[13px] leading-snug opacity-90">
          {safeTranslate(language, slide.subtitleKey, { fallbackKo: "", fallbackEn: "" })}
        </p>
      </a>
      <div className="absolute bottom-2 right-3 flex gap-1" aria-hidden>
        {STORES_HOME_HERO_SLIDES.map((s, i) => (
          <span
            key={s.id}
            className={`h-1.5 w-1.5 rounded-full ${i === 0 ? "bg-white" : "bg-white/40"}`}
          />
        ))}
      </div>
    </div>
  );
}
