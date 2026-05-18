"use client";

import { useCallback, useEffect, useState } from "react";
import { useRefetchOnPageShowRestore } from "@/lib/ui/use-refetch-on-page-show";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatPrice } from "@/lib/utils/format";
import { getAppSettings } from "@/lib/app-settings";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import { runSingleFlight } from "@/lib/http/run-single-flight";
import { ReportActionSheet } from "@/components/reports/ReportActionSheet";
import {
  canShowPurchaseReviewSend,
  purchaseProductStatusBadge,
  purchaseReviewStatusBadge,
  purchaseTradeStatusBadge,
} from "@/lib/mypage/purchase-history-ui";
import { formatTradeListDatetime } from "@/lib/mypage/format-trade-datetime";
import { PurchaseReviewSheet } from "./PurchaseReviewSheet";
import { BuyerReviewReadSheet } from "./BuyerReviewReadSheet";
import type { PurchaseHistoryRow } from "./PurchaseHistoryCard";
import { tradeHubChatRoomHref } from "@/lib/chats/surfaces/trade-chat-surface";
import { useI18n } from "@/components/i18n/AppLanguageProvider";

type DetailPayload = PurchaseHistoryRow & {
  reviewDeadlineAt?: string | null;
};

export function PurchaseDetailView({
  chatId,
  purchasesListPath = "/mypage/purchases",
}: {
  chatId: string;
  /** 목록으로 링크 (`/mypage/purchases`) */
  purchasesListPath?: string;
}) {
  const { t } = useI18n();
  const router = useRouter();
  const currency = getAppSettings().defaultCurrency ?? "KRW";
  const [row, setRow] = useState<DetailPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [readOpen, setReadOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback((opts?: { silent?: boolean }) => {
    const silent = !!opts?.silent;
    const u = getCurrentUser()?.id?.trim();
    if (!u) {
      setRow(null);
      if (!silent) setLoading(false);
      return;
    }
    if (!silent) setLoading(true);
    void (async () => {
      try {
        const res = await runSingleFlight(`my-purchase-detail:${encodeURIComponent(chatId)}`, () =>
          fetch(`/api/my/purchases/${encodeURIComponent(chatId)}`, {
            credentials: "include",
            cache: "no-store",
          })
        );
        const data = (await res.clone().json().catch(() => ({}))) as DetailPayload & { error?: string };
        if (!res.ok) {
          if (!silent) setRow(null);
          return;
        }
        setRow(data as DetailPayload);
      } catch {
        if (!silent) setRow(null);
      } finally {
        if (!silent) setLoading(false);
      }
    })();
  }, [chatId]);

  useEffect(() => {
    load();
  }, [load]);

  useRefetchOnPageShowRestore(() => void load({ silent: true }));

  const viewerId = getCurrentUser()?.id?.trim() ?? "";

  if (loading) {
    return <p className="py-16 text-center sam-text-body text-sam-muted">{t("mypage_comp_loading_short")}</p>;
  }
  if (!row || !viewerId) {
    return (
      <div className="py-16 text-center">
        <p className="sam-text-body text-sam-muted">{t("mypage_comp_purchase_not_found")}</p>
        <Link href={purchasesListPath} className="mt-4 inline-block sam-text-body text-signature underline">
          {t("mypage_comp_purchase_back_to_list")}
        </Link>
      </div>
    );
  }

  const rowLike = {
    tradeFlowStatus: row.tradeFlowStatus,
    hasBuyerReview: row.hasBuyerReview,
    buyerConfirmSource: row.buyerConfirmSource,
  };
  const tradeBadge = purchaseTradeStatusBadge(rowLike);
  const reviewBadge = purchaseReviewStatusBadge(rowLike);
  const productBadge = purchaseProductStatusBadge(row.sellerListingState, row.status);
  const showReview = canShowPurchaseReviewSend(rowLike);
  const base = `/api/trade/product-chat/${encodeURIComponent(chatId)}`;
  const chatHref = tradeHubChatRoomHref(row.chatId, "product_chat");

  const post = (path: string) => {
    setBusy(path);
    fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    })
      .then(async (res) => {
        const data = (await res.json().catch(() => ({}))) as { ok?: boolean };
        if (res.ok && data.ok) {
          void load({ silent: false });
          if (path.endsWith("/buyer-confirm")) {
            setReviewOpen(true);
          }
        }
      })
      .finally(() => setBusy(null));
  };

  const flow = row.tradeFlowStatus ?? "chatting";

  return (
    <div className="space-y-4 pb-28">
      <section className="overflow-hidden rounded-ui-rect border border-sam-border-soft bg-sam-surface p-4 shadow-sm">
        <div className="flex gap-3">
          <div className="h-20 w-20 shrink-0 overflow-hidden rounded-ui-rect bg-sam-surface-muted">
            {row.thumbnail ? (
              <img src={row.thumbnail} alt="" className="h-full w-full object-cover" />
            ) : null}
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="sam-text-body-lg font-semibold text-sam-fg">{row.title || t("mypage_comp_image_placeholder")}</h2>
            <p className="mt-1 sam-text-section-title font-bold">{formatPrice(row.price, currency)}</p>
            <p className="mt-1 sam-text-body-secondary text-sam-muted">{t("mypage_comp_purchase_seller_line", { name: row.sellerNickname || "—" })}</p>
            <div className="mt-2 flex flex-wrap gap-1">
              <span className="rounded-ui-rect bg-amber-50 px-2 py-0.5 sam-text-xxs font-medium text-amber-900">
                {t("mypage_comp_order_items_heading")} · {productBadge}
              </span>
              <span className="rounded-ui-rect bg-sam-surface-muted px-2 py-0.5 sam-text-xxs font-medium text-sam-fg">
                {t("mypage_comp_timeline_section")} · {tradeBadge}
              </span>
              <span className="rounded-ui-rect bg-signature/5 px-2 py-0.5 sam-text-xxs font-medium text-sam-fg">
                {t("mypage_comp_nav_sec_trade_reviews_label")} · {reviewBadge}
              </span>
            </div>
          </div>
        </div>
        <div className="mt-3 rounded-ui-rect border border-sam-border bg-signature/5/80 px-3 py-3">
          <p className="sam-text-xxs font-semibold uppercase tracking-[0.08em] text-signature">{t("mypage_comp_purchase_context_heading")}</p>
          <p className="mt-1 sam-text-body-secondary leading-relaxed text-sam-fg">
            {t("mypage_comp_purchase_context_body")}
          </p>
        </div>
        {flow === "seller_marked_done" ? (
          <>
            <p className="mt-3 rounded-ui-rect bg-signature/5 px-3 py-2.5 sam-text-helper leading-snug text-sam-fg">
              {t("mypage_comp_purchase_seller_done_p1")}
              <strong className="font-semibold">{t("mypage_comp_purchase_trade_complete")}</strong>
              {t("mypage_comp_purchase_seller_done_p2")}
              <strong className="font-semibold">{t("mypage_comp_purchase_buyer_confirm")}</strong>
              {t("mypage_comp_purchase_seller_done_p3")}
              <strong className="font-semibold">{t("mypage_comp_purchase_review_step")}</strong>
              {t("mypage_comp_purchase_seller_done_p4")}
            </p>
            <div className="mt-3 flex flex-col gap-2">
              <button
                type="button"
                disabled={!!busy}
                onClick={() => post(`${base}/buyer-confirm`)}
                className="w-full rounded-ui-rect bg-signature py-3 text-center sam-text-body font-medium text-white disabled:opacity-50"
              >
                {busy?.endsWith("/buyer-confirm") ? t("mypage_comp_processing") : t("mypage_comp_purchase_buyer_confirm")}
              </button>
              <button
                type="button"
                disabled={!!busy}
                onClick={() => post(`${base}/buyer-issue`)}
                className="w-full rounded-ui-rect border border-sam-border bg-sam-surface py-2.5 sam-text-body font-medium text-sam-fg disabled:opacity-50"
              >
                {busy?.endsWith("/buyer-issue") ? t("mypage_comp_processing") : t("mypage_comp_report_problem")}
              </button>
            </div>
            <Link
              href={chatHref}
              className="mt-3 block w-full rounded-ui-rect border border-sam-border bg-signature/5 py-3 text-center sam-text-body font-medium text-sam-fg"
            >
              {t("mypage_comp_order_chat_revisit")}
            </Link>
          </>
        ) : (
          <Link
            href={chatHref}
            className="mt-4 block w-full rounded-ui-rect bg-signature py-3 text-center sam-text-body font-medium text-white"
          >
            {t("mypage_comp_order_chat_revisit")}
          </Link>
        )}
        {showReview && !row.hasBuyerReview && flow !== "seller_marked_done" ? (
          <div className="mt-4 rounded-ui-rect border border-sam-border bg-signature/10 p-3">
            <p className="sam-text-helper leading-snug text-sam-fg">
              {t("mypage_comp_purchase_review_prompt_p1")}
              <strong className="font-semibold">{t("mypage_comp_purchase_review_step")}</strong>
              {t("mypage_comp_purchase_review_prompt_p2")}
            </p>
            <button
              type="button"
              onClick={() => setReviewOpen(true)}
              className="mt-2 w-full rounded-ui-rect bg-signature py-3 text-center sam-text-body font-medium text-white"
            >
              {t("mypage_comp_purchase_send_review")}
            </button>
          </div>
        ) : null}
      </section>

      <section className="rounded-ui-rect border border-sam-border-soft bg-sam-surface p-4 shadow-sm">
        <h3 className="sam-text-body font-semibold text-sam-fg">{t("mypage_comp_purchase_trade_status_heading")}</h3>
        <ul className="mt-3 space-y-3 border-l-2 border-sam-border pl-4">
          <TimelineItem
            done={!!row.createdAt}
            label={t("mypage_comp_purchase_timeline_chat_started")}
            sub={formatTradeListDatetime(row.createdAt)}
          />
          <TimelineItem
            done={!!row.sellerCompletedAt || flow !== "chatting"}
            label={t("mypage_comp_purchase_timeline_seller_done")}
            sub={row.sellerCompletedAt ? formatTradeListDatetime(row.sellerCompletedAt) : t("mypage_comp_purchase_waiting")}
          />
          <TimelineItem
            done={!!row.buyerConfirmedAt || ["buyer_confirmed", "review_pending", "review_completed"].includes(flow)}
            label={t("mypage_comp_purchase_buyer_confirm")}
            sub={row.buyerConfirmedAt ? formatTradeListDatetime(row.buyerConfirmedAt) : t("mypage_comp_purchase_waiting")}
          />
          <TimelineItem
            done={row.hasBuyerReview || flow === "review_completed"}
            label={
              row.hasBuyerReview || flow === "review_completed" ? t("mypage_comp_purchase_review_done") : t("mypage_comp_purchase_review_step")
            }
            sub={
              row.hasBuyerReview || flow === "review_completed"
                ? t("mypage_comp_purchase_done")
                : showReview
                  ? t("mypage_comp_purchase_writable")
                  : "—"
            }
          />
        </ul>
      </section>

      <div className="fixed bottom-0 left-0 right-0 z-10 border-t border-sam-border bg-sam-surface px-4 py-3 safe-area-pb max-w-lg mx-auto w-full">
        <div className="flex flex-wrap gap-2">
          {flow === "seller_marked_done" ? (
            <>
              <ActionBtn onClick={() => post(`${base}/buyer-confirm`)} disabled={!!busy}>
                {busy?.endsWith("/buyer-confirm") ? t("mypage_comp_processing") : t("mypage_comp_purchase_buyer_confirm")}
              </ActionBtn>
              <ActionBtn outline onClick={() => post(`${base}/buyer-issue`)} disabled={!!busy}>
                {t("mypage_comp_report_problem")}
              </ActionBtn>
            </>
          ) : null}
          {showReview ? (
            <ActionBtn onClick={() => setReviewOpen(true)}>{t("mypage_comp_purchase_send_review")}</ActionBtn>
          ) : null}
          {row.hasBuyerReview ? (
            <ActionBtn outline onClick={() => setReadOpen(true)}>
              {t("mypage_comp_purchase_my_review_view")}
            </ActionBtn>
          ) : null}
          <ActionBtn outline onClick={() => router.push(chatHref)}>
            {t("mypage_comp_order_chat_view")}
          </ActionBtn>
          <ActionBtn outline onClick={() => setReportOpen(true)}>
            {t("mypage_comp_purchase_trade_info_report")}
          </ActionBtn>
        </div>
      </div>

      {reviewOpen ? (
        <PurchaseReviewSheet
          chatId={row.chatId}
          postId={row.postId}
          sellerId={row.sellerId}
          sellerNickname={row.sellerNickname || t("mypage_comp_actor_owner")}
          productTitle={row.title}
          thumbnail={row.thumbnail}
          onClose={() => setReviewOpen(false)}
          onSuccess={() => {
            setReviewOpen(false);
            load();
          }}
        />
      ) : null}

      {readOpen ? (
        <BuyerReviewReadSheet chatId={row.chatId} perspective="buyer_self" onClose={() => setReadOpen(false)} />
      ) : null}

      {reportOpen ? (
        <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/50">
          <div className="w-full max-w-lg rounded-t-[length:var(--ui-radius-rect)] bg-sam-surface">
            <ReportActionSheet
              targetType="user"
              targetId={row.sellerId}
              targetUserId={row.sellerId}
              targetLabel={row.sellerNickname}
              roomId={row.chatId}
              productId={row.postId}
              onClose={() => setReportOpen(false)}
              onSuccess={() => setReportOpen(false)}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}

function TimelineItem({
  done,
  label,
  sub,
}: {
  done: boolean;
  label: string;
  sub: string;
}) {
  return (
    <li className="relative">
      <span
        className={`absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full border-2 ${
          done ? "border-signature bg-signature" : "border-sam-border bg-sam-surface"
        }`}
      />
      <p className={`sam-text-body-secondary font-medium ${done ? "text-sam-fg" : "text-sam-meta"}`}>{label}</p>
      <p className="sam-text-xxs text-sam-muted">{sub}</p>
    </li>
  );
}

function ActionBtn({
  children,
  onClick,
  disabled,
  outline,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  outline?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`rounded-ui-rect px-3 py-2 sam-text-body-secondary font-medium ${
        outline
          ? "border border-sam-border bg-sam-surface text-sam-fg"
          : "bg-signature text-white disabled:opacity-50"
      }`}
    >
      {children}
    </button>
  );
}
