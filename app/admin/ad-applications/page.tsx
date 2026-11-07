import { redirect } from "next/navigation";

/**
 * Legacy domain queue → 공통 광고 원장 + 도메인 거름 (설계 ads-admin-ssot-design-2026-11-07 §5 · AD2-13 · 2026-11-07).
 * 예전에는 거래 = 공통 상위노출, 커뮤니티 = 도메인 화면으로 갈렸다 → 모두 같은 원장 화면 + `?domain=` (또는 종류 거름).
 */
export default async function AdminAdApplicationsRedirectPage({
  searchParams,
}: {
  searchParams: Promise<{ domain?: string }>;
}) {
  // C-37: Next 16 searchParams 는 Promise — 동기 접근 시 domain 이 항상 비어 있었다.
  const domain = String((await searchParams)?.domain ?? "").toLowerCase();
  if (domain === "trade" || domain === "community") {
    redirect(`/admin/advertising/boosts?domain=${domain}`);
  }
  if (domain === "delivery") {
    redirect("/admin/advertising?domain=delivery");
  }
  if (domain === "feed") {
    redirect("/admin/advertising/applications?kind=feed_member");
  }
  redirect("/admin/advertising/applications");
}
