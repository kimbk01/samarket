"use client";

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
  const m = new Map<string, TradeBuyerPickCandidate>();
  for (const it of items) {
    if (!it.buyerId || !it.chatId) continue;
    if (!m.has(it.buyerId)) {
      m.set(it.buyerId, {
        buyerId: it.buyerId,
        chatId: it.chatId,
        buyerNickname: it.buyerNickname || it.buyerId.slice(0, 8),
      });
    }
  }
  return [...m.values()];
}

export async function fetchPostBuyerChats(postId: string): Promise<TradeBuyerChatsPayload> {
  if (isOfflineMockPostId(postId)) {
    return { items: [], postStatus: "active", sellerListingState: null, reservedBuyerId: null };
  }
  const res = await fetch(`/api/my/post-buyer-chats?postId=${encodeURIComponent(postId)}`);
  const data = (await res.json().catch(() => ({}))) as TradeBuyerChatsPayload;
  if (!res.ok || data.error) {
    return { ...data, error: data.error ?? "목록을 불러오지 못했습니다." };
  }
  return data;
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

export async function postSellerCompleteRequest(chatId: string) {
  const res = await fetch(`/api/trade/product-chat/${encodeURIComponent(chatId)}/seller-complete`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  return (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
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
