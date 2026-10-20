import { Suspense } from "react";
import { redirect } from "next/navigation";
import { TradePostsPage } from "@/components/admin/trade/posts/TradePostsPage";

type Sp = Record<string, string | string[] | undefined>;

/** 예전 주소 호환 — `?tab=jobs` → 알바, `?status=active|sold|hidden|deleted` → 상태 탭 */
const LEGACY_STATUS_TAB: Record<string, string> = {
  active: "selling",
  sold: "sold",
  hidden: "admin_hidden",
  deleted: "admin_deleted",
};

function one(sp: Sp, k: string): string {
  const v = sp[k];
  return (Array.isArray(v) ? v[0] : v)?.trim() ?? "";
}

/** 거래 게시물 목록 (설계 v2 §C-2) — 조회는 화면이 `/api/admin/trade/posts` 로 한다 (필터는 URL) */
export default async function AdminPostsManagementRoute({ searchParams }: { searchParams?: Promise<Sp> }) {
  const sp = searchParams ? await searchParams : {};
  const legacyTab = one(sp, "tab") === "jobs";
  const legacyStatus = LEGACY_STATUS_TAB[one(sp, "status")] ?? null;
  if (legacyTab || one(sp, "status")) {
    const next = new URLSearchParams();
    for (const [k, v] of Object.entries(sp)) {
      const val = Array.isArray(v) ? v[0] : v;
      if (val && k !== "status" && !(k === "tab" && legacyTab)) next.set(k, val);
    }
    if (legacyTab) next.set("tradeType", "job");
    if (legacyStatus) next.set("tab", legacyStatus);
    const qs = next.toString();
    redirect(qs ? `/admin/posts-management?${qs}` : "/admin/posts-management");
  }
  return (
    <Suspense fallback={null}>
      <TradePostsPage />
    </Suspense>
  );
}
