"use client";
import { useI18n } from "@/components/i18n/AppLanguageProvider";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { StoreBannerPublicRow } from "@/lib/stores/store-banners-notices-public";

/** 히어로 배너 레이어마다 동일해야 당김 스케일·클립이 어긋나지 않음 */
const STORE_HERO_BANNER_MEDIA_CLASS =
  "absolute inset-0 z-0 bg-cover bg-center bg-no-repeat bg-[#15181b]";

function bannerHref(slug: string, b: StoreBannerPublicRow): string | null {
  if (b.link_type === "product" && b.link_target_id) {
    return `/stores/${encodeURIComponent(slug)}/p/${encodeURIComponent(b.link_target_id)}`;
  }
  if (b.link_type === "notice" && b.link_target_id) {
    return `/stores/${encodeURIComponent(slug)}/info#store-notice-${encodeURIComponent(b.link_target_id)}`;
  }
  return null;
}

function HeroSlideCover({ imageUrl }: { imageUrl: string }) {
  const u = imageUrl.trim();
  if (!u) {
    return <div className={`${STORE_HERO_BANNER_MEDIA_CLASS} opacity-95`} aria-hidden />;
  }
  return (
    <div
      className={`${STORE_HERO_BANNER_MEDIA_CLASS}`}
      style={{ backgroundImage: `url(${JSON.stringify(u)})` }}
      aria-hidden
    />
  );
}

export function StoreOwnerBannerCarousel({
  storeSlug,
  banners,
  variant = "default",
}: {
  storeSlug: string;
  banners: StoreBannerPublicRow[];
  variant?: "default" | "hero";
}) {
  const { t } = useI18n();
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [idx, setIdx] = useState(0);

  const scrollTo = useCallback((i: number) => {
    const el = scrollerRef.current;
    if (!el) return;
    const w = el.clientWidth;
    el.scrollTo({ left: i * w, behavior: "smooth" });
  }, []);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const onScroll = () => {
      const w = el.clientWidth || 1;
      const i = Math.round(el.scrollLeft / w);
      setIdx(Math.max(0, Math.min(banners.length - 1, i)));
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [banners.length]);

  if (!banners.length) return null;

  const isHero = variant === "hero";

  const overlayTexts = (b: StoreBannerPublicRow) =>
    b.title?.trim() || b.description?.trim() ? (
      <div
        className={`absolute inset-x-0 bottom-0 z-[1] bg-gradient-to-t from-black/60 to-transparent px-3 ${
          isHero ? "pb-10 pt-10" : "pb-2 pt-6"
        }`}
      >
        {b.title?.trim() ? (
          <p
            className={`line-clamp-2 font-bold text-white drop-shadow ${
              isHero ? "text-[16px] leading-snug" : "line-clamp-1 text-[14px]"
            }`}
          >
            {b.title.trim()}
          </p>
        ) : null}
        {b.description?.trim() ? (
          <p
            className={`mt-0.5 line-clamp-2 text-white/90 drop-shadow ${
              isHero ? "text-[13px] leading-snug" : "line-clamp-1 text-[12px]"
            }`}
          >
            {b.description.trim()}
          </p>
        ) : null}
      </div>
    ) : null;

  if (isHero) {
    const scrollerClass =
      "absolute inset-0 flex h-full snap-x snap-mandatory flex-nowrap overflow-x-auto overflow-y-hidden scroll-smooth [-ms-overflow-style:none] touch-pan-x [scrollbar-width:none] [&::-webkit-scrollbar]:hidden";
    const slideOuter = `relative h-full min-h-0 w-full shrink-0 snap-center snap-always flex-[0_0_100%] min-w-full`;
    const slideInnerFrame = `relative isolate h-full min-h-0 w-full overflow-hidden`;

    return (
      <div className="absolute inset-0 min-h-0 min-w-0 overflow-hidden">
        <div ref={scrollerRef} className={scrollerClass} style={{ WebkitOverflowScrolling: "touch" }}>
          {banners.map((b) => {
            const href = bannerHref(storeSlug, b);
            const body = (
              <div className={slideInnerFrame}>
                <HeroSlideCover imageUrl={b.image_url} />
                {overlayTexts(b)}
              </div>
            );
            return (
              <div key={b.id} className={slideOuter}>
                {href ? (
                  <Link href={href} className="relative block size-full select-none touch-manipulation">
                    {body}
                  </Link>
                ) : (
                  body
                )}
              </div>
            );
          })}
        </div>
        {banners.length > 1 ? (
          <div className="pointer-events-auto absolute inset-x-0 bottom-2 z-[3] flex justify-center gap-1.5">
            {banners.map((b, i) => (
              <button
                key={b.id}
                type="button"
                aria-label={t("store_banner_slide_aria", { index: String(i + 1) })}
                onClick={() => scrollTo(i)}
                className={`h-2 w-2 rounded-full transition ${
                  i === idx ? "bg-white shadow-sm" : "bg-white/45"
                }`}
              />
            ))}
          </div>
        ) : null}
      </div>
    );
  }

  const frameClass =
    "relative isolate h-[100px] min-h-[100px] w-full overflow-hidden rounded-[16px] bg-neutral-100";

  return (
    <div className="relative w-full min-w-0">
      <div
        ref={scrollerRef}
        className="flex min-h-0 snap-x snap-mandatory items-stretch overflow-x-auto overflow-y-hidden scroll-smooth [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden touch-pan-x"
        style={{ WebkitOverflowScrolling: "touch" }}
      >
        {banners.map((b) => {
          const href = bannerHref(storeSlug, b);
          const inner = (
            <div className={frameClass}>
              <img
                src={b.image_url}
                alt=""
                className="absolute inset-0 size-full object-cover object-center pointer-events-none"
                loading="lazy"
              />
              {overlayTexts(b)}
            </div>
          );
          return (
            <div
              key={b.id}
              className="w-[min(100%,100vw-2rem)] shrink-0 snap-center px-1 sm:w-[min(100%,28rem)]"
            >
              {href ? (
                <Link href={href} className="block min-w-0">
                  {inner}
                </Link>
              ) : (
                inner
              )}
            </div>
          );
        })}
      </div>
      {banners.length > 1 ? (
        <div className="mt-2 flex justify-center gap-1.5">
          {banners.map((b, i) => (
            <button
              key={b.id}
              type="button"
              aria-label={t("store_banner_slide_aria", { index: String(i + 1) })}
              onClick={() => scrollTo(i)}
              className={`h-2 w-2 rounded-full transition ${
                i === idx ? "bg-sam-primary" : "bg-sam-border"
              }`}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
