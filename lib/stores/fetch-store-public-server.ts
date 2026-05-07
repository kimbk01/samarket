import { headers } from "next/headers";

/**
 * 서버 컴포넌트에서 매장 공개 API와 동일 페이로드를 한 번 가져옴.
 * 클라 첫 `fetchStorePublicBySlugDeduped` 가 캐시 히트로 네트워크 생략되도록 `primeStorePublicCache` 와 짝.
 */
export async function fetchStorePublicInitialOnServer(slug: string): Promise<{
  status: number;
  json: unknown;
} | null> {
  const decoded = decodeURIComponent((slug || "").trim()).trim();
  if (!decoded) return null;
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "";
  const proto = (h.get("x-forwarded-proto") ?? "http").split(",")[0]?.trim() || "http";
  if (!host) return null;
  const base = `${proto}://${host}`;
  try {
    const res = await fetch(`${base}/api/stores/${encodeURIComponent(decoded)}`, {
      cache: "no-store",
      headers: { Accept: "application/json" },
    });
    const json = await res.json().catch(() => ({}));
    return { status: res.status, json };
  } catch {
    return null;
  }
}
