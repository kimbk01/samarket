"use client";

import { useCallback, useEffect, useState } from "react";
import { useRefetchOnPageShowRestore } from "@/lib/ui/use-refetch-on-page-show";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  tradeHubModeFromPathname,
  tradePurchaseDetailPath,
  tradePurchasesPath,
  tradeSalesPath,
} from "@/lib/mypage/trade-hub-paths";
import { getAppSettings } from "@/lib/app-settings";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import { TEST_AUTH_CHANGED_EVENT } from "@/lib/auth/test-auth-store";
import { formatPrice } from "@/lib/utils/format";
import { formatAdminReviewTagKeys } from "@/lib/admin-reviews/admin-review-utils";
import { WRITTEN_REVIEW_UPDATED_EVENT } from "@/lib/mypage/written-review-events";
import { runSingleFlight } from "@/lib/http/run-single-flight";
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

export function WrittenReviewCard({ it, currency }: { it: MyWrittenReviewItem; currency: string }) {
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
            <p className="mt-0.5 sam-text-body font-bold text-sam-fg">{formatPrice(it.price, currency)}</p>
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
              {t("mypage_comp_review_written_at_prefix")} {new Date(it.createdAt).toLocaleString()}
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
          {detailLabel}
        </Link>
      </div>
    </li>
  );
}

export function MyWrittenReviewsView({
  variant = "default",
}: { variant?: "default" | "tradeHub" | "tabPanel" } = {}) {
  const { t } = useI18n();
  const pathname = usePathname() ?? "";
  const hubPurchasesPath = tradePurchasesPath(tradeHubModeFromPathname(pathname));
  const currency = getAppSettings().defaultCurrency ?? "KRW";
  const [items, setItems] = useState<MyWrittenReviewItem[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback((opts?: { silent?: boolean }) => {
    const silent = !!opts?.silent;
    const user = getCurrentUser();
    const uid = user?.id?.trim();
    if (!uid) {
      setItems([]);
      if (!silent) setLoading(false);
      return;
    }
    if (!silent) setLoading(true);
    void (async () => {
      try {
        const r = await runSingleFlight("me:written-reviews:get", () =>
          fetch("/api/my/written-reviews", { credentials: "include", cache: "no-store" })
        );
        const d = (await r.clone().json()) as { items?: MyWrittenReviewItem[] };
        setItems(Array.isArray(d.items) ? d.items : []);
      } catch {
        if (!silent) setItems([]);
      } finally {
        if (!silent) setLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const onAuth = () => load();
    const onWritten = () => load();
    window.addEventListener(TEST_AUTH_CHANGED_EVENT, onAuth);
    window.addEventListener(WRITTEN_REVIEW_UPDATED_EVENT, onWritten);
    return () => {
      window.removeEventListener(TEST_AUTH_CHANGED_EVENT, onAuth);
      window.removeEventListener(WRITTEN_REVIEW_UPDATED_EVENT, onWritten);
    };
  }, [load]);

  useRefetchOnPageShowRestore(() => void load({ silent: true }));

  const pyClass = variant === "tradeHub" || variant === "tabPanel" ? "py-6" : "py-12";

  if (loading) {
    return <p className={`${pyClass} text-center sam-text-body text-sam-muted`}>{t("mypage_comp_loading_short")}</p>;
  }

  if (variant === "tabPanel") {
    if (items.length === 0) {
      return (
        <div className="rounded-ui-rect border border-sam-border-soft bg-sam-surface px-4 py-6 text-center">
          <p className="sam-text-body text-sam-muted">{t("mypage_comp_review_written_empty")}</p>
          <p className="mt-1 sam-text-helper text-sam-muted">{t("mypage_comp_review_written_hint")}</p>
        </div>
      );
    }
    return (
      <ul className="space-y-2">
        {items.map((it) => (
          <WrittenReviewCard key={it.id} it={it} currency={currency} />
        ))}
      </ul>
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
                <WrittenReviewCard key={it.id} it={it} currency={currency} />
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
                <WrittenReviewCard key={it.id} it={it} currency={currency} />
              ))}
            </ul>
          )}
        </div>
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
          className="inline-block rounded-ui-rect bg-signature px-4 py-2.5 sam-text-body font-medium text-white"
        >
          {t("nav_trade_hub_chat")}
        </Link>
      </div>
    );
  }

  return (
    <ul className="space-y-2">
      {items.map((it) => (
        <WrittenReviewCard key={it.id} it={it} currency={currency} />
      ))}
    </ul>
  );
}
