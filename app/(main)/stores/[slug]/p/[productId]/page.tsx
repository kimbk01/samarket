import type { Metadata } from "next";
import { cookies } from "next/headers";
import { headers } from "next/headers";
import { Suspense } from "react";
import { MainFeedRouteLoading } from "@/components/layout/MainRouteLoading";
import { StoreProductPublic } from "@/components/stores/StoreProductPublic";
import { resolveServerInitialLanguage } from "@/lib/i18n/language-preference";
import { safeTranslate } from "@/lib/i18n/safe-translate";
import { parseMediaUrlsJson } from "@/lib/stores/parse-media-urls-json";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string; productId: string }>;
}): Promise<Metadata> {
  const { productId } = await params;
  const id = typeof productId === "string" ? productId.trim() : "";
  const h = await headers();
  const cookieStore = await cookies();
  const lang = resolveServerInitialLanguage({
    cookieValue: cookieStore.get("sam_lang")?.value ?? cookieStore.get("app_lang")?.value,
    acceptLanguage: h.get("accept-language"),
  });
  const fallbackProductTitle = safeTranslate(lang, "store_meta_product_title", {
    fallbackKo: "상품",
    fallbackEn: "Product",
  });
  const fallbackStoreName = safeTranslate(lang, "store_fallback_name", {
    fallbackKo: "매장",
    fallbackEn: "Store",
  });
  if (!id) return { title: fallbackProductTitle };

  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "";
  const proto = (h.get("x-forwarded-proto") ?? "http").split(",")[0]?.trim() || "http";
  if (!host) return { title: fallbackProductTitle };

  const base = `${proto}://${host}`;
  try {
    const res = await fetch(`${base}/api/stores/products/${encodeURIComponent(id)}`, {
      cache: "no-store",
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return { title: fallbackProductTitle };
    const json = (await res.json()) as {
      ok?: boolean;
      product?: {
        title?: string;
        summary?: string | null;
        thumbnail_url?: string | null;
        images_json?: unknown;
      };
      store?: { store_name?: string; slug?: string };
    };
    if (!json?.ok || !json.product || !json.store) return { title: fallbackProductTitle };

    const title = `${String(json.product.title ?? fallbackProductTitle)} · ${String(json.store.store_name ?? fallbackStoreName)}`;
    const sum = typeof json.product.summary === "string" ? json.product.summary.trim() : "";
    const description = (
      sum ||
      safeTranslate(lang, "store_meta_product_desc", {
        vars: { store: String(json.store.store_name ?? fallbackStoreName) },
        fallbackKo: `${String(json.store.store_name ?? fallbackStoreName)}의 상품입니다.`,
        fallbackEn: `Product from ${String(json.store.store_name ?? fallbackStoreName)}.`,
      })
    ).slice(0, 160);
    const thumbPrimary =
      typeof json.product.thumbnail_url === "string" && json.product.thumbnail_url.trim()
        ? json.product.thumbnail_url.trim()
        : "";
    const ogImage = thumbPrimary || parseMediaUrlsJson(json.product.images_json, 1)[0] || undefined;
    const canonSlug = String(json.store.slug ?? "");
    const path = `/stores/${encodeURIComponent(canonSlug)}/p/${encodeURIComponent(id)}`;

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
    return { title: fallbackProductTitle };
  }
}

export default function StoreProductPage({
  params,
}: {
  params: Promise<{ slug: string; productId: string }>;
}) {
  return (
    <Suspense fallback={<MainFeedRouteLoading rows={5} />}>
      <StoreProductPageBody params={params} />
    </Suspense>
  );
}

async function StoreProductPageBody({
  params,
}: {
  params: Promise<{ slug: string; productId: string }>;
}) {
  const { slug, productId } = await params;
  const safeSlug = typeof slug === "string" ? slug : "";
  const safePid = typeof productId === "string" ? productId : "";
  return <StoreProductPublic storeSlug={safeSlug} productId={safePid} />;
}
