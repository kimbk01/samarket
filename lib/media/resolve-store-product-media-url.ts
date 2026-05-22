const STORE_PRODUCT_IMAGES_BUCKET = "store-product-images";

function readSupabasePublicOrigin(): string | null {
  const raw =
    typeof process !== "undefined" && process.env.NEXT_PUBLIC_SUPABASE_URL
      ? process.env.NEXT_PUBLIC_SUPABASE_URL
      : null;
  const trimmed = raw?.trim().replace(/\/+$/, "") ?? "";
  return trimmed || null;
}

/** 프로덕션(Vercel)에서만 LAN·localhost 미디어 URL 을 Supabase public 로 재조립 */
function shouldRewriteDevOnlyMediaHosts(): boolean {
  if (process.env.VERCEL === "1") return true;
  if (process.env.NODE_ENV === "production") return true;
  return false;
}

function isDevOnlyMediaHost(hostname: string): boolean {
  const h = hostname.toLowerCase();
  if (h === "localhost" || h.endsWith(".localhost") || h === "127.0.0.1") return true;
  if (/^192\.168\.\d{1,3}\.\d{1,3}$/.test(h)) return true;
  if (/^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(h)) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}$/.test(h)) return true;
  return false;
}

function publicUrlFromStorageObjectPath(objectPath: string): string | null {
  const origin = readSupabasePublicOrigin();
  if (!origin) return null;
  const path = objectPath.replace(/^\/+/, "").trim();
  if (!path) return null;
  return `${origin}/storage/v1/object/public/${STORE_PRODUCT_IMAGES_BUCKET}/${path}`;
}

function extractStorageObjectPath(input: string): string | null {
  const embedded = input.match(/store-product-images\/(.+)$/i);
  if (embedded?.[1]) return embedded[1].trim();
  const trimmed = input.replace(/^\/+/, "").trim();
  if (!trimmed || /^https?:\/\//i.test(trimmed)) return null;
  return trimmed;
}

/**
 * `store_products.thumbnail_url` — Supabase public URL 정규화.
 * - 개발: DB 에 저장된 URL 그대로 사용(로컬 Supabase `127.0.0.1:54321` 등).
 * - 프로덕션: LAN·localhost 절대 URL 은 storage 경로로 재조립.
 */
export function resolveStoreProductMediaUrl(raw: string | null | undefined): string | null {
  const u = typeof raw === "string" ? raw.trim() : "";
  if (!u) return null;

  try {
    const parsed = new URL(u);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return null;
    }
    if (isDevOnlyMediaHost(parsed.hostname)) {
      if (!shouldRewriteDevOnlyMediaHosts()) {
        return u;
      }
      const objectPath = extractStorageObjectPath(parsed.pathname);
      if (objectPath) {
        return publicUrlFromStorageObjectPath(objectPath);
      }
      return null;
    }
    return u;
  } catch {
    /* bare object path — e.g. `{storeId}/{file}.webp` */
  }

  const objectPath = extractStorageObjectPath(u);
  if (objectPath) {
    return publicUrlFromStorageObjectPath(objectPath);
  }

  return null;
}
