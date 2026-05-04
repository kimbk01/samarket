"use client";

/**
 * 상세 → compose 즉시 표시용 미리보기 (동일 탭 sessionStorage).
 * URL 길이 제한 없이 썸네일·제목 등을 넘길 때 사용.
 */

const STORAGE_KEY = "samarket.trade-chat-compose-preview";

export type TradeChatComposePreviewFields = {
  productTitle: string;
  productThumbnail: string;
  priceText: string;
  sellerName: string;
};

type Stored = TradeChatComposePreviewFields & { productId: string };

export function setTradeChatComposePreview(productId: string, preview: TradeChatComposePreviewFields): void {
  if (typeof window === "undefined") return;
  const id = productId.trim();
  if (!id) return;
  try {
    const payload: Stored = {
      productId: id,
      productTitle: preview.productTitle.trim() || "상품",
      productThumbnail: preview.productThumbnail.trim(),
      priceText: preview.priceText.trim() || "",
      sellerName: preview.sellerName.trim() || "판매자",
    };
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    /* quota / private mode */
  }
}

export function readTradeChatComposePreview(productId: string): TradeChatComposePreviewFields | null {
  if (typeof window === "undefined") return null;
  const id = productId.trim();
  if (!id) return null;
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<Stored> | null;
    if (!parsed || typeof parsed.productId !== "string" || parsed.productId.trim() !== id) return null;
    return {
      productTitle: typeof parsed.productTitle === "string" && parsed.productTitle.trim() ? parsed.productTitle.trim() : "상품",
      productThumbnail: typeof parsed.productThumbnail === "string" ? parsed.productThumbnail.trim() : "",
      priceText: typeof parsed.priceText === "string" ? parsed.priceText.trim() : "",
      sellerName: typeof parsed.sellerName === "string" && parsed.sellerName.trim() ? parsed.sellerName.trim() : "판매자",
    };
  } catch {
    return null;
  }
}
