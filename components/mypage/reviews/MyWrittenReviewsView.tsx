"use client";

import { useCallback, useEffect } from "react";
import { PenLine } from "lucide-react";
import { useRefetchOnPageShowRestore } from "@/lib/ui/use-refetch-on-page-show";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  tradeHubModeFromPathname,
  tradePurchaseDetailPath,
  tradePurchasesPath,
  tradeSalesPath,
} from "@/lib/mypage/trade-hub-paths";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import { TEST_AUTH_CHANGED_EVENT } from "@/lib/auth/test-auth-store";
import { formatAdminReviewTagKeys } from "@/lib/admin-reviews/admin-review-utils";
import { WRITTEN_REVIEW_UPDATED_EVENT } from "@/lib/mypage/written-review-events";
import { runSingleFlight } from "@/lib/http/run-single-flight";
import { MyListPager, MyStateView } from "@/components/mypage/ds";
import { formatMypageDate, formatMypageMoney } from "@/lib/mypage/format-mypage-date";
import { useMypageListRestore } from "@/lib/mypage/use-mypage-list-restore";
import { fetchMypageListJson, useMypageCursorList } from "@/lib/mypage/use-mypage-cursor-list";
import { MYPAGE_LIST_PAGE_DEFAULT } from "@/lib/mypage/mypage-list-cursor";
import { Sam } from "@/lib/ui/sam-component-classes";
import { tradeHubChatRoomHref } from "@/lib/chats/surfaces/trade-chat-surface";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { SamarketThumbnail } from "@/components/common/SamarketThumbnail";

export interface MyWrittenReviewItem {
  id: string;
  roomId: string;
  productId: string;
  title: string;
  thumbnail: string;
  price: number;
  revieweeId: string;
  revieweeNickname: string;
  revieweeUsername?: string | null;
  roleType: string;
  publicReviewType: "good" | "normal" | "bad";
  positiveTagKeys: string[];
  negativeTagKeys: string[];
  comment: string;
  isAnonymousNegative: boolean;
  createdAt: string;
}

function tagLine(
  t: ReturnType<typeof useI18n>["t"],
  roleType: string,
  positiveTagKeys: string[],
  negativeTagKeys: string[]
): string {
  const pos = formatAdminReviewTagKeys(t, roleType, positiveTagKeys);
  const neg = formatAdminReviewTagKeys(t, roleType, negativeTagKeys);
  const parts: string[] = [];
  if (pos !== "—") parts.push(`${t("mypage_comp_review_positive")}: ${pos}`);
  if (neg !== "—") parts.push(`${t("mypage_comp_review_negative")}: ${neg}`);
  return parts.length ? parts.join(" · ") : "";
}

export function WrittenReviewCard({ it }: { it: MyWrittenReviewItem; currency?: string }) {
  const { t } = useI18n();
  const pathname = usePathname() ?? "";
  const mode = tradeHubModeFromPathname(pathname);
  const isBuyerReview = it.roleType === "buyer_to_seller";
  const tags = tagLine(t, it.roleType, it.positiveTagKeys, it.negativeTagKeys);
  const detailHref = isBuyerReview
    ? it.roomId
      ? tradePurchaseDetailPath(mode, it.roomId)
      : tradePurchasesPath(mode)
    : tradeSalesPath(mode);
  const counterpartyLabel = isBuyerReview ? t("mypage_comp_actor_owner") : t("mypage_comp_actor_buyer");
  const detailLabel = isBuyerReview ? t("mypage_comp_purchase_detail_view") : t("mypage_comp_nav_sec_trade_sales_label");

  return (
    <li className="overflow-hidden rounded-ui-rect border border-sam-border-soft bg-sam-surface shadow-sm">
      <div className="flex gap-2 p-3">
        <Link href={detailHref} className="flex min-w-0 flex-1 gap-3">
          <div className="relative h-[72px] w-[72px] shrink-0 overflow-hidden rounded-ui-rect bg-sam-surface-muted">
            <SamarketThumbnail
              src={it.thumbnail}
              fill
              roundedClassName="rounded-ui-rect"
              className="bg-sam-surface-muted"
              fallbackSrc=""
              fallbackNode={
                <div className="flex h-full items-center justify-center sam-text-xxs text-sam-meta">
                  {t("mypage_comp_image_placeholder")}
                </div>
              }
            />
          </div>
          <div className="min-w-0 flex-1">
            <p className="line-clamp-2 sam-text-body font-medium text-sam-fg">{it.title || t("mypage_comp_image_placeholder")}</p>
            <p className="mt-0.5 sam-text-body font-bold text-sam-fg">{formatMypageMoney(it.price)}</p>
            <p className="mt-0.5 truncate sam-text-helper text-sam-muted">
              {counterpartyLabel} {it.revieweeNickname}
            </p>
            {it.revieweeUsername ? (
              <p className="mt-0.5 truncate font-mono sam-text-xxs text-sam-muted tabular-nums">
                @{it.revieweeUsername}
              </p>
            ) : null}
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              <span className="rounded-ui-rect bg-signature/5 px-1.5 py-0.5 sam-text-xxs font-medium text-sam-fg">
                {it.publicReviewType === "good"
                  ? t("mypage_comp_review_positive")
                  : it.publicReviewType === "bad"
                    ? t("mypage_comp_review_negative")
                    : t("mypage_comp_review_overall")}
              </span>
              {it.isAnonymousNegative ? (
                <span className="rounded-ui-rect bg-sam-surface-muted px-1.5 py-0.5 sam-text-xxs text-sam-muted">{t("mypage_comp_review_anonymous_badge")}</span>
              ) : null}
            </div>
            {tags ? (
              <p className="mt-1.5 line-clamp-2 sam-text-helper leading-snug text-sam-muted">{tags}</p>
            ) : null}
            {it.comment ? (
              <p className="mt-1 line-clamp-2 whitespace-pre-wrap sam-text-helper text-sam-fg">{it.comment}</p>
            ) : null}
            <p className="mt-1.5 sam-text-xxs text-sam-meta">
              {t("mypage_comp_review_written_at_prefix")} {formatMypageDate(it.createdAt, { style: "datetime" })}
            </p>
          </div>
        </Link>
      </div>
      <div className="flex gap-2 border-t border-sam-border-soft px-3 py-2">
        {it.roomId ? (
          <Link
            href={tradeHubChatRoomHref(it.roomId, "product_chat")}
            className="sam-text-body-secondary font-medium text-signature hover:underline"
          >
            {t("mypage_comp_trade_chat")}
          </Link>
        ) : null}
        <Link href={detailHref} className="sam-text-body-secondary font-medium text-signature hover:underline">
          {detailLabel}
        </Link>
      </div>
    </li>
  );
}

/**
 * 보낸(작성한) 거래 후기 (최종 설계 S24 보낸 탭) — A3 커서 페이지(`?limit=20&cursor=`), 첫 페이지 `total` → `onTotal`.
 * 조회 실패는 빈 목록이 아니라 오류 + 다시 시도.
 */
export function MyWrittenReviewsView({
  variant = "default",
  onTotal,
}: { variant?: "default" | "tradeHub" | "tabPanel"; onTotal?: (total: number) => void } = {}) {
  const { t } = useI18n();
  const pathname = usePathname() ?? "";
  const hubPurchasesPath = tradePurchasesPath(tradeHubModeFromPathname(pathname));
  const viewerId = getCurrentUser()?.id?.trim() ?? "";

  const fetchPage = useCallback(
    async (cursor: string | null) => {
      const qs = new URLSearchParams({ limit: String(MYPAGE_LIST_PAGE_DEFAULT) });
      if (cursor) qs.set("cursor", cursor);
      const d = await runSingleFlight(`me:written-reviews:get:${cursor ?? ""}`, () =>
        fetchMypageListJson<{ items?: MyWrittenReviewItem[]; next_cursor?: string | null; total?: number }>(
          `/api/my/written-reviews?${qs}`
        )
      );
      if (typeof d.total === "number") onTotal?.(d.total);
      return { items: Array.isArray(d.items) ? d.items : [], next_cursor: d.next_cursor ?? null };
    },
    [onTotal]
  );
  const list = useMypageCursorList<MyWrittenReviewItem>({
    cacheKey: viewerId ? `mypage:trade-reviews:written:${viewerId}` : null,
    fetchPage,
    getId: (it) => it.id,
  });
  const { reload } = list;
  const items = list.items;
  useMypageListRestore({ ready: list.status === "ready", loadedPages: list.pages });

  useEffect(() => {
    const onAuth = () => void reload();
    const onWritten = () => void reload();
    window.addEventListener(TEST_AUTH_CHANGED_EVENT, onAuth);
    window.addEventListener(WRITTEN_REVIEW_UPDATED_EVENT, onWritten);
    return () => {
      window.removeEventListener(TEST_AUTH_CHANGED_EVENT, onAuth);
      window.removeEventListener(WRITTEN_REVIEW_UPDATED_EVENT, onWritten);
    };
  }, [reload]);

  useRefetchOnPageShowRestore(() => void reload());

  const pager = (
    <MyListPager
      hasMore={Boolean(list.nextCursor)}
      loading={list.loadingMore}
      error={list.loadMoreError}
      onLoadMore={list.loadMore}
    />
  );

  if (viewerId && list.status === "loading") {
    return <WrittenReviewsSkeleton />;
  }

  if (viewerId && list.status === "error") {
    return (
      <MyStateView kind="error" error={{ message: t("common_fetch_list_failed"), onRetry: () => void reload() }} />
    );
  }

  if (variant === "tabPanel") {
    if (items.length === 0) {
      return (
        <MyStateView
          kind="empty"
          empty={{
            icon: <PenLine className="h-6 w-6" aria-hidden />,
            title: t("mypage_comp_review_written_empty"),
            body: t("mypage_comp_review_written_hint"),
          }}
        />
      );
    }
    return (
      <>
        <ul className="space-y-2">
          {items.map((it) => (
            <WrittenReviewCard key={it.id} it={it} />
          ))}
        </ul>
        {pager}
      </>
    );
  }

  if (variant === "tradeHub") {
    const buyerItems = items.filter((i) => i.roleType === "buyer_to_seller");
    const sellerItems = items.filter((i) => i.roleType === "seller_to_buyer");

    if (items.length === 0) {
      return (
        <div className="rounded-ui-rect border border-sam-border-soft bg-sam-surface px-4 py-6 text-center">
          <p className="sam-text-body text-sam-muted">{t("mypage_comp_review_written_empty_alt")}</p>
          <p className="mt-1 sam-text-body-secondary text-sam-muted">{t("mypage_comp_review_written_hint")}</p>
        </div>
      );
    }

    return (
      <div className="space-y-8">
        <div>
          <h4 className="sam-text-body font-semibold text-sam-fg">{t("mypage_comp_review_buy_heading")}</h4>
          <p className="mt-0.5 sam-text-helper text-sam-muted">{t("mypage_comp_review_buy_desc")}</p>
          {buyerItems.length === 0 ? (
            <p className="mt-3 text-center sam-text-body-secondary text-sam-muted">{t("mypage_comp_review_buy_empty")}</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {buyerItems.map((it) => (
                <WrittenReviewCard key={it.id} it={it} />
              ))}
            </ul>
          )}
        </div>
        <div className="border-t border-sam-border-soft pt-6">
          <h4 className="sam-text-body font-semibold text-sam-fg">{t("mypage_comp_review_sell_heading")}</h4>
          <p className="mt-0.5 sam-text-helper text-sam-muted">{t("mypage_comp_review_sell_desc")}</p>
          {sellerItems.length === 0 ? (
            <p className="mt-3 text-center sam-text-body-secondary text-sam-muted">{t("mypage_comp_review_sell_empty")}</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {sellerItems.map((it) => (
                <WrittenReviewCard key={it.id} it={it} />
              ))}
            </ul>
          )}
        </div>
        {pager}
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="space-y-4 rounded-ui-rect border border-sam-border bg-sam-surface px-4 py-8 text-center">
        <p className="sam-text-body text-sam-muted">{t("mypage_comp_review_written_empty_alt")}</p>
        <p className="sam-text-body-secondary text-sam-muted">{t("mypage_comp_review_written_hint_purchase")}</p>
        <Link
          href={hubPurchasesPath}
          className={`${Sam.btn.primaryCombo} ${Sam.btn.sm} inline-flex items-center justify-center`}
        >
          {t("nav_trade_hub_chat")}
        </Link>
      </div>
    );
  }

  return (
    <>
      <ul className="space-y-2">
        {items.map((it) => (
          <WrittenReviewCard key={it.id} it={it} />
        ))}
      </ul>
      {pager}
    </>
  );
}

/** 스켈레톤 — 카드 4개(아이콘 원 + 3줄 + 하단 버튼 2개), 받은 탭과 같은 모양 */
function WrittenReviewsSkeleton() {
  const bone = "rounded-ui-rect bg-sam-border-soft/70 motion-safe:animate-pulse";
  return (
    <ul aria-busy="true" data-testid="written-reviews-skeleton" className="space-y-2">
      {Array.from({ length: 4 }, (_, i) => (
        <li key={i} className="overflow-hidden rounded-ui-rect border border-sam-border-soft bg-sam-surface">
          <div className="flex gap-3 p-3">
            <span className="h-10 w-10 shrink-0 rounded-full bg-sam-border-soft/70 motion-safe:animate-pulse" />
            <span className="flex min-w-0 flex-1 flex-col gap-2">
              <span className={`h-3.5 w-[60%] ${bone}`} />
              <span className={`h-3 w-[45%] ${bone}`} />
              <span className={`h-3 w-[30%] ${bone}`} />
            </span>
          </div>
          <div className="flex gap-3 border-t border-sam-border-soft px-3 py-2">
            <span className={`h-3.5 w-16 ${bone}`} />
            <span className={`h-3.5 w-16 ${bone}`} />
          </div>
        </li>
      ))}
    </ul>
  );
}
