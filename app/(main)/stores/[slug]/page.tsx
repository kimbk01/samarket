import type { Metadata } from "next";
import { cookies } from "next/headers";
import { headers } from "next/headers";
import { StoreDetailPageEnterTrace } from "@/components/stores/detail/StoreDetailPageEnterTrace";
import { DeliveryStoreRouteBridge } from "@/components/delivery/presentation/DeliveryStoreRouteBridge";
import { resolveServerInitialLanguage } from "@/lib/i18n/language-preference";
import { safeTranslate } from "@/lib/i18n/safe-translate";
import { loadStoreSeoMetadataBySlug } from "@/lib/stores/load-store-seo-metadata";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const decoded = decodeURIComponent(typeof slug === "string" ? slug : "").trim();
  const h = await headers();
  const cookieStore = await cookies();
  const lang = resolveServerInitialLanguage({
    cookieValue: cookieStore.get("sam_lang")?.value ?? cookieStore.get("app_lang")?.value,
    acceptLanguage: h.get("accept-language"),
  });
  const fallbackTitle = safeTranslate(lang, "store_fallback_name", {
    fallbackKo: "매장",
    fallbackEn: "Store",
  });
  if (!decoded) return { title: fallbackTitle };

  const seo = await loadStoreSeoMetadataBySlug(decoded);
  if (!seo) return { title: fallbackTitle };

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
  /**
   * Soft (parked browse): bridge null — DeliveryPresentationShell hosts StoreDetailPublic.
   * Hard / direct: bridge mounts StoreDetailPublic (RSC page entry preserved).
   */
  return (
    <>
      <StoreDetailPageEnterTrace slug={safe} />
      <DeliveryStoreRouteBridge slug={safe} />
    </>
  );
}
