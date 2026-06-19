import type { MessageKey } from "@/lib/i18n/messages";
import {
  MYPAGE_HOME_MESSENGER_HREF,
  MYPAGE_HOME_STORE_ORDERS_HREF,
  MYPAGE_HOME_TRADE_FAVORITES_HREF,
  MYPAGE_HOME_TRADE_SALES_HREF,
} from "@/lib/mypage/mypage-home-hub-links";

export type MypageHomeStatId =
  | "points"
  | "active_trade"
  | "orders"
  | "unread_chat"
  | "favorites";

export type MypageHomeStatDef = {
  id: MypageHomeStatId;
  labelKey: MessageKey;
  href: string;
  accent?: boolean;
};

export const MYPAGE_HOME_STAT_DEFS: MypageHomeStatDef[] = [
  { id: "points", labelKey: "mypage_comp_stat_points", href: "/mypage/points", accent: true },
  { id: "active_trade", labelKey: "mypage_comp_stat_active_trade", href: MYPAGE_HOME_TRADE_SALES_HREF },
  { id: "orders", labelKey: "mypage_comp_stat_orders", href: MYPAGE_HOME_STORE_ORDERS_HREF },
  { id: "unread_chat", labelKey: "mypage_comp_stat_unread_chat", href: MYPAGE_HOME_MESSENGER_HREF },
  { id: "favorites", labelKey: "mypage_comp_stat_favorites_short", href: MYPAGE_HOME_TRADE_FAVORITES_HREF },
];

export type MypageHomeStatValues = {
  points: string;
  activeTrade: number | null;
  orderCount: number | null;
  unreadChat: number | null;
  favoriteCount: number | null;
};

export type MypageHomeStatRow = {
  label: string;
  value: string;
  href: string;
  accent?: boolean;
};

export function buildMypageHomeStatRows(args: {
  defs?: MypageHomeStatDef[];
  values: MypageHomeStatValues;
  formatCount: (n: number | null | undefined) => string;
  labelForKey: (key: MessageKey) => string;
}): MypageHomeStatRow[] {
  const defs = args.defs ?? MYPAGE_HOME_STAT_DEFS;
  const { values, formatCount, labelForKey } = args;

  return defs.map((def) => {
    let value: string;
    switch (def.id) {
      case "points":
        value = values.points;
        break;
      case "active_trade":
        value = formatCount(values.activeTrade);
        break;
      case "orders":
        value = formatCount(values.orderCount);
        break;
      case "unread_chat":
        value = formatCount(values.unreadChat);
        break;
      case "favorites":
        value = formatCount(values.favoriteCount);
        break;
      default:
        value = formatCount(null);
    }
    return {
      label: labelForKey(def.labelKey),
      value,
      href: def.href,
      accent: def.accent,
    };
  });
}

export function resolveActiveTradeCount(
  purchases: number | null | undefined,
  sales: number | null | undefined
): number | null {
  if (typeof purchases !== "number" || typeof sales !== "number") return null;
  return Math.max(0, purchases) + Math.max(0, sales);
}
