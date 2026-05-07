import { redirect } from "next/navigation";

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function firstQueryString(v: string | string[] | undefined): string | undefined {
  if (Array.isArray(v)) return v[0];
  return v;
}

export default async function MypageBusinessProfilePage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const storeId = firstQueryString(sp.storeId)?.trim() ?? "";
  return redirect(
    storeId ? `/stores/owner/profile?storeId=${encodeURIComponent(storeId)}` : "/stores/owner/profile"
  );
}
