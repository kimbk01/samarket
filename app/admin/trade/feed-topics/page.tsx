import { redirect } from "next/navigation";

/** CUT A2 — 거래 주제/카테고리/옵션 SSOT는 `/admin/menus/trade`. */
export default function AdminTradeFeedTopicsRoute() {
  redirect("/admin/menus/trade");
}
