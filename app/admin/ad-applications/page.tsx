import { redirect } from "next/navigation";

/** Legacy domain queue → Owner Policy boosts / applications authority. */
export default function AdminAdApplicationsRedirectPage({
  searchParams,
}: {
  searchParams?: { domain?: string };
}) {
  const domain = String(searchParams?.domain ?? "").toLowerCase();
  if (domain === "trade" || domain === "community") {
    redirect("/admin/advertising/boosts");
  }
  if (domain === "feed") {
    redirect("/admin/advertising/applications");
  }
  redirect("/admin/advertising/applications");
}
