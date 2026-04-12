"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import { TEST_AUTH_CHANGED_EVENT } from "@/lib/auth/test-auth-store";
import { tradeHubChatRoomHref } from "@/lib/chats/surfaces/trade-chat-surface";
import { fetchPostBuyerChats, postSellerCompleteRequest } from "@/lib/trade/seller-trade-flow-client";

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
  review_pending: "후기대기",
  review_completed: "후기완료",
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
  const [rows, setRows] = useState<BuyerChatRow[] | null>(null);
  const [postStatus, setPostStatus] = useState<string>("active");
  const [sellerListingState, setSellerListingState] = useState<string | null>(null);
  const [reservedBuyerId, setReservedBuyerId] = useState<string | null>(null);
  const [busyChatId, setBusyChatId] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

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

  const sellerComplete = (chatId: string) => {
    const user = getCurrentUser();
    const uid = user?.id?.trim();
    if (!uid) return;
    setBusyChatId(chatId);
    setErr(null);
    void (async () => {
      try {
        const done = await postSellerCompleteRequest(chatId);
        if (!done.ok) {
          setErr(done.error ?? "거래완료 처리에 실패했습니다.");
          return;
        }
        load();
      } catch {
        setErr("네트워크 오류입니다.");
      } finally {
        setBusyChatId(null);
      }
    })();
  };

  if (!isSeller || rows === null || rows.length === 0) return null;

  const pad = variant === "compact" ? "px-3 py-2" : "px-4 py-3";
  const titleCls = variant === "compact" ? "text-[11px]" : "text-[12px]";

  return (
    <div className={`border-b border-sam-border bg-signature/5 ${pad}`}>
      <p className={`${titleCls} font-medium text-sam-fg`}>구매자 채팅 · 거래</p>
      <p className="mt-0.5 text-[11px] text-sam-fg">
        채팅방에서도 거래완료할 수 있어요. 아래에서 바로 처리할 수도 있어요.
      </p>
      {err ? <p className="mt-1 text-[11px] text-red-600">{err}</p> : null}
      <ul className="mt-2 space-y-1.5">
        {rows.map((r) => {
          const flowOk = r.tradeFlowStatus === "chatting" || !r.tradeFlowStatus;
          const listingReserved =
            (sellerListingState ?? "").toLowerCase() === "reserved" || postStatus === "reserved";
          const isReservedRow =
            !reservedBuyerId || !r.buyerId || r.buyerId === reservedBuyerId;
          const canSellerComplete =
            postStatus !== "sold" &&
            flowOk &&
            (!listingReserved || !reservedBuyerId || isReservedRow);
          return (
            <li key={r.chatId}>
              <div className="flex flex-col gap-1.5 rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
                <Link
                  href={tradeHubChatRoomHref(r.chatId, "product_chat")}
                  className="min-w-0 flex-1 text-[13px] text-sam-fg active:bg-signature/5"
                >
                  <span className="truncate font-medium">{r.buyerNickname}</span>
                  <span className="mt-0.5 block text-[11px] text-signature sm:mt-0 sm:inline sm:ml-2">
                    {FLOW_SHORT[r.tradeFlowStatus] ?? r.tradeFlowStatus}
                    {listingReserved && reservedBuyerId && r.buyerId && r.buyerId !== reservedBuyerId
                      ? " · 예약 아님"
                      : ""}
                  </span>
                </Link>
                {canSellerComplete ? (
                  <button
                    type="button"
                    disabled={!!busyChatId}
                    onClick={() => sellerComplete(r.chatId)}
                    className="shrink-0 rounded-ui-rect bg-signature px-3 py-1.5 text-[12px] font-medium text-white disabled:opacity-50"
                  >
                    {busyChatId === r.chatId ? "처리 중…" : "거래완료"}
                  </button>
                ) : listingReserved && reservedBuyerId && r.buyerId && r.buyerId !== reservedBuyerId ? (
                  <span className="shrink-0 text-[11px] text-sam-muted">예약된 다른 분과 거래 중</span>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
