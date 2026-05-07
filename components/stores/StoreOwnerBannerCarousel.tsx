"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { StoreBannerPublicRow } from "@/lib/stores/store-banners-notices-public";

function bannerHref(slug: string, b: StoreBannerPublicRow): string | null {
  if (b.link_type === "product" && b.link_target_id) {
    return `/stores/${encodeURIComponent(slug)}/p/${encodeURIComponent(b.link_target_id)}`;
  }
  if (b.link_type === "notice" && b.link_target_id) {
    return `/stores/${encodeURIComponent(slug)}/info#store-notice-${encodeURIComponent(b.link_target_id)}`;
  }
  return null;
}

export function StoreOwnerBannerCarousel({
  storeSlug,
  banners,
}: {
  storeSlug: string;
  banners: StoreBannerPublicRow[];
}) {
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

  return (
    <div className="w-full min-w-0">
      <div
        ref={scrollerRef}
        className="flex snap-x snap-mandatory overflow-x-auto scroll-smooth [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        style={{ WebkitOverflowScrolling: "touch" }}
      >
        {banners.map((b) => {
          const href = bannerHref(storeSlug, b);
          const inner = (
            <div className="relative h-[100px] w-full overflow-hidden rounded-[16px] bg-neutral-100">
              <img src={b.image_url} alt="" className="h-full w-full object-cover" loading="lazy" />
              {(b.title?.trim() || b.description?.trim()) ? (
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/55 to-transparent px-3 pb-2 pt-6">
                  {b.title?.trim() ? (
                    <p className="line-clamp-1 text-[14px] font-bold text-white drop-shadow">{b.title.trim()}</p>
                  ) : null}
                  {b.description?.trim() ? (
                    <p className="line-clamp-1 text-[12px] text-white/90 drop-shadow">{b.description.trim()}</p>
                  ) : null}
                </div>
              ) : null}
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
              aria-label={`배너 ${i + 1}`}
              onClick={() => scrollTo(i)}
              className={`h-2 w-2 rounded-full transition ${i === idx ? "bg-[#1C8DB8]" : "bg-neutral-300"}`}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
