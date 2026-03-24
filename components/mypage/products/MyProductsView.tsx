"use client";

import { useState, useCallback, useEffect } from "react";
import { useRefetchOnPageShowRestore } from "@/lib/ui/use-refetch-on-page-show";
import type { Product } from "@/lib/types/product";
import type { MyProductFilterKey } from "@/lib/products/status-utils";
import {
  getMyProducts,
  updateProductStatus,
  updateProductSellerListingState,
  bumpProduct,
  deleteProduct,
  CURRENT_USER_ID,
} from "@/lib/products/my-products-mock";
import {
  SELLER_LISTING_LABEL,
  normalizeSellerListingState,
  type SellerListingState,
} from "@/lib/products/seller-listing-state";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import { MyProductFilter } from "./MyProductFilter";
import { MyProductCard } from "./MyProductCard";
import {
  TradeBuyerPickerModal,
  type TradeBuyerPickCandidate,
} from "./TradeBuyerPickerModal";

type PostBuyerChatsPayload = {
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

function isActiveTradeChat(row: { tradeFlowStatus?: string }) {
  const f = row.tradeFlowStatus ?? "chatting";
  return f === "chatting" || f === "";
}

function dedupeBuyerCandidates(
  items: PostBuyerChatsPayload["items"]
): TradeBuyerPickCandidate[] {
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

async function fetchPostBuyerChats(postId: string): Promise<PostBuyerChatsPayload> {
  const res = await fetch(`/api/my/post-buyer-chats?postId=${encodeURIComponent(postId)}`);
  const data = (await res.json().catch(() => ({}))) as PostBuyerChatsPayload;
  if (!res.ok || data.error) {
    return { ...data, error: data.error ?? "목록을 불러오지 못했습니다." };
  }
  return data;
}

async function postSellerListingStateApi(
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

async function postSellerCompleteApi(chatId: string) {
  const res = await fetch(`/api/trade/product-chat/${encodeURIComponent(chatId)}/seller-complete`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  return (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
}

function filterByStatus(products: Product[], filter: MyProductFilterKey): Product[] {
  if (filter === "all") return products.filter((p) => p.status !== "hidden");
  return products.filter((p) => p.status === filter);
}

export function MyProductsView() {
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [filter, setFilter] = useState<MyProductFilterKey>("all");
  const [rawProducts, setRawProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingListingId, setSavingListingId] = useState<string | null>(null);
  const [buyerPicker, setBuyerPicker] = useState<{
    mode: "reserve" | "complete";
    productId: string;
    candidates: TradeBuyerPickCandidate[];
  } | null>(null);

  const products = filterByStatus(rawProducts, filter);

  useEffect(() => {
    const user = getCurrentUser();
    setCurrentUserId(user?.id ?? null);
  }, []);

  const fetchMyPosts = useCallback(async (uid: string) => {
    const res = await fetch("/api/my/posts");
    if (!res.ok) return [];
    const data = await res.json();
    return (data.posts ?? []) as Product[];
  }, []);

  useEffect(() => {
    if (currentUserId === null) {
      setLoading(false);
      setRawProducts(getMyProducts(CURRENT_USER_ID, "all"));
      return;
    }
    if (!currentUserId) {
      setRawProducts(getMyProducts(CURRENT_USER_ID, "all"));
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    fetchMyPosts(currentUserId)
      .then((list) => {
        if (!cancelled) setRawProducts(list);
      })
      .catch(() => {
        if (!cancelled) setRawProducts(getMyProducts(currentUserId, "all"));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [currentUserId, fetchMyPosts]);

  useEffect(() => {
    if (!currentUserId) return;
    const run = () => {
      fetchMyPosts(currentUserId).then(setRawProducts).catch(() => {});
    };
    const onVis = () => {
      if (document.visibilityState === "visible") run();
    };
    window.addEventListener("focus", run);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("focus", run);
    };
  }, [currentUserId, fetchMyPosts]);

  const refetchPostsSilent = useCallback(() => {
    if (!currentUserId) return;
    void fetchMyPosts(currentUserId).then(setRawProducts).catch(() => {});
  }, [currentUserId, fetchMyPosts]);

  useRefetchOnPageShowRestore(refetchPostsSilent, { enableVisibilityRefetch: false });

  const refresh = useCallback(() => {
    if (!currentUserId) {
      setRawProducts(getMyProducts(CURRENT_USER_ID, "all"));
      return;
    }
    fetchMyPosts(currentUserId).then(setRawProducts);
  }, [currentUserId, fetchMyPosts]);

  const handleFilterChange = useCallback((value: MyProductFilterKey) => {
    setFilter(value);
  }, []);

  const handleStatusChange = useCallback(
    async (productId: string, newStatus: Product["status"]) => {
      if (!currentUserId) {
        updateProductStatus(productId, newStatus);
        refresh();
        return;
      }
      try {
        const res = await fetch(
          `/api/posts/${encodeURIComponent(productId)}/owner-status`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              status: newStatus,
            }),
          }
        );
        const data = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          error?: string;
        };
        if (!res.ok || !data.ok) {
          window.alert(data.error ?? "상태 변경에 실패했습니다.");
          return;
        }
        refresh();
      } catch {
        window.alert("네트워크 오류로 변경하지 못했습니다.");
      }
    },
    [currentUserId, refresh]
  );

  const handleBump = useCallback(
    (productId: string) => {
      bumpProduct(productId);
      refresh();
    },
    [refresh]
  );

  const handleDelete = useCallback(
    (productId: string) => {
      deleteProduct(productId);
      refresh();
    },
    [refresh]
  );

  const handleSellerListingStateChange = useCallback(
    async (productId: string, state: SellerListingState) => {
      const product = rawProducts.find((p) => p.id === productId);
      if (!product) return;
      const current = normalizeSellerListingState(
        product.sellerListingState,
        product.status
      );
      if (state === current) return;
      const label = SELLER_LISTING_LABEL[state];

      if (typeof window === "undefined") return;

      if (state === "completed") {
        if (
          !window.confirm(
            "거래완료하면 선택한 구매자에게 확인·후기 안내가 전달되고, 글이 판매완료로 표시됩니다. 진행할까요?"
          )
        ) {
          return;
        }
      } else if (!window.confirm(`판매 진행 상황을 "${label}"으로 변경할까요?`)) {
        return;
      }

      setSavingListingId(productId);
      try {
        if (!currentUserId) {
          updateProductSellerListingState(productId, state);
          refresh();
          return;
        }

        if (state === "completed") {
          const data = await fetchPostBuyerChats(productId);
          if (data.error) {
            window.alert(data.error);
            return;
          }
          const items = (data.items ?? []).filter(isActiveTradeChat);
          const reservedId = data.reservedBuyerId?.trim() || "";
          const listingIsReserved =
            (data.sellerListingState ?? "").toLowerCase() === "reserved" ||
            product.status === "reserved";

          if (listingIsReserved && reservedId) {
            const row = items.find((i) => i.buyerId === reservedId);
            if (!row?.chatId) {
              window.alert("예약된 구매자와의 활성 채팅을 찾을 수 없습니다.");
              return;
            }
            const done = await postSellerCompleteApi(row.chatId);
            if (!done.ok) {
              window.alert(done.error ?? "거래완료 처리에 실패했습니다.");
              return;
            }
            refresh();
            return;
          }

          const candidates = dedupeBuyerCandidates(items);
          if (candidates.length === 0) {
            window.alert("문의 중인 채팅이 없으면 거래완료를 진행할 수 없습니다.");
            return;
          }
          if (candidates.length === 1) {
            const done = await postSellerCompleteApi(candidates[0].chatId);
            if (!done.ok) {
              window.alert(done.error ?? "거래완료 처리에 실패했습니다.");
              return;
            }
            refresh();
            return;
          }
          setBuyerPicker({ mode: "complete", productId, candidates });
          return;
        }

        if (state === "reserved") {
          const data = await fetchPostBuyerChats(productId);
          if (data.error) {
            window.alert(data.error);
            return;
          }
          const items = (data.items ?? []).filter(isActiveTradeChat);
          const candidates = dedupeBuyerCandidates(items);
          if (candidates.length === 0) {
            window.alert("문의 채팅이 있는 구매자만 예약할 수 있습니다.");
            return;
          }
          if (candidates.length === 1) {
            const saved = await postSellerListingStateApi(productId, "reserved", candidates[0].buyerId);
            if (!saved.ok) {
              window.alert(saved.error ?? "저장에 실패했습니다.");
              return;
            }
            if (saved.warning) window.alert(saved.warning);
            refresh();
            return;
          }
          setBuyerPicker({ mode: "reserve", productId, candidates });
          return;
        }

        const saved = await postSellerListingStateApi(productId, state);
        if (!saved.ok) {
          window.alert(saved.error ?? "저장에 실패했습니다.");
          return;
        }
        if (saved.warning) window.alert(saved.warning);
        refresh();
      } catch {
        window.alert("네트워크 오류로 저장하지 못했습니다.");
      } finally {
        setSavingListingId(null);
      }
    },
    [currentUserId, rawProducts, refresh]
  );

  const onBuyerPicked = useCallback(
    async (c: TradeBuyerPickCandidate) => {
      if (!buyerPicker) return;
      const { mode, productId } = buyerPicker;
      setBuyerPicker(null);
      setSavingListingId(productId);
      try {
        if (mode === "reserve") {
          const saved = await postSellerListingStateApi(productId, "reserved", c.buyerId);
          if (!saved.ok) {
            window.alert(saved.error ?? "저장에 실패했습니다.");
            return;
          }
          if (saved.warning) window.alert(saved.warning);
        } else {
          const done = await postSellerCompleteApi(c.chatId);
          if (!done.ok) {
            window.alert(done.error ?? "거래완료 처리에 실패했습니다.");
            return;
          }
        }
        refresh();
      } catch {
        window.alert("네트워크 오류입니다.");
      } finally {
        setSavingListingId(null);
      }
    },
    [buyerPicker, refresh]
  );

  return (
    <div className="mx-auto max-w-lg space-y-4 px-4 pb-24">
      <TradeBuyerPickerModal
        open={buyerPicker != null}
        title={buyerPicker?.mode === "reserve" ? "예약할 구매자 선택" : "거래완료할 구매자 선택"}
        subtitle={
          buyerPicker?.mode === "reserve"
            ? "선택한 분과만 이어서 채팅할 수 있어요. 다른 문의 채팅은 비활성화됩니다."
            : "여러 분과 동시에 문의 중이면, 거래를 마칠 구매자를 골라 주세요."
        }
        candidates={buyerPicker?.candidates ?? []}
        onClose={() => setBuyerPicker(null)}
        onSelect={onBuyerPicked}
      />
      <MyProductFilter value={filter} onChange={handleFilterChange} />
      {loading ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <p className="text-[14px] text-gray-500">불러오는 중...</p>
        </div>
      ) : products.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <p className="text-[14px] text-gray-500">
            {filter === "all"
              ? "등록한 상품이 없어요"
              : "이 상태의 상품이 없어요"}
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {products.map((product) => (
            <li key={product.id}>
              <MyProductCard
                product={product}
                onStatusChange={handleStatusChange}
                onBump={handleBump}
                onDelete={handleDelete}
                listingSaving={savingListingId === product.id}
                onSellerListingStateChange={handleSellerListingStateChange}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
