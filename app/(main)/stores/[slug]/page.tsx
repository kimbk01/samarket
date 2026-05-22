import type { Metadata } from "next";
import { headers } from "next/headers";
import { StoreDetailPageEnterTrace } from "@/components/stores/detail/StoreDetailPageEnterTrace";
import { StoreDetailPublic } from "@/components/stores/StoreDetailPublic";
import { loadStoreSeoMetadataBySlug } from "@/lib/stores/load-store-seo-metadata";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const decoded = decodeURIComponent(typeof slug === "string" ? slug : "").trim();
  if (!decoded) return { title: "매장" };

  const seo = await loadStoreSeoMetadataBySlug(decoded);
  if (!seo) return { title: "매장" };

  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "";
  const proto = (h.get("x-forwarded-proto") ?? "http").split(",")[0]?.trim() || "http";
  const base = host ? `${proto}://${host}` : "";
  const path = `/stores/${encodeURIComponent(seo.canonicalSlug)}`;

  return {
    title: seo.title,
    description: seo.description,
    openGraph: {
      title: seo.title,
      description: seo.description,
      ...(seo.ogImageUrl ? { images: [{ url: seo.ogImageUrl }] } : {}),
    },
    ...(base ? { alternates: { canonical: `${base}${path}` } } : {}),
  };
}

export default async function StoreDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const safe = typeof slug === "string" ? slug : "";
  /** 첫 페인트: 클라이언트에서 즉시 shell → split API hydrate (서버 선조회·monolith metadata 제거) */
  return (
    <>
      <StoreDetailPageEnterTrace slug={safe} />
      <StoreDetailPublic key={safe} slug={safe} initialApiResponse={null} />
    </>
  );
}
