/**
 * App Customer Center SSOT paths — full-page push only.
 * DO NOT: bottom sheet hub · fake FAQ/Event · Admin CP in this slice.
 */

export const CUSTOMER_CENTER_HREF = "/mypage/customer-center" as const;

/** Query on child routes so Back returns to hub when entered from hub. */
export const CUSTOMER_CENTER_FROM_QUERY = "from=customer-center" as const;

export function customerCenterChildHref(path: string): string {
  const base = path.startsWith("/") ? path : `/${path}`;
  const sep = base.includes("?") ? "&" : "?";
  return `${base}${sep}${CUSTOMER_CENTER_FROM_QUERY}`;
}

export function resolveCustomerCenterBackHref(
  from: string | null | undefined,
  fallback = "/mypage",
): string {
  return from === "customer-center" ? CUSTOMER_CENTER_HREF : fallback;
}

/** Keep hub context on child→grandchild links (list→detail, points→charge). */
export function withCustomerCenterFrom(
  path: string,
  from: string | null | undefined,
): string {
  if (from !== "customer-center") return path;
  return customerCenterChildHref(path);
}

/** Notice detail back → notice board list (legacy list still bridged). */
export function resolveNoticeListBackHref(from: string | null | undefined): string {
  return withCustomerCenterFrom("/mypage/customer-center/notice", from);
}
