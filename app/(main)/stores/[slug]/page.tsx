import type { Metadata } from "next";
import { headers } from "next/headers";
import { StoreDetailPageEnterTrace } from "@/components/stores/detail/StoreDetailPageEnterTrace";
import { StoreDetailPublic } from "@/components/stores/StoreDetailPublic";
import { formatStoreLocationLine } from "@/lib/stores/store-location-label";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const decoded = decodeURIComponent(typeof slug === "string" ? slug : "").trim();
  if (!decoded) return { title: "매장" };

  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "";
  const proto = (h.get("x-forwarded-proto") ?? "http").split(",")[0]?.trim() || "http";
  if (!host) return { title: "매장" };

  const base = `${proto}://${host}`;
  try {
    const res = await fetch(`${base}/api/stores/${encodeURIComponent(decoded)}`, {
      next: { revalidate: 60 },
      headers: { Accept: "application/json" },
    });
    const json = (await res.json()) as {
      ok?: boolean;
      store?: {
        store_name?: string;
        slug?: string;
        description?: string | null;
        region?: string | null;
        city?: string | null;
        district?: string | null;
        profile_image_url?: string | null;
      };
    };
    if (!json?.ok || !json.store) return { title: "매장" };

    const s = json.store;
    const title = String(s.store_name ?? "매장");
    const descRaw = typeof s.description === "string" ? s.description.trim() : "";
    const region = formatStoreLocationLine(s) ?? "";
    const description = (descRaw || (region ? `${region} · 동네 매장` : "동네 매장")).slice(0, 160);
    const ogImage =
      typeof s.profile_image_url === "string" && s.profile_image_url ? s.profile_image_url : undefined;
    const canonSlug = String(s.slug ?? decoded);
    const path = `/stores/${encodeURIComponent(canonSlug)}`;

    return {
      title,
      description,
      openGraph: {
        title,
        description,
        ...(ogImage ? { images: [{ url: ogImage }] } : {}),
      },
      alternates: { canonical: `${base}${path}` },
    };
  } catch {
    return { title: "매장" };
  }
}

export default async function StoreDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const safe = typeof slug === "string" ? slug : "";
  /** 첫 페인트: 클라이언트에서 즉시 shell → `/api/stores/:slug` hydrate (서버 선조회 대기 제거) */
  return (
    <>
      <StoreDetailPageEnterTrace slug={safe} />
      <StoreDetailPublic key={safe} slug={safe} initialApiResponse={null} />
    </>
  );
}
