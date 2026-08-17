"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRefetchOnPageShowRestore } from "@/lib/ui/use-refetch-on-page-show";
import { getAppSettings } from "@/lib/app-settings";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import { TEST_AUTH_CHANGED_EVENT } from "@/lib/auth/test-auth-store";
import { formatPrice } from "@/lib/utils/format";
import { formatAdminReviewTagKeys } from "@/lib/admin-reviews/admin-review-utils";
import { MyWrittenReviewsView } from "@/components/mypage/reviews/MyWrittenReviewsView";
import { TradeManagementTabBar } from "@/components/mypage/TradeManagementTabBar";
import { runSingleFlight } from "@/lib/http/run-single-flight";
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

function ReceivedReviewCard({ it, currency }: { it: MyReceivedReviewItem; currency: string }) {
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
  ];
  const currency = getAppSettings().defaultCurrency ?? "KRW";
  const [tab, setTab] = useState<TradeReviewManageTabId>(initialTab ?? "received");
  const [received, setReceived] = useState<MyReceivedReviewItem[]>([]);
  const [writtenCount, setWrittenCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [mounted, setMounted] = useState(false);

  const load = useCallback((opts?: { silent?: boolean }) => {
    const silent = !!opts?.silent;
    if (!silent) setLoading(true);
    const init: RequestInit = { credentials: "include", cache: "no-store" };

    void (async () => {
      try {
        const [recv, writLen] = await runSingleFlight("mypage:trade-reviews-management:load", () =>
          Promise.all([
            fetch("/api/my/received-reviews", init).then(async (r) => {
              const d = (await r.json().catch(() => ({}))) as { items?: MyReceivedReviewItem[] };
              return r.ok && Array.isArray(d.items) ? d.items : [];
            }),
            fetch("/api/my/written-reviews", init).then(async (r) => {
              const d = (await r.json().catch(() => ({}))) as { items?: unknown[] };
              return r.ok && Array.isArray(d.items) ? d.items.length : 0;
            }),
          ])
        );
        setReceived(recv);
        setWrittenCount(writLen);
      } catch {
        if (!silent) {
          setReceived([]);
          setWrittenCount(0);
        }
      } finally {
        if (!silent) setLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    void load();
  }, [mounted, load]);

  useEffect(() => {
    const onAuth = () => void load({ silent: false });
    window.addEventListener(TEST_AUTH_CHANGED_EVENT, onAuth);
    return () => window.removeEventListener(TEST_AUTH_CHANGED_EVENT, onAuth);
  }, [load]);

  useRefetchOnPageShowRestore(() => void load({ silent: true }));

  useEffect(() => {
    if (initialTab === "received" || initialTab === "written") setTab(initialTab);
  }, [initialTab]);

  const counts = useMemo(
    () =>
      ({
        received: received.length,
        written: writtenCount,
      }) as Record<TradeReviewManageTabId, number>,
    [received.length, writtenCount]
  );

  if (!mounted) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-center">
        <div className="h-8 w-8 animate-pulse rounded-full bg-sam-border-soft" />
        <p className="mt-3 sam-text-body text-sam-muted">{t("mypage_comp_loading_short")}</p>
      </div>
    );
  }

  const viewerId = getCurrentUser()?.id?.trim() ?? "";
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
    </div>
  );
}
