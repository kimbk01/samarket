"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ChevronRight, Search } from "lucide-react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { MySubpageHeader } from "@/components/my/MySubpageHeader";
import { CustomerCenterBoardSwitcher } from "@/components/mypage/cs/CustomerCenterBoardSwitcher";
import { CustomerCenterBoardTypeIcon } from "@/components/mypage/cs/CustomerCenterBoardTypeIcon";
import { CustomerCenterContentMedia } from "@/components/notices/CustomerCenterContentMedia";
import { runSingleFlight } from "@/lib/http/run-single-flight";
import { groupCustomerCenterItemsByDate } from "@/lib/mypage/customer-center-date-sections";
import {
  CUSTOMER_CENTER_LIST_COLUMN_CLASS,
  CUSTOMER_CENTER_PAGE_SHELL_CLASS,
  CUSTOMER_CENTER_SCROLL_BODY_CLASS,
} from "@/lib/mypage/customer-center-layout";
import {
  CC_BODY_CLASS,
  CC_CARD_CLASS,
  CC_CATEGORY_CHIP_CLASS,
  CC_HEADER_CLASS,
  CC_NOTE_CLASS,
  CC_PAGE_BG_CLASS,
} from "@/lib/mypage/customer-center-ui";
import {
  BOARD_LABEL,
  type CustomerCenterContentType,
} from "@/lib/notices/customer-center-content";
import { normalizeCustomerCenterHeroImageUrl } from "@/lib/notices/customer-center-media";
import { excerptCustomerCenterMarkdown } from "@/lib/notices/customer-center-safe-markdown";
import {
  buildCustomerCenterBoardDetailPath,
  CUSTOMER_CENTER_HUB_HREF,
} from "@/lib/notices/customer-center-content-paths";

type BoardListItem = {
  id: string;
  contentType?: CustomerCenterContentType;
  title: string;
  body: string;
  heroImageUrl?: string | null;
  authorLabel?: string;
  viewCount?: number;
  commentCount?: number;
  createdAt: string;
  canonicalHref?: string;
  href?: string;
};

export function CustomerCenterBoardListClient({
  contentType,
}: {
  contentType: CustomerCenterContentType;
}) {
  const { safeT, language } = useI18n();
  const lang = language === "en" ? "en" : "ko";
  const [items, setItems] = useState<BoardListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const boardLabel = BOARD_LABEL[contentType][lang];

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await runSingleFlight(`me:cc:board:${contentType}`, () =>
          fetch(`/api/me/settings/notices?content_type=${encodeURIComponent(contentType)}`, {
            credentials: "include",
            cache: "no-store",
          })
        );
        const json = (await res.clone().json().catch(() => ({}))) as {
          ok?: boolean;
          notices?: BoardListItem[];
          error?: string;
        };
        if (cancelled) return;
        if (!res.ok || !json.ok) {
          setError(
            typeof json.error === "string"
              ? json.error
              : safeT("settings_notices_load_failed", {
                  fallbackKo: "목록을 불러오지 못했습니다",
                  fallbackEn: "Could not load the list",
                })
          );
          return;
        }
        setItems(Array.isArray(json.notices) ? json.notices : []);
      } catch {
        if (!cancelled) {
          setError(
            safeT("settings_notices_load_failed", {
              fallbackKo: "목록을 불러오지 못했습니다",
              fallbackEn: "Could not load the list",
            })
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [contentType, safeT]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((n) => {
      const title = String(n.title ?? "").toLowerCase();
      const body = excerptCustomerCenterMarkdown(String(n.body ?? ""), 200).toLowerCase();
      return title.includes(q) || body.includes(q);
    });
  }, [items, query]);

  const sections = useMemo(
    () => groupCustomerCenterItemsByDate(filtered, lang),
    [filtered, lang]
  );

  const formatRowDate = (iso: string) => {
    const value = new Date(iso);
    if (Number.isNaN(value.getTime())) return "";
    return value.toLocaleDateString(lang === "ko" ? "ko-KR" : "en-US", {
      month: "numeric",
      day: "numeric",
    });
  };

  return (
    <div
      className={`${CUSTOMER_CENTER_PAGE_SHELL_CLASS} ${CC_PAGE_BG_CLASS}`}
      data-testid={`cc-board-${contentType}`}
    >
      <MySubpageHeader
        title={boardLabel}
        backHref={CUSTOMER_CENTER_HUB_HREF}
        preferHistoryBack={false}
        hideCtaStrip
        rightSlot={
          <button
            type="button"
            className="sam-header-action flex min-h-11 min-w-11 items-center justify-center text-[#0E5C3A]"
            aria-label={safeT("common_search", { fallbackKo: "검색", fallbackEn: "Search" })}
            aria-expanded={searchOpen}
            onClick={() => setSearchOpen((v) => !v)}
          >
            <Search className="h-5 w-5" strokeWidth={2} aria-hidden />
          </button>
        }
      />
      <div className={CUSTOMER_CENTER_SCROLL_BODY_CLASS}>
        <div className={`${CUSTOMER_CENTER_LIST_COLUMN_CLASS} px-3 sm:px-4`}>
          <CustomerCenterBoardSwitcher active={contentType} language={lang} />

          {searchOpen ? (
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={safeT("cc_board_search_placeholder", {
                fallbackKo: "제목·내용 검색",
                fallbackEn: "Search title or body",
              })}
              className="min-h-11 w-full rounded-full border border-[rgba(14,92,58,0.14)] bg-white px-4 text-[14px] text-[#1A2E24] outline-none ring-[#0E5C3A]/30 focus:ring-2"
            />
          ) : null}

          {loading ? (
            <p className={`py-12 text-center ${CC_BODY_CLASS} text-[#8F9D95]`}>
              {safeT("settings_notices_loading", {
                fallbackKo: "불러오는 중…",
                fallbackEn: "Loading…",
              })}
            </p>
          ) : error ? (
            <p className={`py-12 text-center ${CC_BODY_CLASS} text-red-600`}>{error}</p>
          ) : filtered.length === 0 ? (
            <p className={`py-12 text-center ${CC_BODY_CLASS} text-[#8F9D95]`}>
              {safeT("settings_notices_empty", {
                fallbackKo: "게시글이 없습니다",
                fallbackEn: "No posts yet",
              })}
            </p>
          ) : (
            <div className="space-y-4">
              {sections.map((sec) => (
                <section key={sec.sectionKey} className="min-w-0">
                  <h2 className={`mb-2 px-0.5 ${CC_NOTE_CLASS} font-semibold text-[#0E5C3A]/80`}>
                    {sec.sectionLabel}
                  </h2>
                  <ul className={CC_CARD_CLASS}>
                    {sec.items.map((n, index) => {
                      const href =
                        n.canonicalHref?.trim() ||
                        buildCustomerCenterBoardDetailPath(contentType, n.id);
                      const hero = normalizeCustomerCenterHeroImageUrl(n.heroImageUrl);
                      const showThumb = contentType === "marketing" && Boolean(hero);
                      return (
                        <li
                          key={n.id}
                          className={
                            index === 0 ? "" : "border-t border-[rgba(14,92,58,0.08)]"
                          }
                        >
                          <Link
                            href={href}
                            className="flex min-w-0 items-start gap-3 px-3.5 py-3.5 transition active:bg-[#E8F7EF]/60 sm:px-4"
                          >
                            <CustomerCenterBoardTypeIcon contentType={contentType} />
                            <span className="min-w-0 flex-1">
                              <span className="flex min-w-0 items-start justify-between gap-2">
                                <span className={CC_CATEGORY_CHIP_CLASS}>{boardLabel}</span>
                                <span className={`shrink-0 tabular-nums ${CC_NOTE_CLASS}`}>
                                  {formatRowDate(n.createdAt)}
                                </span>
                              </span>
                              <span className={`mt-1.5 block line-clamp-1 break-words ${CC_HEADER_CLASS}`}>
                                {n.title}
                              </span>
                              <span
                                className={`mt-0.5 block line-clamp-1 break-words ${CC_NOTE_CLASS}`}
                              >
                                {excerptCustomerCenterMarkdown(String(n.body ?? ""), 90)}
                              </span>
                            </span>
                            {showThumb ? (
                              <span className="mt-0.5 h-14 w-14 shrink-0 overflow-hidden rounded-xl border border-[rgba(14,92,58,0.1)] bg-[#F5F7F6] sm:h-16 sm:w-16">
                                <CustomerCenterContentMedia src={hero} alt="" variant="thumb" />
                              </span>
                            ) : (
                              <ChevronRight
                                className="mt-2 h-4 w-4 shrink-0 text-[#8F9D95]"
                                strokeWidth={2}
                                aria-hidden
                              />
                            )}
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
