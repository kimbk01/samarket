/** Trade Admin UI prototype — new ops IA (not production menu SSOT). */

export const TRADE_PROTOTYPE_BASE = "/admin/trade-prototype";

/** Compact top subnav only — no inner sidebar. Product admin-menu.ts unchanged. */
export type TradePrototypeSubnavItem = {
  key: string;
  label: string;
  href: string;
  /** existing product route — not a prototype screen */
  external?: true;
};

export const TRADE_PROTOTYPE_SUBNAV: TradePrototypeSubnavItem[] = [
  { key: "dashboard", label: "대시보드", href: TRADE_PROTOTYPE_BASE },
  { key: "listings", label: "전체 게시물", href: `${TRADE_PROTOTYPE_BASE}/listings` },
  { key: "reports", label: "신고/검토", href: "/admin/reports", external: true },
  { key: "taxonomy", label: "분류", href: `${TRADE_PROTOTYPE_BASE}/taxonomy` },
  { key: "operations", label: "거래 운영", href: `${TRADE_PROTOTYPE_BASE}/operations` },
  { key: "chat", label: "거래 채팅", href: "/admin/chats/trade", external: true },
  { key: "reviews", label: "후기", href: "/admin/reviews", external: true },
  { key: "promo", label: "더 알리기", href: "/admin/ad-applications", external: true },
  { key: "settings", label: "거래 설정", href: "/admin/trade/settings", external: true },
];
