import type { Metadata } from "next";
import { headers } from "next/headers";
import { StoreProductPublic } from "@/components/stores/StoreProductPublic";
import { parseMediaUrlsJson } from "@/lib/stores/parse-media-urls-json";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string; productId: string }>;
}): Promise<Metadata> {
  const { productId } = await params;
  const id = typeof productId === "string" ? productId.trim() : "";
  if (!id) return { title: "상품" };

  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "";
  const proto = (h.get("x-forwarded-proto") ?? "http").split(",")[0]?.trim() || "http";
  if (!host) return { title: "상품" };

  const base = `${proto}://${host}`;
  try {
    const res = await fetch(`${base}/api/stores/products/${encodeURIComponent(id)}`, {
      cache: "no-store",
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return { title: "상품" };
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
    if (!json?.ok || !json.product || !json.store) return { title: "상품" };

    const title = `${String(json.product.title ?? "상품")} · ${String(json.store.store_name ?? "매장")}`;
    const sum = typeof json.product.summary === "string" ? json.product.summary.trim() : "";
    const description = (sum || `${json.store.store_name ?? "매장"}의 상품입니다.`).slice(0, 160);
    const thumbRaw =
      typeof json.product.thumbnail_url === "string" && json.product.thumbnail_url
        ? json.product.thumbnail_url
        : "";
    const fromGallery = parseMediaUrlsJson(json.product.images_json, 4)[0] ?? "";
    const thumb = thumbRaw || fromGallery || undefined;
    const canonSlug = String(json.store.slug ?? "");
    const path = `/stores/${encodeURIComponent(canonSlug)}/p/${encodeURIComponent(id)}`;

    return {
      title,
      description,
      openGraph: {
        title,
        description,
        ...(thumb ? { images: [{ url: thumb }] } : {}),
      },
      alternates: { canonical: `${base}${path}` },
    };
  } catch {
    return { title: "상품" };
  }
}

export default async function StoreProductPage({
  params,
}: {
  params: Promise<{ slug: string; productId: string }>;
}) {
  const { slug, productId } = await params;
  const safeSlug = typeof slug === "string" ? slug : "";
  const safePid = typeof productId === "string" ? productId : "";
  return <StoreProductPublic storeSlug={safeSlug} productId={safePid} />;
}
