import { redirect } from "next/navigation";

/** Legacy domain queue → Owner Policy boosts / applications authority. */
export default async function AdminAdApplicationsRedirectPage({
  searchParams,
}: {
  searchParams: Promise<{ domain?: string }>;
}) {
  // C-37: Next 16 searchParams 는 Promise — 동기 접근 시 domain 이 항상 비어 있었다.
  const domain = String((await searchParams)?.domain ?? "").toLowerCase();
  if (domain === "community") {
    redirect("/admin/community/promotions");
  }
  if (domain === "trade") {
    redirect("/admin/advertising/boosts");
  }
  if (domain === "feed") {
    redirect("/admin/advertising/applications");
  }
  redirect("/admin/advertising/applications");
}
