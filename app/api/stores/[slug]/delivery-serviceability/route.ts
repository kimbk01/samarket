import { NextResponse } from "next/server";
import { getRouteUserId } from "@/lib/auth/get-route-user-id";
import {
  evaluateStoreDeliveryServiceArea,
  loadDeliveryServiceabilityRuntimeContext,
} from "@/lib/delivery/load-delivery-serviceability-runtime";
import { loadStoreSelectedDeliveryLguIds } from "@/lib/delivery/service-area/store-delivery-service-areas";
import { resolveMemberCanonicalLguId } from "@/lib/delivery/service-area/resolve-member-canonical-lgu";
import { isDeliveryRoutableMasterAddress } from "@/lib/addresses/delivery-routable-address";
import { getUserAddressDefaults } from "@/lib/addresses/user-address-service";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";
import { isStoreDetailViewerBlocked, storeDetailLoginRequiredResponse } from "@/lib/stores/store-detail-api-gate";
import { STORE_PUBLIC_API_ERROR_CODES } from "@/lib/stores/store-public-api-error-codes";

const STORE_SERVICEABILITY_SELECT =
  "id, slug, lat, lng, delivery_radius_km, delivery_available, approval_status, is_visible, delivery_service_area_authority";

async function loadApprovedStoreForServiceability(
  sb: NonNullable<ReturnType<typeof tryGetSupabaseForStores>>,
  slug: string
): Promise<
  | { ok: true; store: Record<string, unknown> }
  | { ok: false; reason: "not_found" }
  | { ok: false; reason: "db_error"; message: string }
> {
  const { data, error } = await sb.from("stores").select(STORE_SERVICEABILITY_SELECT).eq("slug", slug).maybeSingle();
  if (error) return { ok: false, reason: "db_error", message: error.message };
  const row = data as Record<string, unknown> | null;
  if (!row?.id || row.approval_status !== "approved" || row.is_visible !== true) {
    return { ok: false, reason: "not_found" };
  }
  return { ok: true, store: row };
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Store detail / cart — same SSOT as browse + order gate.
 * GET /api/stores/[slug]/delivery-serviceability
 */
export async function GET(
  _req: Request,
  context: { params: Promise<{ slug: string }> }
) {
  const { slug } = await context.params;
  const decoded = decodeURIComponent(slug || "").trim();
  if (!decoded) {
    return NextResponse.json({ ok: false, error: "missing_slug" }, { status: 400 });
  }

  const sb = tryGetSupabaseForStores();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  }

  /**
   * v4 API-09 — 승인·노출 매장만 (`getApprovedStoreBySlug` 와 같은 판정 — 숨김·미승인 매장 id·좌표 미반환),
   * 오류 원문 미노출. 단, 30s slug 메모리 캐시는 쓰지 않는다: 반경·좌표·지역 변경 직후 상세 판정이
   * 체크아웃(주문 게이트)과 어긋나면 안 된다 (S08 진입점 매트릭스 계약).
   * v4 API-14 — 상세 계열 비로그인 게이트. 인증·매장 조회 병렬.
   */
  const [userId, storeRes] = await Promise.all([
    getRouteUserId(),
    loadApprovedStoreForServiceability(sb, decoded),
  ]);
  if (isStoreDetailViewerBlocked(userId)) {
    return storeDetailLoginRequiredResponse();
  }
  if (storeRes.ok === false) {
    if (storeRes.reason === "db_error") {
      console.error("[api/stores/slug/delivery-serviceability] store", storeRes.message);
      return NextResponse.json(
        { ok: false, error: STORE_PUBLIC_API_ERROR_CODES.deliveryServiceability },
        { status: 500 }
      );
    }
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }
  const store = storeRes.store as {
    id: string;
    slug: string;
    lat: number | null;
    lng: number | null;
    delivery_radius_km?: unknown;
    delivery_available?: boolean | null;
    delivery_service_area_authority?: unknown;
  };

  let customerLat: number | null = null;
  let customerLng: number | null = null;
  let addressId: string | null = null;
  let memberLguId: string | null = null;
  if (userId) {
    try {
      const defaults = await getUserAddressDefaults(sb, userId);
      const master = defaults.master;
      if (master && isDeliveryRoutableMasterAddress(master)) {
        addressId = master.id;
        const la = master.latitude;
        const ln = master.longitude;
        if (typeof la === "number" && Number.isFinite(la)) customerLat = la;
        if (typeof ln === "number" && Number.isFinite(ln)) customerLng = ln;
        memberLguId = resolveMemberCanonicalLguId({
          canonicalLguId: (master as { canonicalLguId?: string | null }).canonicalLguId,
          cityMunicipality: master.cityMunicipality,
          province: master.province,
        });
      } else if (master?.id) {
        addressId = master.id;
        memberLguId = resolveMemberCanonicalLguId({
          canonicalLguId: (master as { canonicalLguId?: string | null }).canonicalLguId,
          cityMunicipality: master.cityMunicipality,
          province: master.province,
        });
      }
    } catch {
      /* ignore — treat as missing customer coords */
    }
  }

  const authorityMode = (store as { delivery_service_area_authority?: unknown })
    .delivery_service_area_authority;
  const selectedLguIds =
    String(authorityMode ?? "").toLowerCase() === "v2_lgu"
      ? await loadStoreSelectedDeliveryLguIds(sb, String(store.id))
      : [];

  const ctx = await loadDeliveryServiceabilityRuntimeContext(sb);
  const svc = evaluateStoreDeliveryServiceArea({
    ctx,
    storeId: String(store.id),
    storeDeliveryRadiusKm: (store as { delivery_radius_km?: unknown }).delivery_radius_km,
    customerLat,
    customerLng,
    storeLat: store.lat,
    storeLng: store.lng,
    authorityMode,
    selectedLguIds,
    memberLguId,
  });

  return NextResponse.json({
    ok: true,
    storeId: store.id,
    slug: store.slug,
    deliveryAvailable: store.delivery_available === true,
    addressId,
    customerLat,
    customerLng,
    storeLat: store.lat,
    storeLng: store.lng,
    policyEnabled: ctx.policy.enabled,
    eligible: svc.eligible,
    applies: svc.applies,
    distanceKm: svc.distanceKm,
    maxKm: svc.maxKm,
    referenceDistanceKm: svc.referenceDistanceKm,
    reason: svc.reason,
    policySource: svc.policySource,
    authorityMode: svc.authorityMode,
    memberLguId: svc.memberLguId,
    matchedLguId: svc.matchedLguId,
  });
}
