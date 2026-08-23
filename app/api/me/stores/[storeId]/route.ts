import { NextRequest, NextResponse } from "next/server";
import { getRouteUserId } from "@/lib/auth/get-route-user-id";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";
import { refreshStoreOrdersCheckoutGeoAfterStoreLocationChanged } from "@/lib/stores/sync-store-orders-checkout-geo";
import { clearStoreHomeFeedServerCache } from "@/lib/stores/store-home-feed-server-cache";
import { invalidateStorePublicCachesForSlugOnServer } from "@/lib/stores/store-public-cache-invalidate-server";
import { sanitizeBusinessHoursJsonForPersistence } from "@/lib/stores/serialize-store-business-hours-json";
import { getStoreIfOwner } from "@/lib/stores/owner-product-gate";
import { buildStoreTaxonomyPatch } from "@/lib/stores/build-store-taxonomy-patch";
import { normalizePhMobileDb, PH_LOCAL_MOBILE_RULE_MESSAGE_KO } from "@/lib/utils/ph-mobile";
import {
  buildStoreLocationPatchFields,
  storeLocationPatchTouchesCoords,
} from "@/lib/stores/build-store-location-patch";
import { invalidateMeStoresListServerCache } from "@/lib/me/load-me-stores-for-user";
import { invalidateDiscoveryAfterStoreWrite } from "@/lib/stores/discovery/invalidate-discovery-after-store-write";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BLOCKED_APPROVAL = new Set(["rejected", "suspended"]);

type PatchBody = {
  /** 관리자가 owner_can_edit_store_identity 허용 시에만 적용 */
  store_name?: string;
  description?: string | null;
  phone?: string | null;
  kakao_id?: string | null;
  /** 관리자 허용 시에만 적용 */
  business_type?: string | null;
  /** 관리자 허용 시에만 적용 */
  store_category_id?: string | null;
  /** 관리자 허용 시에만 적용 */
  store_topic_id?: string | null;
  region?: string | null;
  city?: string | null;
  district?: string | null;
  address_line1?: string | null;
  address_line2?: string | null;
  email?: string | null;
  website_url?: string | null;
  profile_image_url?: string | null;
  /** 매장 공개 노출 여부 (오너가 직접 토글) */
  is_visible?: boolean;
  is_open?: boolean;
  delivery_available?: boolean;
  /** 공개 메뉴판에서 품절을 섹션 하단으로 정렬 */
  menu_sold_out_bottom?: boolean;
  /** 주문 메신저 방 음성 메시지 허용 */
  messenger_voice_messages_enabled?: boolean;
  /** 주문 메신저 방 음성 통화 허용 */
  messenger_voice_calls_enabled?: boolean;
  /** 주문 메신저 방 영상 통화 허용 */
  messenger_video_calls_enabled?: boolean;
  pickup_available?: boolean;
  reservation_available?: boolean;
  visit_available?: boolean;
  /** 공개 페이지 영업시간 (JSON 객체) */
  business_hours_json?: Record<string, unknown> | null;
  /** 공개 갤러리 이미지 URL 등 (JSON 배열) */
  gallery_images_json?: unknown[] | null;
  lat?: number | null;
  lng?: number | null;
  place_id?: string | null;
  formatted_address?: string | null;
  detail_address?: string | null;
};

function trimOrNull(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const t = String(v).trim();
  return t || null;
}

/**
 * 매장 오너: 공개 페이지(/stores/[slug])에 노출되는 프로필 필드 수정
 * 슬러그·승인 상태·오너는 변경하지 않음
 */
export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ storeId: string }> }
) {
  const userId = await getRouteUserId();
  if (!userId) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const { storeId } = await context.params;
  const sid = typeof storeId === "string" ? storeId.trim() : "";
  if (!sid) {
    return NextResponse.json({ ok: false, error: "missing_store_id" }, { status: 400 });
  }

  let body: PatchBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const sb = tryGetSupabaseForStores();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  }

  const gate = await getStoreIfOwner(sb, userId, sid);
  if (!gate.ok) {
    return NextResponse.json({ ok: false, error: gate.error }, { status: gate.status });
  }
  if (BLOCKED_APPROVAL.has(gate.store.approval_status)) {
    return NextResponse.json(
      { ok: false, error: "store_not_editable" },
      { status: 403 }
    );
  }

  const { data: currentRow, error: curErr } = await sb
    .from("stores")
    .select(
      "store_category_id, store_topic_id, region, city, district, address_line1, address_line2, place_id, formatted_address, lat, lng",
    )
    .eq("id", sid)
    .maybeSingle();

  if (curErr || !currentRow) {
    console.error("[PATCH /api/me/stores/storeId] current", curErr);
    return NextResponse.json({ ok: false, error: "store_load_failed" }, { status: 500 });
  }

  const patch: Record<string, unknown> = {};
  const canEditIdentity = gate.store.owner_can_edit_store_identity === true;

  if (canEditIdentity) {
    if (body.store_name !== undefined) {
      const name = String(body.store_name ?? "").trim();
      if (name.length < 2) {
        return NextResponse.json({ ok: false, error: "store_name_too_short" }, { status: 400 });
      }
      patch.store_name = name;
    }
    if (body.business_type !== undefined) {
      patch.business_type = trimOrNull(body.business_type);
    }

    if (body.store_category_id !== undefined || body.store_topic_id !== undefined) {
      const built = await buildStoreTaxonomyPatch(sb, {
        currentCategoryId:
          typeof currentRow.store_category_id === "string"
            ? currentRow.store_category_id
            : null,
        currentTopicId:
          typeof currentRow.store_topic_id === "string" ? currentRow.store_topic_id : null,
        store_category_id: body.store_category_id,
        store_topic_id: body.store_topic_id,
      });
      if (!built.ok) {
        return NextResponse.json({ ok: false, error: built.error }, { status: 400 });
      }
      Object.assign(patch, built.patch);
    }
  }

  if (body.description !== undefined) {
    patch.description = body.description === null ? null : trimOrNull(body.description);
  }
  if (body.phone !== undefined) {
    const pt = trimOrNull(body.phone);
    if (pt === null) {
      patch.phone = null;
    } else {
      const norm = normalizePhMobileDb(pt);
      if (!norm) {
        return NextResponse.json({ ok: false, error: PH_LOCAL_MOBILE_RULE_MESSAGE_KO }, { status: 400 });
      }
      patch.phone = norm;
    }
  }
  if (body.kakao_id !== undefined) patch.kakao_id = trimOrNull(body.kakao_id);

  if (body.email !== undefined) {
    const et = trimOrNull(body.email);
    if (et === null) {
      patch.email = null;
    } else {
      const norm = normalizePhMobileDb(et);
      patch.email = norm;
    }
  }
  if (body.website_url !== undefined) patch.website_url = trimOrNull(body.website_url);
  if (body.profile_image_url !== undefined) {
    patch.profile_image_url = body.profile_image_url === null ? null : trimOrNull(body.profile_image_url);
  }
  if (body.is_visible !== undefined) {
    // 노출 토글은 승인 상태에서만 의미가 있으므로, blocked 상태는 위에서 차단됨.
    patch.is_visible = Boolean(body.is_visible);
  }
  if (body.is_open !== undefined) {
    patch.is_open = Boolean(body.is_open);
  }
  if (body.delivery_available !== undefined) {
    patch.delivery_available = Boolean(body.delivery_available);
  }
  if (body.menu_sold_out_bottom !== undefined) {
    patch.menu_sold_out_bottom = Boolean(body.menu_sold_out_bottom);
  }
  if (body.messenger_voice_messages_enabled !== undefined) {
    patch.messenger_voice_messages_enabled = Boolean(body.messenger_voice_messages_enabled);
  }
  if (body.messenger_voice_calls_enabled !== undefined) {
    patch.messenger_voice_calls_enabled = Boolean(body.messenger_voice_calls_enabled);
  }
  if (body.messenger_video_calls_enabled !== undefined) {
    patch.messenger_video_calls_enabled = Boolean(body.messenger_video_calls_enabled);
  }
  if (body.pickup_available !== undefined) {
    patch.pickup_available = Boolean(body.pickup_available);
  }
  if (body.reservation_available !== undefined) {
    patch.reservation_available = Boolean(body.reservation_available);
  }
  if (body.visit_available !== undefined) {
    patch.visit_available = Boolean(body.visit_available);
  }

  if (body.business_hours_json !== undefined) {
    if (body.business_hours_json === null) {
      patch.business_hours_json = null;
    } else if (
      typeof body.business_hours_json === "object" &&
      body.business_hours_json !== null &&
      !Array.isArray(body.business_hours_json)
    ) {
      patch.business_hours_json = sanitizeBusinessHoursJsonForPersistence(body.business_hours_json);
    } else {
      return NextResponse.json({ ok: false, error: "invalid_business_hours_json" }, { status: 400 });
    }
  }

  if (body.gallery_images_json !== undefined) {
    if (body.gallery_images_json === null) {
      patch.gallery_images_json = null;
    } else if (Array.isArray(body.gallery_images_json)) {
      patch.gallery_images_json = body.gallery_images_json;
    } else {
      return NextResponse.json({ ok: false, error: "invalid_gallery_images_json" }, { status: 400 });
    }
  }

  const locationBuilt = buildStoreLocationPatchFields(
    {
      region: currentRow.region as string | null,
      city: currentRow.city as string | null,
      district: currentRow.district as string | null,
      address_line1: currentRow.address_line1 as string | null,
      address_line2: currentRow.address_line2 as string | null,
      place_id: (currentRow as { place_id?: string | null }).place_id,
      formatted_address: (currentRow as { formatted_address?: string | null }).formatted_address,
      lat: (currentRow as { lat?: unknown }).lat,
      lng: (currentRow as { lng?: unknown }).lng,
    },
    {
      ...(body.region !== undefined ? { region: body.region } : {}),
      ...(body.city !== undefined ? { city: body.city } : {}),
      ...(body.district !== undefined ? { district: body.district } : {}),
      ...(body.address_line1 !== undefined ? { address_line1: body.address_line1 } : {}),
      ...(body.address_line2 !== undefined ? { address_line2: body.address_line2 } : {}),
      ...(body.place_id !== undefined ? { place_id: body.place_id } : {}),
      ...(body.formatted_address !== undefined
        ? { formatted_address: body.formatted_address }
        : {}),
      ...(body.detail_address !== undefined ? { detail_address: body.detail_address } : {}),
      ...(body.lat !== undefined ? { lat: body.lat } : {}),
      ...(body.lng !== undefined ? { lng: body.lng } : {}),
    }
  );
  if (!locationBuilt.ok) {
    return NextResponse.json({ ok: false, error: locationBuilt.error }, { status: 400 });
  }
  Object.assign(patch, locationBuilt.patch);

  const resolvedCategoryId =
    patch.store_category_id !== undefined
      ? (patch.store_category_id as string | null)
      : (currentRow.store_category_id as string | null);
  if (
    !resolvedCategoryId &&
    patch.store_topic_id === undefined &&
    currentRow.store_topic_id
  ) {
    patch.store_topic_id = null;
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ ok: false, error: "no_fields" }, { status: 400 });
  }

  const { data: updated, error: upErr } = await sb
    .from("stores")
    .update(patch)
    .eq("id", sid)
    .select(
      [
        "id, owner_user_id, store_name, slug, business_type, owner_can_edit_store_identity",
        "store_category_id, store_topic_id",
        "description, kakao_id, phone, email, website_url",
        "region, city, district, address_line1, address_line2, place_id, formatted_address, detail_address, lat, lng",
        "profile_image_url, business_hours_json, gallery_images_json, is_open",
        "delivery_available, pickup_available, reservation_available, visit_available, menu_sold_out_bottom",
        "messenger_voice_messages_enabled, messenger_voice_calls_enabled, messenger_video_calls_enabled",
        "approval_status, is_visible, rejected_reason, revision_note",
        "created_at, updated_at, approved_at",
        "store_categories ( name, slug ), store_topics ( name, slug )",
      ].join(", ")
    )
    .maybeSingle();

  if (upErr) {
    console.error("[PATCH /api/me/stores/storeId]", upErr);
    return NextResponse.json({ ok: false, error: upErr.message }, { status: 500 });
  }

  if (!updated) {
    console.error("[PATCH /api/me/stores/storeId] update returned no row", sid);
    return NextResponse.json({ ok: false, error: "update_no_row" }, { status: 500 });
  }

  invalidateDiscoveryAfterStoreWrite(sb, sid, patch);

  clearStoreHomeFeedServerCache();
  invalidateMeStoresListServerCache(userId);

  const slugRaw = (updated as unknown as { slug?: string }).slug;
  const publicSlug = typeof slugRaw === "string" ? slugRaw.trim() : "";
  if (publicSlug) invalidateStorePublicCachesForSlugOnServer(publicSlug);

  if (storeLocationPatchTouchesCoords(locationBuilt.patch)) {
    const store_orders_checkout_geo_sync = await refreshStoreOrdersCheckoutGeoAfterStoreLocationChanged(
      sb as never,
      sid
    );
    return NextResponse.json({ ok: true, store: updated, store_orders_checkout_geo_sync });
  }

  return NextResponse.json({ ok: true, store: updated });
}
