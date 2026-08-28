import { isOpaqueId } from "@/lib/stores/customer-coupon-wallet-view";

/** QA / internal product titles must not surface in customer mall or cards. */
export function isCustomerOpaqueGiftProductTitle(title: string): boolean {
  const raw = title.trim();
  if (!raw) return true;
  if (isOpaqueId(raw)) return true;
  if (/^SP\s+PLATFORM/i.test(raw)) return true;
  if (/^DIBAY[_-]?QA/i.test(raw)) return true;
  if (/^QA[-_\s]/i.test(raw)) return true;
  if (/\bQA\b/i.test(raw) && /PLATFORM|U7|resume|Positive Fee/i.test(raw)) return true;
  if (/^U\d+[A-Za-z]?\s/i.test(raw)) return true;
  if (/^[A-Z0-9_]{16,}$/.test(raw) && /_/.test(raw)) return true;
  return false;
}

export function resolveCustomerGiftProductTitle(args: {
  title: string;
  storeName: string;
  giftScope: "STORE" | "PLATFORM";
}): { customerTitle: string; titleIsCustomerOpaque: boolean } {
  const raw = args.title.trim();
  const opaque = isCustomerOpaqueGiftProductTitle(raw);
  if (!opaque) return { customerTitle: raw, titleIsCustomerOpaque: false };
  if (args.giftScope === "PLATFORM") {
    return { customerTitle: "DIBAY 상품권", titleIsCustomerOpaque: true };
  }
  const store = args.storeName.trim() || "매장";
  return { customerTitle: `${store} 상품권`, titleIsCustomerOpaque: true };
}
