"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Star } from "lucide-react";
import { useRefetchOnPageShowRestore } from "@/lib/ui/use-refetch-on-page-show";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import { TEST_AUTH_CHANGED_EVENT } from "@/lib/auth/test-auth-store";
import { formatAdminReviewTagKeys } from "@/lib/admin-reviews/admin-review-utils";
import { MyWrittenReviewsView } from "@/components/mypage/reviews/MyWrittenReviewsView";
import { TradeManagementTabBar } from "@/components/mypage/TradeManagementTabBar";
import { runSingleFlight } from "@/lib/http/run-single-flight";
import { MyListPager, MyStateView } from "@/components/mypage/ds";
import { formatMypageDate, formatMypageMoney } from "@/lib/mypage/format-mypage-date";
import { useMypageTabParam } from "@/lib/mypage/use-mypage-tab-param";
import { useMypageListRestore } from "@/lib/mypage/use-mypage-list-restore";
import {
  fetchMypageListJson,
  useMypageCursorList,
  type MypageCursorPage,
} from "@/lib/mypage/use-mypage-cursor-list";
import { MYPAGE_LIST_PAGE_DEFAULT } from "@/lib/mypage/mypage-list-cursor";
import { tradeHubChatRoomHref } from "@/lib/chats/surfaces/trade-chat-surface";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { SamarketThumbnail } from "@/components/common/SamarketThumbnail";

/** CUT D — read-only review history (received / written). No pending write tab. */
export type TradeReviewManageTabId = "received" | "written";

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

export interface MyReceivedReviewItem {
  id: string;
  roomId: string;
  productId: string;
  title: string;
  thumbnail: string;
  price: number;
  reviewerId: string;
  reviewerNickname: string;
  reviewerUsername?: string | null;
  roleType: string;
  publicReviewType: "good" | "normal" | "bad";
  positiveTagKeys: string[];
  negativeTagKeys: string[];
  comment: string;
  isAnonymousNegative: boolean;
  createdAt: string;
}

function ReceivedReviewCard({ it }: { it: MyReceivedReviewItem }) {
  const { t } = useI18n();
  const fromBuyer = it.roleType === "buyer_to_seller";
  const counterpartyLabel = fromBuyer ? t("mypage_comp_actor_buyer") : t("mypage_comp_actor_owner");
  const tags = tagLine(t, it.roleType, it.positiveTagKeys, it.negativeTagKeys);
  const detailHref = it.roomId
    ? fromBuyer
      ? "/mypage/trade/sales"
      : tradeHubChatRoomHref(it.roomId, "product_chat")
    : fromBuyer
      ? "/mypage/trade/sales"
      : "/mypage/trade";

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
              {counterpartyLabel} {it.reviewerNickname}
            </p>
            {it.reviewerUsername ? (
              <p className="mt-0.5 truncate font-mono sam-text-xxs text-sam-muted tabular-nums">
                @{it.reviewerUsername}
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
              {t("mypage_comp_review_received_date_prefix")} {formatMypageDate(it.createdAt, { style: "datetime" })}
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
          {t("mypage_comp_purchase_detail_view")}
        </Link>
      </div>
    </li>
  );
}

const REVIEW_TAB_IDS = ["received", "written"] as const satisfies readonly TradeReviewManageTabId[];

/** A3 페이지 — `?limit=&cursor=` (`total` 은 첫 페이지만) */
export async function fetchTradeReviewsPage<T>(
  kind: TradeReviewManageTabId,
  cursor: string | null,
  limit = MYPAGE_LIST_PAGE_DEFAULT
): Promise<MypageCursorPage<T> & { total?: number }> {
  const qs = new URLSearchParams({ limit: String(limit) });
  if (cursor) qs.set("cursor", cursor);
  const d = await fetchMypageListJson<{ items?: T[]; next_cursor?: string | null; total?: number }>(
    `/api/my/${kind}-reviews?${qs}`
  );
  return {
    items: Array.isArray(d.items) ? d.items : [],
    next_cursor: d.next_cursor ?? null,
    ...(typeof d.total === "number" ? { total: d.total } : {}),
  };
}

/** 스켈레톤 — 카드 4개(아이콘 원 + 3줄 + 하단 버튼 2개) */
export function TradeReviewsSkeleton() {
  const bone = "rounded-ui-rect bg-sam-border-soft/70 motion-safe:animate-pulse";
  return (
    <ul aria-busy="true" data-testid="trade-reviews-skeleton" className="space-y-2">
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

/**
 * 거래 후기 (최종 설계 S24) — 탭 [받은 후기 · 보낸 후기](개수 = A3 첫 페이지 `total`) · `?tab=`(`syncUrl` 일 때).
 * 활성 탭 1요청 + 다른 탭 개수 1요청(`limit=1`). 오류는 탭별 오류+재시도(빈 목록 금지).
 */
type TradeReviewsManagementViewProps = {
  initialTab?: TradeReviewManageTabId;
  /** `/mypage/trade/reviews` 화면 — 탭을 `?tab=` 로 유지 */
  syncUrl?: boolean;
};

export function TradeReviewsManagementView(props: TradeReviewsManagementViewProps = {}) {
  return props.syncUrl ? <TradeReviewsUrlTab /> : <TradeReviewsLocalTab initialTab={props.initialTab} />;
}

/** `useSearchParams` 는 URL 동기화 화면에서만 — 홈 시트·패널 임베드는 로컬 상태 */
function TradeReviewsUrlTab() {
  const [tab, setTab] = useMypageTabParam<TradeReviewManageTabId>({
    values: REVIEW_TAB_IDS,
    defaultValue: "received",
  });
  return <TradeReviewsBody tab={tab} setTab={setTab} />;
}

function TradeReviewsLocalTab({ initialTab }: { initialTab?: TradeReviewManageTabId }) {
  const [tab, setTab] = useState<TradeReviewManageTabId>(initialTab ?? "received");
  useEffect(() => {
    if (initialTab === "received" || initialTab === "written") setTab(initialTab);
  }, [initialTab]);
  return <TradeReviewsBody tab={tab} setTab={setTab} />;
}

function TradeReviewsBody({
  tab,
  setTab,
}: {
  tab: TradeReviewManageTabId;
  setTab: (next: TradeReviewManageTabId) => void;
}) {
  const { t } = useI18n();
  const REVIEW_MANAGE_TABS: { id: TradeReviewManageTabId; label: string }[] = [
    { id: "received", label: t("mypage_comp_review_received_tab") },
    { id: "written", label: t("mypage_comp_review_written_tab") },
  ];
  const [totals, setTotals] = useState<Record<TradeReviewManageTabId, number | null>>({
    received: null,
    written: null,
  });
  const viewerId = getCurrentUser()?.id?.trim() ?? "";

  const onTotal = useCallback((kind: TradeReviewManageTabId, total: number) => {
    setTotals((prev) => (prev[kind] === total ? prev : { ...prev, [kind]: total }));
  }, []);

  /** 다른 탭 개수만 — `limit=1` 첫 페이지의 `total` */
  const otherTab: TradeReviewManageTabId = tab === "received" ? "written" : "received";
  const otherKnown = totals[otherTab] != null;
  useEffect(() => {
    if (!viewerId || otherKnown) return;
    let cancelled = false;
    void runSingleFlight(`mypage:trade-reviews:count:${otherTab}:${viewerId}`, () =>
      fetchTradeReviewsPage(otherTab, null, 1)
    )
      .then((r) => {
        if (!cancelled && typeof r.total === "number") onTotal(otherTab, r.total);
      })
      .catch(() => undefined); // 부분 오류 — 개수 칸만 비움
    return () => {
      cancelled = true;
    };
  }, [onTotal, otherKnown, otherTab, viewerId]);

  if (!viewerId) {
    return (
      <div className="rounded-ui-rect border border-sam-border-soft bg-sam-surface px-4 py-8 text-center">
        <p className="sam-text-body text-sam-muted">{t("mypage_comp_review_login_prompt")}</p>
        <a href="/mypage/account" className="mt-4 inline-block sam-text-body font-medium text-signature">
          {t("common_login")}
        </a>
      </div>
    );
  }

  const counts = { received: totals.received ?? 0, written: totals.written ?? 0 } as Record<
    TradeReviewManageTabId,
    number
  >;

  return (
    <div>
      <TradeManagementTabBar tabs={REVIEW_MANAGE_TABS} active={tab} counts={counts} onChange={setTab} />

      {tab === "received" ? <ReceivedReviewsPanel viewerId={viewerId} onTotal={onTotal} /> : null}

      {tab === "written" ? (
        <MyWrittenReviewsView variant="tabPanel" onTotal={(n) => onTotal("written", n)} />
      ) : null}
    </div>
  );
}

function ReceivedReviewsPanel({
  viewerId,
  onTotal,
}: {
  viewerId: string;
  onTotal: (kind: TradeReviewManageTabId, total: number) => void;
}) {
  const { t } = useI18n();
  const fetchPage = useCallback(
    async (cursor: string | null) => {
      const r = await fetchTradeReviewsPage<MyReceivedReviewItem>("received", cursor);
      if (typeof r.total === "number") onTotal("received", r.total);
      return r;
    },
    [onTotal]
  );
  const list = useMypageCursorList<MyReceivedReviewItem>({
    cacheKey: `mypage:trade-reviews:received:${viewerId}`,
    fetchPage,
    getId: (it) => it.id,
  });
  const { reload } = list;
  useMypageListRestore({ ready: list.status === "ready", loadedPages: list.pages });

  useEffect(() => {
    const onAuth = () => void reload();
    window.addEventListener(TEST_AUTH_CHANGED_EVENT, onAuth);
    return () => window.removeEventListener(TEST_AUTH_CHANGED_EVENT, onAuth);
  }, [reload]);
  useRefetchOnPageShowRestore(() => void reload());

  if (list.status === "loading") return <TradeReviewsSkeleton />;
  if (list.status === "error") {
    return (
      <MyStateView kind="error" error={{ message: t("common_fetch_list_failed"), onRetry: () => void reload() }} />
    );
  }
  if (list.items.length === 0) {
    return (
      <MyStateView
        kind="empty"
        empty={{ icon: <Star className="h-6 w-6" aria-hidden />, title: t("mypage_comp_review_received_empty") }}
      />
    );
  }
  return (
    <>
      <ul className="space-y-2">
        {list.items.map((it) => (
          <ReceivedReviewCard key={it.id} it={it} />
        ))}
      </ul>
      <MyListPager
        hasMore={Boolean(list.nextCursor)}
        loading={list.loadingMore}
        error={list.loadMoreError}
        onLoadMore={list.loadMore}
      />
    </>
  );
}
