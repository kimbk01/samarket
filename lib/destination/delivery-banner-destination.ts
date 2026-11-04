/**
 * DS-6 · C-2 (Owner 「설계안대로」 2026-11-04) — 배달 운영자 자체 배너 목적지 규칙 (배달 SSOT §4).
 * - 매장이 있으면: 그 매장의 상세·메뉴·홍보 3종만(`/stores/{slug}` · `#menu` · `?tab=promo`) — 다른 매장 주소 금지
 * - 매장이 없으면: 이벤트(`/events/:id`) 또는 배달 안 화면(`/stores` · `/stores/browse…` · `/stores/search…` ·
 *   `/stores/gift-mall…` · `/delivery…`)만
 * - 외부 주소(https)는 저장 거부 — 예전에는 저장은 되고 노출은 0 이었다(「저장됐는데 안 나옴」 제거)
 * Pure: 서버 writer 와 시험이 같이 쓴다.
 */
import { destinationHref, parseDestinationHref } from "@/lib/destination/destination-contract";

export type DeliveryFirstPartyBannerDestinationError =
  | "destination_required"
  | "external_forbidden"
  | "invalid_destination"
  | "store_destination_mismatch"
  | "store_required_for_store_page";

const DELIVERY_INTERNAL_PREFIXES = ["/stores/browse", "/stores/search", "/stores/gift-mall", "/delivery"] as const;

export type DeliveryStoreCtaKind = "store_detail" | "store_menu" | "store_promotion";

/** 그 매장의 계약 3종 주소 (`resolveOwnerBannerCtaHref` 와 같은 모양) */
export function deliveryStoreBannerCtaHrefs(storeSlug: string): Record<DeliveryStoreCtaKind, string> {
  const slug = encodeURIComponent(storeSlug.trim());
  return {
    store_detail: `/stores/${slug}`,
    store_menu: `/stores/${slug}#menu`,
    store_promotion: `/stores/${slug}?tab=promo`,
  };
}

function isDeliveryInternalScreen(path: string): boolean {
  const p = path.split(/[?#]/)[0]!.replace(/\/+$/, "") || "/";
  if (p === "/stores" || p === "/delivery") return true;
  return DELIVERY_INTERNAL_PREFIXES.some((x) => p === x || p.startsWith(`${x}/`));
}

function isStorePagePath(path: string): boolean {
  const p = path.split(/[?#]/)[0]!.replace(/\/+$/, "");
  return /^\/stores\/[^/]+(\/.*)?$/.test(p) && !isDeliveryInternalScreen(p);
}

export function validateDeliveryFirstPartyBannerDestination(input: {
  ctaHref: string | null | undefined;
  /** 연결 매장 slug (매장 id 로 DB 에서 확인한 값). 없으면 매장 없는 자체 배너 */
  storeSlug: string | null | undefined;
}): { ok: true; href: string } | { ok: false; error: DeliveryFirstPartyBannerDestinationError } {
  const raw = String(input.ctaHref ?? "").trim();
  if (!raw) return { ok: false, error: "destination_required" };
  const parsed = parseDestinationHref(raw);
  if (!parsed.ok) {
    return { ok: false, error: /^[a-z][a-z0-9+.-]*:/i.test(raw) ? "external_forbidden" : "invalid_destination" };
  }
  if (parsed.ref.kind === "external_url") return { ok: false, error: "external_forbidden" };
  const href = destinationHref(parsed.ref);
  const slug = String(input.storeSlug ?? "").trim();
  if (slug) {
    const allowed = Object.values(deliveryStoreBannerCtaHrefs(slug));
    // 저장값 그대로 비교 + 디코드 비교(한글 slug 를 인코딩 안 하고 넣은 경우)
    const decodedAllowed = allowed.map((a) => {
      try {
        return decodeURI(a);
      } catch {
        return a;
      }
    });
    if (allowed.includes(href) || decodedAllowed.includes(href)) return { ok: true, href };
    return { ok: false, error: "store_destination_mismatch" };
  }
  if (parsed.ref.kind === "event") return { ok: true, href };
  if (isStorePagePath(href)) return { ok: false, error: "store_required_for_store_page" };
  if (isDeliveryInternalScreen(href)) return { ok: true, href };
  return { ok: false, error: "invalid_destination" };
}
