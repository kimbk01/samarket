/**
 * 내정보 하위 화면 공통 UI — 상황(거래/주문/게시판/매장/계정)별 빠른 CTA 프리셋.
 */
export type ManagedMySection = "trade" | "orders" | "board" | "store" | "account";

export type ManagedMyCtaLink = { href: string; label: string };
