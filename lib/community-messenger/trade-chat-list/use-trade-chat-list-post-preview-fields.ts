"use client";

import { useEffect, useState } from "react";

export function isWeakTradeChatListTitle(value: string | null | undefined): boolean {
  const s = String(value ?? "").trim();
  return !s || s === "거래";
}

const previewCache = new Map<string, { title: string; priceLabel: string | null }>();

async function loadTradePostListPreview(postId: string): Promise<{ title: string; priceLabel: string | null }> {
  const hit = previewCache.get(postId);
  if (hit) return hit;

  const res = await fetch(
    `/api/community-messenger/trade-post-list-preview?postId=${encodeURIComponent(postId)}`,
    { credentials: "include" }
  );
  const j = (await res.json()) as {
    ok?: boolean;
    error?: string;
    title?: string;
    priceLabel?: string | null;
  };
  if (!res.ok || !j.ok) {
    const notFound = res.status === 404 || j.error === "not_found";
    if (notFound) {
      const deleted = { title: "삭제된 거래글", priceLabel: null as string | null };
      previewCache.set(postId, deleted);
      return deleted;
    }
    return { title: "거래", priceLabel: null };
  }
  const out = {
    title: String(j.title ?? "").trim() || "거래",
    priceLabel: j.priceLabel ?? null,
  };
  previewCache.set(postId, out);
  return out;
}

/**
 * 목록 `contextMeta` 가 플레이스홀더일 때 `postId` 로 제목·가격을 한 번 보강한다.
 */
export function useTradeChatListPostPreviewFields(args: {
  postId: string | null | undefined;
  productTitle: string;
  productPriceText: string | null | undefined;
}): { displayTitle: string; displayPriceText: string | null } {
  const pid = typeof args.postId === "string" ? args.postId.trim() : "";
  const { productTitle, productPriceText } = args;
  const needTitle = isWeakTradeChatListTitle(productTitle);
  const needPrice = !String(productPriceText ?? "").trim();

  const [loaded, setLoaded] = useState<{ title: string; priceLabel: string | null } | null>(() =>
    pid && previewCache.has(pid) ? previewCache.get(pid)! : null
  );

  useEffect(() => {
    setLoaded(pid && previewCache.has(pid) ? previewCache.get(pid)! : null);
  }, [pid]);

  useEffect(() => {
    if (!pid) return;
    if (!needTitle && !needPrice) return;
    let cancelled = false;
    void loadTradePostListPreview(pid).then((data) => {
      if (!cancelled) setLoaded(data);
    });
    return () => {
      cancelled = true;
    };
  }, [pid, needTitle, needPrice]);

  const displayTitle = !isWeakTradeChatListTitle(productTitle)
    ? productTitle
    : loaded && !isWeakTradeChatListTitle(loaded.title)
      ? loaded.title
      : productTitle;

  const displayPriceText = String(productPriceText ?? "").trim()
    ? productPriceText ?? null
    : loaded?.priceLabel ?? null;

  return { displayTitle, displayPriceText };
}
