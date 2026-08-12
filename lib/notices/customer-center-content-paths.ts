import type { CustomerCenterContentType } from "@/lib/notices/customer-center-content";
import { isCustomerCenterContentType } from "@/lib/notices/customer-center-content";

export const CUSTOMER_CENTER_HUB_HREF = "/mypage/customer-center";

/** Canonical PATH boards (OWNER approved). */
export function buildCustomerCenterBoardListPath(contentType: CustomerCenterContentType): string {
  return `${CUSTOMER_CENTER_HUB_HREF}/${contentType}`;
}

export function buildCustomerCenterBoardDetailPath(
  contentType: CustomerCenterContentType,
  contentId: string
): string {
  const id = contentId.trim();
  return `${CUSTOMER_CENTER_HUB_HREF}/${contentType}/${encodeURIComponent(id)}`;
}

export function parseCustomerCenterBoardFromPathname(pathname: string): {
  contentType: CustomerCenterContentType | null;
  contentId: string | null;
} {
  const parts = pathname.split("/").filter(Boolean);
  // mypage / customer-center / {type} / {id?}
  const idx = parts.indexOf("customer-center");
  if (idx < 0) return { contentType: null, contentId: null };
  const type = parts[idx + 1];
  if (!isCustomerCenterContentType(type)) return { contentType: null, contentId: null };
  const contentId = parts[idx + 2] ? decodeURIComponent(parts[idx + 2]) : null;
  return { contentType: type, contentId };
}

/** Legacy Bell/Campaign target — keep until caller cleanup. */
export function buildLegacyAppNoticeDetailPath(noticeId: string): string {
  const id = noticeId.trim();
  return `/mypage/notices/${encodeURIComponent(id)}`;
}

export function buildLegacyAppNoticeListPath(): string {
  return "/mypage/section/settings/notices";
}
