"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { DetailSectionDTO } from "@/lib/posts/detail-sections/types";
import { formatPrice } from "@/lib/utils/format";
import { getAppSettings } from "@/lib/app-settings";

type Props = {
  postId: string;
  defaultCurrency?: string;
  /** 상세 API(`recommendSections=1`)에서 이미 받은 경우 — 별도 fetch 생략 */
  initialSections?: DetailSectionDTO[];
};

export function PostDetailRecommendSections({ postId, defaultCurrency, initialSections }: Props) {
  const currency = defaultCurrency ?? getAppSettings().defaultCurrency ?? "KRW";
  const hasServerPayload = initialSections !== undefined;
  const [sections, setSections] = useState<DetailSectionDTO[] | null>(() =>
    hasServerPayload ? initialSections : null
  );

  useEffect(() => {
    if (initialSections !== undefined) {
      setSections(initialSections);
    }
  }, [initialSections]);

  useEffect(() => {
    if (hasServerPayload) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/posts/${encodeURIComponent(postId)}/detail-sections`, {
          cache: "no-store",
          credentials: "include",
        });
        const j = (await res.json()) as { sections?: DetailSectionDTO[]; error?: string };
        if (cancelled) return;
        if (!res.ok) {
          if (process.env.NODE_ENV === "development") {
            console.debug("[detail-sections]", postId, j.error ?? res.status);
          }
          setSections([]);
          return;
        }
        const next = Array.isArray(j.sections) ? j.sections : [];
        setSections(next);
        if (process.env.NODE_ENV === "development") {
          console.debug("[detail-sections]", postId, { sectionKeys: next.map((s) => s.key) });
        }
      } catch (e) {
        if (!cancelled && process.env.NODE_ENV === "development") {
          console.debug("[detail-sections]", postId, String(e));
        }
        if (!cancelled) setSections([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [postId, hasServerPayload]);

  if (sections === null) {
    return (
      <div className="mt-4 border-t border-sam-border-soft bg-sam-surface px-4 py-6">
        <p className="text-center text-[13px] text-sam-muted">추천 영역을 불러오는 중…</p>
      </div>
    );
  }

  if (sections.length === 0) {
    return null;
  }

  return (
    <>
      {sections.map((sec) => (
        <div
          key={sec.key}
          className="mt-4 border-t border-sam-border-soft bg-sam-surface px-4 py-4"
        >
          <div className="flex items-center justify-between text-[14px] font-medium text-sam-fg">
            <span>{sec.title}</span>
          </div>
          <div className="mt-3 flex gap-3 overflow-x-auto pb-1 [-webkit-overflow-scrolling:touch]">
            {sec.items.map((item) => {
              const thumb = item.thumbnail_url;
              const priceLabel =
                item.price != null ? formatPrice(item.price, currency) : "";
              return (
                <Link
                  key={`${sec.key}-${item.id}`}
                  href={`/post/${item.id}`}
                  className="block w-[42%] min-w-[140px] shrink-0 sm:w-[30%] md:min-w-[160px]"
                >
                  <div className="overflow-hidden rounded-ui-rect border border-sam-border-soft bg-sam-app">
                    <div className="relative aspect-square w-full bg-sam-surface-muted">
                      {thumb ? (
                        <img src={thumb} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <div className="flex h-full items-center justify-center text-[11px] text-sam-meta">
                          이미지
                        </div>
                      )}
                      {item.isAd ? (
                        <span className="absolute left-1.5 top-1.5 rounded bg-amber-500/95 px-1.5 py-0.5 text-[10px] font-semibold text-white shadow">
                          광고
                        </span>
                      ) : null}
                    </div>
                    <div className="p-2">
                      <p className="line-clamp-2 text-[12px] font-medium text-sam-fg">{item.title}</p>
                      {priceLabel ? (
                        <p className="mt-0.5 text-[13px] font-bold text-sam-fg">{priceLabel}</p>
                      ) : null}
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </>
  );
}
