import { redirect } from "next/navigation";

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function withQuery(base: string, sp: Record<string, string | string[] | undefined>): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    if (v == null) continue;
    if (Array.isArray(v)) {
      for (const item of v) if (item != null && String(item).length) q.append(k, String(item));
    } else if (String(v).length) q.set(k, String(v));
  }
  const s = q.toString();
  return s ? `${base}?${s}` : base;
}

/** Legacy route — server redirect with query preservation. */
export default async function LegacyMyRedirectPage({ searchParams }: PageProps) {
  redirect(withQuery("/mypage/ads/apply", await searchParams));
}
