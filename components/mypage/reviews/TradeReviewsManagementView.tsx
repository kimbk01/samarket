"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRefetchOnPageShowRestore } from "@/lib/ui/use-refetch-on-page-show";
import { getAppSettings } from "@/lib/app-settings";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import { TEST_AUTH_CHANGED_EVENT } from "@/lib/auth/test-auth-store";
import { formatPrice } from "@/lib/utils/format";
import { formatAdminReviewTagKeys } from "@/lib/admin-reviews/admin-review-utils";
import { getBuyerManageTabId } from "@/lib/mypage/buyer-manage-tabs";
import { getSellerManageTabId } from "@/lib/mypage/seller-manage-tabs";
import {
  PurchaseHistoryCard,
  type PurchaseHistoryRow,
} from "@/components/mypage/purchases/PurchaseHistoryCard";
import { SalesHistoryCard, type SalesHistoryRow } from "@/components/mypage/sales/SalesHistoryCard";
import { TradeManagementTabBar } from "@/components/mypage/TradeManagementTabBar";
import { MyWrittenReviewsView } from "@/components/mypage/reviews/MyWrittenReviewsView";
import { runSingleFlight } from "@/lib/http/run-single-flight";
import {
  fetchTradeHistoryPurchasesBySession,
  fetchTradeHistorySalesBySession,
  invalidateTradeHistoryCache,
} from "@/lib/mypage/trade-history-client";
import { tradeHubChatRoomHref } from "@/lib/chats/surfaces/trade-chat-surface";
import { useI18n } from "@/components/i18n/AppLanguageProvider";

export type TradeReviewManageTabId = "received" | "written" | "pending" | "hidden_review";

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

function ReceivedReviewCard({ it, currency }: { it: MyReceivedReviewItem; currency: string }) {
  const { t } = useI18n();
  const fromBuyer = it.roleType === "buyer_to_seller";
  const counterpartyLabel = fromBuyer ? t("mypage_comp_actor_buyer") : t("mypage_comp_actor_owner");
  const tags = tagLine(t, it.roleType, it.positiveTagKeys, it.negativeTagKeys);
  const detailHref = it.roomId
    ? fromBuyer
      ? `/mypage/sales`
      : `/mypage/purchases/${encodeURIComponent(it.roomId)}`
    : fromBuyer
      ? "/mypage/sales"
      : "/mypage/purchases";

  return (
    <li className="overflow-hidden rounded-ui-rect border border-sam-border-soft bg-sam-surface shadow-sm">
      <div className="flex gap-2 p-3">
        <Link href={detailHref} className="flex min-w-0 flex-1 gap-3">
          <div className="relative h-[72px] w-[72px] shrink-0 overflow-hidden rounded-ui-rect bg-sam-surface-muted">
            {it.thumbnail ? (
              <img src={it.thumbnail} alt="" className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full items-center justify-center sam-text-xxs text-sam-meta">{t("mypage_comp_image_placeholder")}</div>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="line-clamp-2 sam-text-body font-medium text-sam-fg">{it.title || t("mypage_comp_image_placeholder")}</p>
            <p className="mt-0.5 sam-text-body font-bold text-sam-fg">{formatPrice(it.price, currency)}</p>
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
              {t("mypage_comp_review_received_date_prefix")} {new Date(it.createdAt).toLocaleString()}
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
            {t("mypage_comp_order_chat")}
          </Link>
        ) : null}
        <Link href={detailHref} className="sam-text-body-secondary font-medium text-signature hover:underline">
          {t("mypage_comp_purchase_detail_view")}
        </Link>
      </div>
    </li>
  );
}

export function TradeReviewsManagementView({
  initialTab,
}: {
  initialTab?: TradeReviewManageTabId;
} = {}) {
  const { t } = useI18n();
  const REVIEW_MANAGE_TABS: { id: TradeReviewManageTabId; label: string }[] = [
    { id: "received", label: t("mypage_comp_review_received_tab") },
    { id: "written", label: t("mypage_comp_review_written_tab") },
    { id: "pending", label: t("mypage_comp_review_pending_tab") },
    { id: "hidden_review", label: t("mypage_comp_review_hidden_tab") },
  ];
  const currency = getAppSettings().defaultCurrency ?? "KRW";
  const [tab, setTab] = useState<TradeReviewManageTabId>(initialTab ?? "received");
  const [received, setReceived] = useState<MyReceivedReviewItem[]>([]);
  const [writtenCount, setWrittenCount] = useState(0);
  const [purchases, setPurchases] = useState<PurchaseHistoryRow[]>([]);
  const [sales, setSales] = useState<SalesHistoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [mounted, setMounted] = useState(false);

  const viewerId = getCurrentUser()?.id?.trim() ?? "";

  const load = useCallback((opts?: { silent?: boolean; force?: boolean }) => {
    const silent = !!opts?.silent;
    if (!silent) setLoading(true);
    const init: RequestInit = { credentials: "include", cache: "no-store" };
    const force = !!opts?.force;

    void (async () => {
      try {
        const [recv, writLen, pur, sal] = await runSingleFlight(
          `mypage:trade-reviews-management:load${force ? ":force" : ""}`,
          () =>
            Promise.all([
              fetch("/api/my/received-reviews", init).then(async (r) => {
                const d = (await r.json().catch(() => ({}))) as { items?: MyReceivedReviewItem[] };
                return r.ok && Array.isArray(d.items) ? d.items : [];
              }),
              fetch("/api/my/written-reviews", init).then(async (r) => {
                const d = (await r.json().catch(() => ({}))) as { items?: unknown[] };
                return r.ok && Array.isArray(d.items) ? d.items.length : 0;
              }),
              fetchTradeHistoryPurchasesBySession({ force }),
              fetchTradeHistorySalesBySession({ force }),
            ])
        );
        setReceived(recv);
        setWrittenCount(writLen);
        setPurchases(pur);
        setSales(sal);
      } catch {
        if (!silent) {
          setReceived([]);
          setWrittenCount(0);
          setPurchases([]);
          setSales([]);
        }
      } finally {
        if (!silent) setLoading(false);
      }
    })();
  }, []);

  const reload = useCallback(() => {
    void load({ force: true });
  }, [load]);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    void load();
  }, [mounted, load]);

  useEffect(() => {
    const onAuth = () => {
      invalidateTradeHistoryCache();
      void load({ force: true });
    };
    window.addEventListener(TEST_AUTH_CHANGED_EVENT, onAuth);
    return () => window.removeEventListener(TEST_AUTH_CHANGED_EVENT, onAuth);
  }, [load]);

  useRefetchOnPageShowRestore(() => void load({ silent: true }));

  useEffect(() => {
    if (initialTab) setTab(initialTab);
  }, [initialTab]);

  const pendingPurchases = useMemo(() => {
    if (!viewerId) return [];
    return purchases.filter((row) => getBuyerManageTabId(row, viewerId) === "review_wait");
  }, [purchases, viewerId]);

  const pendingSales = useMemo(() => {
    return sales.filter((row) => getSellerManageTabId(row) === "review_wait");
  }, [sales]);

  const hiddenReviewCount = 0;

  const counts = useMemo(
    () =>
      ({
        received: received.length,
        written: writtenCount,
        pending: pendingPurchases.length + pendingSales.length,
        hidden_review: hiddenReviewCount,
      }) as Record<TradeReviewManageTabId, number>,
    [received.length, writtenCount, pendingPurchases.length, pendingSales.length]
  );

  if (!mounted) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-center">
        <div className="h-8 w-8 animate-pulse rounded-full bg-sam-border-soft" />
        <p className="mt-3 sam-text-body text-sam-muted">{t("mypage_comp_loading_short")}</p>
      </div>
    );
  }

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

  if (loading) {
    return <p className="py-10 text-center sam-text-body text-sam-muted">{t("mypage_comp_loading_short")}</p>;
  }

  return (
    <div>
      <TradeManagementTabBar tabs={REVIEW_MANAGE_TABS} active={tab} counts={counts} onChange={setTab} />

      {tab === "received" ? (
        received.length === 0 ? (
          <p className="py-10 text-center sam-text-body text-sam-muted">{t("mypage_comp_review_received_empty")}</p>
        ) : (
          <ul className="space-y-2">
            {received.map((it) => (
              <ReceivedReviewCard key={it.id} it={it} currency={currency} />
            ))}
          </ul>
        )
      ) : null}

      {tab === "written" ? <MyWrittenReviewsView variant="tabPanel" /> : null}

      {tab === "pending" ? (
        pendingPurchases.length === 0 && pendingSales.length === 0 ? (
          <p className="py-10 text-center sam-text-body text-sam-muted">{t("mypage_comp_review_pending_empty")}</p>
        ) : (
          <div className="space-y-6">
            {pendingPurchases.length > 0 ? (
              <div>
                <h4 className="sam-text-body font-semibold text-sam-fg">{t("mypage_comp_review_pending_buy_heading")}</h4>
                <p className="mt-0.5 sam-text-helper text-sam-muted">{t("mypage_comp_review_pending_buy_desc")}</p>
                <ul className="mt-3 space-y-2">
                  {pendingPurchases.map((row) => (
                    <PurchaseHistoryCard
                      key={row.chatId}
                      row={row}
                      viewerId={viewerId}
                      currency={currency}
                      onReload={reload}
                    />
                  ))}
                </ul>
              </div>
            ) : null}
            {pendingSales.length > 0 ? (
              <div className={pendingPurchases.length > 0 ? "border-t border-sam-border-soft pt-6" : ""}>
                <h4 className="sam-text-body font-semibold text-sam-fg">{t("mypage_comp_review_pending_sell_heading")}</h4>
                <p className="mt-0.5 sam-text-helper text-sam-muted">{t("mypage_comp_review_pending_sell_desc")}</p>
                <ul className="mt-3 space-y-2">
                  {pendingSales.map((row) => (
                    <SalesHistoryCard
                      key={row.chatId ? row.chatId : `post-${row.postId}`}
                      row={row}
                      currency={currency}
                      viewerId={viewerId}
                      onReload={reload}
                    />
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        )
      ) : null}

      {tab === "hidden_review" ? (
        <div className="rounded-ui-rect border border-sam-border-soft bg-sam-surface px-4 py-8 text-center">
          <p className="sam-text-body text-sam-muted">{t("mypage_comp_review_hidden_empty")}</p>
          <p className="mt-2 sam-text-helper text-sam-muted">
            {t("mypage_comp_review_hidden_hint")}
          </p>
        </div>
      ) : null}
    </div>
  );
}
