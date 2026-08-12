"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { MySubpageHeader } from "@/components/my/MySubpageHeader";
import { runSingleFlight } from "@/lib/http/run-single-flight";
import {
  BOARD_LABEL,
  type CustomerCenterContentType,
} from "@/lib/notices/customer-center-content";
import { customerCenterPlainExcerpt } from "@/lib/notices/customer-center-safe-markdown";
import {
  buildCustomerCenterBoardDetailPath,
  CUSTOMER_CENTER_HUB_HREF,
} from "@/lib/notices/customer-center-content-paths";
import {
  CUSTOMER_CENTER_LIST_COLUMN_CLASS,
  CUSTOMER_CENTER_PAGE_SHELL_CLASS,
  CUSTOMER_CENTER_SCROLL_BODY_CLASS,
} from "@/lib/mypage/customer-center-layout";

type BoardListItem = {
  id: string;
  contentType?: CustomerCenterContentType;
  title: string;
  body: string;
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
  const [items, setItems] = useState<BoardListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const boardLabel = BOARD_LABEL[contentType][language === "en" ? "en" : "ko"];

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

  const formatDate = (iso: string) => {
    const value = new Date(iso);
    if (Number.isNaN(value.getTime())) return "";
    return value.toLocaleDateString(language === "ko" ? "ko-KR" : "en-US");
  };

  return (
    <div className={CUSTOMER_CENTER_PAGE_SHELL_CLASS} data-testid={`cc-board-${contentType}`}>
      <MySubpageHeader
        title={boardLabel}
        backHref={CUSTOMER_CENTER_HUB_HREF}
        preferHistoryBack={false}
        hideCtaStrip
      />
      <div className={CUSTOMER_CENTER_SCROLL_BODY_CLASS}>
        <div className={CUSTOMER_CENTER_LIST_COLUMN_CLASS}>
          {loading ? (
            <p className="py-12 text-center sam-text-body text-sam-muted">
              {safeT("settings_notices_loading", {
                fallbackKo: "불러오는 중…",
                fallbackEn: "Loading…",
              })}
            </p>
          ) : error ? (
            <p className="py-12 text-center sam-text-body text-red-600">{error}</p>
          ) : items.length === 0 ? (
            <p className="py-12 text-center sam-text-body text-sam-muted">
              {safeT("settings_notices_empty", {
                fallbackKo: "게시글이 없습니다",
                fallbackEn: "No posts yet",
              })}
            </p>
          ) : (
            <ul className="divide-y divide-sam-border-soft rounded-ui-rect border border-sam-border bg-sam-surface">
              {items.map((n) => {
                const href =
                  n.canonicalHref?.trim() ||
                  buildCustomerCenterBoardDetailPath(contentType, n.id);
                return (
                  <li key={n.id}>
                    <Link href={href} className="block px-4 py-3 transition hover:bg-sam-muted/10">
                      <p className="break-words font-medium text-sam-fg">{n.title}</p>
                      <p className="mt-1 line-clamp-2 break-words text-sm text-sam-muted">
                        {customerCenterPlainExcerpt(n.body)}
                      </p>
                      <p className="mt-1 text-xs text-sam-meta">
                        {[
                          n.authorLabel,
                          formatDate(n.createdAt),
                          typeof n.viewCount === "number" ? `조회 ${n.viewCount}` : null,
                          typeof n.commentCount === "number" ? `댓글 ${n.commentCount}` : null,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
