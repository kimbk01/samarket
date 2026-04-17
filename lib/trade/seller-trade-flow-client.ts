"use client";

import { runSingleFlight } from "@/lib/http/run-single-flight";
import { isOfflineMockPostId } from "@/lib/posts/offline-mock-post-id";
import type { SellerListingState } from "@/lib/products/seller-listing-state";

export type TradeBuyerChatsPayload = {
  items?: {
    chatId: string;
    buyerId: string;
    buyerNickname: string;
    tradeFlowStatus?: string;
  }[];
  postStatus?: string;
  sellerListingState?: string | null;
  reservedBuyerId?: string | null;
  error?: string;
};

export type TradeBuyerPickCandidate = {
  buyerId: string;
  chatId: string;
  buyerNickname: string;
};

export function isActiveTradeChat(row: { tradeFlowStatus?: string }) {
  const f = row.tradeFlowStatus ?? "chatting";
  return f === "chatting" || f === "";
}

export function dedupeBuyerCandidates(items: TradeBuyerChatsPayload["items"]): TradeBuyerPickCandidate[] {
  if (!items?.length) return [];
  /** 동일 구매자·동일 상품에 `item_trade` 방이 여러 개여도 각 `chatId` 를 유지 */
  const m = new Map<string, TradeBuyerPickCandidate>();
  for (const it of items) {
    if (!it.buyerId || !it.chatId) continue;
    if (!m.has(it.chatId)) {
      m.set(it.chatId, {
        buyerId: it.buyerId,
        chatId: it.chatId,
        buyerNickname: it.buyerNickname || it.buyerId.slice(0, 8),
      });
    }
  }
  return [...m.values()];
}

export async function fetchPostBuyerChats(postId: string): Promise<TradeBuyerChatsPayload> {
  const id = postId.trim();
  if (!id) {
    return { items: [], error: "목록을 불러오지 못했습니다." };
  }
  if (isOfflineMockPostId(id)) {
    return { items: [], postStatus: "active", sellerListingState: null, reservedBuyerId: null };
  }
  return runSingleFlight(`trade:post-buyer-chats:${id}`, async () => {
    const res = await fetch(`/api/my/post-buyer-chats?postId=${encodeURIComponent(id)}`);
    const data = (await res.json().catch(() => ({}))) as TradeBuyerChatsPayload;
    if (!res.ok || data.error) {
      return { ...data, error: data.error ?? "목록을 불러오지 못했습니다." };
    }
    return data;
  });
}

export async function postSellerListingStateRequest(
  productId: string,
  sellerListingState: SellerListingState,
  reservedBuyerId?: string
) {
  const body: { sellerListingState: SellerListingState; reservedBuyerId?: string } = {
    sellerListingState,
  };
  if (reservedBuyerId) body.reservedBuyerId = reservedBuyerId;
  const res = await fetch(`/api/posts/${encodeURIComponent(productId)}/seller-listing-state`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    error?: string;
    warning?: string;
  };
}

export async function postSellerCompleteRequest(chatId: string): Promise<{ ok: boolean; error?: string }> {
  const id = chatId.trim();
  if (!id) return { ok: false, error: "채팅을 찾을 수 없습니다." };
  const res = await fetch(`/api/trade/product-chat/${encodeURIComponent(id)}/seller-complete`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
  if (!res.ok || !data.ok) {
    return { ok: false, error: data.error ?? "거래완료 처리에 실패했습니다." };
  }
  return { ok: true };
}

export type TradeLifecycleClientAction = "resume_active" | "cancel_trade";

export async function postTradeLifecycleRequest(postId: string, action: TradeLifecycleClientAction) {
  const res = await fetch(`/api/posts/${encodeURIComponent(postId)}/trade-lifecycle`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action }),
  });
  return (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
}

export async function postOwnerDeleteRequest(postId: string) {
  const res = await fetch(`/api/posts/${encodeURIComponent(postId)}/owner-delete`, {
    method: "POST",
    credentials: "include",
  });
  return (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
}

export async function postOwnerStatusHidden(postId: string) {
  const res = await fetch(`/api/posts/${encodeURIComponent(postId)}/owner-status`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify({ status: "hidden" }),
  });
  return (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
}
