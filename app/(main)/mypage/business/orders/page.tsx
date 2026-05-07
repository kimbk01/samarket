import { redirect } from "next/navigation";

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function MypageBusinessOrdersPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    if (v == null) continue;
    if (Array.isArray(v)) {
      v.filter(Boolean).forEach((x) => params.append(k, String(x)));
    } else {
      params.set(k, String(v));
    }
  }
  const qs = params.toString();
  return redirect(qs ? `/stores/owner/orders?${qs}` : "/stores/owner/orders");
}
