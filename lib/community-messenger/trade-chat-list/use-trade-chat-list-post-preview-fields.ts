"use client";

import { useEffect, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";

export function isWeakTradeChatListTitle(
  value: string | null | undefined,
  weakTitleLabel: string
): boolean {
  const s = String(value ?? "").trim();
  return !s || s === weakTitleLabel;
}

const previewCache = new Map<string, { title: string; priceLabel: string | null }>();

async function loadTradePostListPreview(
  postId: string,
  weakTitleLabel: string,
  deletedTitleLabel: string
): Promise<{ title: string; priceLabel: string | null }> {
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
      const deleted = { title: deletedTitleLabel, priceLabel: null as string | null };
      previewCache.set(postId, deleted);
      return deleted;
    }
    return { title: weakTitleLabel, priceLabel: null };
  }
  const out = {
    title: String(j.title ?? "").trim() || weakTitleLabel,
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
  const { t } = useI18n();
  const weakTitleLabel = t("chats_trade_list_weak_title");
  const deletedTitleLabel = t("chats_trade_list_deleted_post");

  const pid = typeof args.postId === "string" ? args.postId.trim() : "";
  const { productTitle, productPriceText } = args;
  const needTitle = isWeakTradeChatListTitle(productTitle, weakTitleLabel);
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
    void loadTradePostListPreview(pid, weakTitleLabel, deletedTitleLabel).then((data) => {
      if (!cancelled) setLoaded(data);
    });
    return () => {
      cancelled = true;
    };
  }, [pid, needTitle, needPrice, weakTitleLabel, deletedTitleLabel]);

  const displayTitle = !isWeakTradeChatListTitle(productTitle, weakTitleLabel)
    ? productTitle
    : loaded && !isWeakTradeChatListTitle(loaded.title, weakTitleLabel)
      ? loaded.title
      : productTitle;

  const displayPriceText = String(productPriceText ?? "").trim()
    ? productPriceText ?? null
    : loaded?.priceLabel ?? null;

  return { displayTitle, displayPriceText };
}
