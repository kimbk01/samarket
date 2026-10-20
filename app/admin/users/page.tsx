import { Suspense } from "react";
import { redirect } from "next/navigation";
import { AdminUserListPage } from "@/components/admin/users/AdminUserListPage";

interface PageProps {
  searchParams: Promise<{ detail?: string | string[]; from?: string | string[] }>;
}

/** `?detail=` is legacy modal deep-link — canonical surface is `/admin/users/[id]`. */
export default async function AdminUsersPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const raw = params.detail;
  const detail = (Array.isArray(raw) ? raw[0] : raw)?.trim() ?? "";
  if (detail) {
    redirect(`/admin/users/${encodeURIComponent(detail)}`);
  }
  // 거래 메뉴의 예전 링크 — 거래 Admin 판매자·구매자 화면으로 (거래 Admin 설계 v2 §B-3)
  const from = Array.isArray(params.from) ? params.from[0] : params.from;
  if (from === "trade") redirect("/admin/trade/members");
  return (
    <Suspense fallback={null}>
      <AdminUserListPage />
    </Suspense>
  );
}
