"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import { TEST_AUTH_CHANGED_EVENT } from "@/lib/auth/test-auth-store";
import { tradeHubChatRoomHref } from "@/lib/chats/surfaces/trade-chat-surface";
import { fetchPostBuyerChats } from "@/lib/trade/seller-trade-flow-client";
import { useI18n } from "@/components/i18n/AppLanguageProvider";

interface BuyerChatRow {
  chatId: string;
  buyerId?: string;
  buyerNickname: string;
  tradeFlowStatus: string;
}

const FLOW_SHORT: Record<string, string> = {
  chatting: "판매중",
  seller_marked_done: "판매자완료",
  buyer_confirmed: "거래완료 확인",
  review_pending: "거래완료",
  review_completed: "거래완료",
  dispute: "분쟁",
  archived: "종료",
};

export function PostSellerTradeStrip({
  postId,
  isSeller,
  variant = "default",
}: {
  postId: string;
  isSeller: boolean;
  variant?: "default" | "compact";
}) {
  const { t } = useI18n();
  const [rows, setRows] = useState<BuyerChatRow[] | null>(null);
  const [postStatus, setPostStatus] = useState<string>("active");
  const [sellerListingState, setSellerListingState] = useState<string | null>(null);
  const [reservedBuyerId, setReservedBuyerId] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!isSeller) {
      setRows(null);
      return;
    }
    const user = getCurrentUser();
    const uid = user?.id?.trim();
    if (!uid || !postId) {
      setRows(null);
      return;
    }
    void (async () => {
      try {
        const d = await fetchPostBuyerChats(postId);
        if (d.error) {
          setRows([]);
          setPostStatus("active");
          setSellerListingState(null);
          setReservedBuyerId(null);
          return;
        }
        setPostStatus(typeof d.postStatus === "string" ? d.postStatus : "active");
        setSellerListingState(
          typeof d.sellerListingState === "string" ? d.sellerListingState : null
        );
        setReservedBuyerId(
          typeof d.reservedBuyerId === "string" && d.reservedBuyerId.trim()
            ? d.reservedBuyerId.trim()
            : null
        );
        setRows(Array.isArray(d.items) ? (d.items as BuyerChatRow[]) : []);
      } catch {
        setRows([]);
      }
    })();
  }, [postId, isSeller]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const onAuth = () => load();
    window.addEventListener(TEST_AUTH_CHANGED_EVENT, onAuth);
    return () => window.removeEventListener(TEST_AUTH_CHANGED_EVENT, onAuth);
  }, [load]);

  if (!isSeller || rows === null || rows.length === 0) return null;

  const pad = variant === "compact" ? "px-3 py-2" : "px-4 py-3";
  const titleCls = variant === "compact" ? "sam-text-xxs" : "sam-text-helper";
  const listingReserved =
    (sellerListingState ?? "").toLowerCase() === "reserved" || postStatus === "reserved";

  return (
    <div className={`border-b border-sam-border bg-signature/5 ${pad}`}>
      <p className={`${titleCls} font-medium text-sam-fg`}>{t("trade_033")}</p>
      <ul className="mt-2 space-y-1.5">
        {rows.map((r) => (
          <li key={r.chatId}>
            <Link
              href={tradeHubChatRoomHref(r.chatId, "product_chat")}
              className="flex min-w-0 flex-col gap-0.5 rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2 text-sam-fg active:bg-signature/5 sm:flex-row sm:items-center sm:justify-between"
            >
              <span className="truncate font-medium sam-text-body-secondary">{r.buyerNickname}</span>
              <span className="sam-text-xxs text-signature">
                {FLOW_SHORT[r.tradeFlowStatus] ?? r.tradeFlowStatus}
                {listingReserved && reservedBuyerId && r.buyerId && r.buyerId !== reservedBuyerId
                  ? ` · ${t("trade_092")}`
                  : ""}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
