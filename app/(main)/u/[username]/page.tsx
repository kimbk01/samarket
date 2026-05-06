import { notFound } from "next/navigation";
import { PublicUserProfileView } from "@/components/users/PublicUserProfileView";

export const dynamic = "force-dynamic";

export default async function PublicUserProfilePage({ params }: { params: Promise<{ username: string }> }) {
  const { username } = await params;
  const u = String(username ?? "").trim().replace(/^@+/, "");
  if (!u) notFound();

  const res = await fetch(`/api/users/by-username/${encodeURIComponent(u)}/public-profile`, { cache: "no-store" }).catch(
    () => null
  );

  if (!res || !res.ok) notFound();
  const json = (await res.json().catch(() => null)) as any;
  if (!json?.ok || !json?.profile?.id) notFound();

  return <PublicUserProfileView profile={json.profile} />;
}

