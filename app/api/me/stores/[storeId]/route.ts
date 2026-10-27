import { NextRequest, NextResponse } from "next/server";
import { getRouteUserId } from "@/lib/auth/get-route-user-id";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";
import { refreshStoreOrdersCheckoutGeoAfterStoreLocationChanged } from "@/lib/stores/sync-store-orders-checkout-geo";
import {
  normalizeStoreBusinessHoursJsonForWrite,
  normalizeStoreGalleryImagesJsonForWrite,
  normalizeStoreGcashNumberForWrite,
  ownerStoreVisibilityChangeAllowed,
  parseStoreExpectedUpdatedAt,
  STORE_CHANGED_CONFLICT_ERROR,
  STORE_NOT_APPROVED_FOR_VISIBILITY_ERROR,
} from "@/lib/stores/owner-store-patch-fields";
import { getStoreIfOwner } from "@/lib/stores/owner-product-gate";
import { buildStoreTaxonomyPatch } from "@/lib/stores/build-store-taxonomy-patch";
import { normalizePhMobileDb, PH_LOCAL_MOBILE_RULE_MESSAGE_KO } from "@/lib/utils/ph-mobile";
import { buildStoreLocationPatchFields } from "@/lib/stores/build-store-location-patch";
import { afterCanonicalStoreLocationWrite } from "@/lib/stores/after-canonical-store-location-write";
import { buildStoreVisibilityWritePatch } from "@/lib/stores/store-first-listed-at";
import { parseStoreDeliveryRadiusKmForWrite } from "@/lib/delivery/store-delivery-radius";
import {
  STORE_DELIVERY_REQUIRES_CANONICAL_GEO_ERROR,
  isStoreDeliveryGeoGuardViolation,
  storeHasCanonicalDeliveryOrigin,
} from "@/lib/stores/store-canonical-delivery-origin";
import {
  STORE_LOCATION_MOVE_CONFIRM_REQUIRED_ERROR,
  evaluateStoreLocationMove,
  storeCoordsPatchChangesPin,
  withoutUnchangedStoreCoords,
} from "@/lib/stores/store-location-move-guard";

import { ownerEditReturnsStoreToPending } from "@/lib/admin-business/admin-store-decision-rules";
import { appendAuditLog } from "@/lib/audit/append-audit-log";
import { getAuditRequestMeta } from "@/lib/audit/request-meta";
import { invalidateMeStoresListServerCache } from "@/lib/me/load-me-stores-for-user";
import { bumpStorePublicSharedCacheGeneration } from "@/lib/stores/store-public-shared-cache-generation";
import {
  buildOwnerStoreUpdateAuditDiff,
  OWNER_STORE_PATCH_CURRENT_SELECT,
} from "@/lib/stores/owner-store-update-audit";
import {
  buildStoreCoreInfoReverificationPatch,
  changedStoreCoreLocationFields,
  isStoreCoreInfoFlagColumnMissingError,
  shouldFlagStoreCoreInfoReverification,
  STORE_CORE_INFO_FLAG_KEYS,
  type StoreCoreLocationField,
} from "@/lib/stores/store-core-info-reverification";
import { createAdminNotification } from "@/lib/admin/notifications/admin-notification-service";

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
  /** CUT1 store delivery radius SSOT (km). Omit to leave unchanged. */
  delivery_radius_km?: number | null;
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
  /** OPS-09 — 폼이 읽은 `stores.updated_at`. 보내면 그 사이 다른 저장이 있었을 때 409 `store_changed` (미전송 = 현행). */
  expected_updated_at?: string | null;
  /** LOC-007 — owner confirmed a > 1 km / other-LGU pin move (409 store_location_move_confirm_required). */
  confirmLocationMove?: boolean;
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

  const { data: currentRowRaw, error: curErr } = await sb
    .from("stores")
    .select(OWNER_STORE_PATCH_CURRENT_SELECT)
    .eq("id", sid)
    .maybeSingle();
  // select 컬럼이 상수 문자열 조합이라 타입 추론이 안 됨 — 행 형태를 명시
  const currentRow = currentRowRaw as Record<string, unknown> | null;

  if (curErr || !currentRow) {
    console.error("[PATCH /api/me/stores/storeId] current", curErr);
    return NextResponse.json({ ok: false, error: "store_load_failed" }, { status: 500 });
  }

  const expected = parseStoreExpectedUpdatedAt(body.expected_updated_at);
  if (!expected.ok) {
    return NextResponse.json({ ok: false, error: expected.error }, { status: 400 });
  }
  const expectedUpdatedAt = expected.value;

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
    // OPS-05 — stores.email = GCash 번호 칸. 형식 오류를 null 로 덮어쓰지 않고 400.
    const gcash = normalizeStoreGcashNumberForWrite(body.email);
    if (!gcash.ok) {
      return NextResponse.json({ ok: false, error: gcash.error }, { status: 400 });
    }
    patch.email = gcash.value;
  }
  if (body.website_url !== undefined) patch.website_url = trimOrNull(body.website_url);
  if (body.profile_image_url !== undefined) {
    patch.profile_image_url = body.profile_image_url === null ? null : trimOrNull(body.profile_image_url);
  }
  if (body.is_visible !== undefined) {
    // OPS-07 — 노출 토글은 승인 매장만 (관리자 set_store_visible 과 같은 코드). 미승인 토글이 first_listed_at 를 앞당기지 않게.
    if (!ownerStoreVisibilityChangeAllowed(gate.store.approval_status)) {
      return NextResponse.json(
        { ok: false, error: STORE_NOT_APPROVED_FOR_VISIBILITY_ERROR },
        { status: 409 }
      );
    }
    // P1-C1: visibility intent only — first_listed_at stamp is DB trigger authority.
    Object.assign(patch, buildStoreVisibilityWritePatch(Boolean(body.is_visible)));
  }
  if (body.is_open !== undefined) {
    patch.is_open = Boolean(body.is_open);
  }
  if (body.delivery_available !== undefined) {
    patch.delivery_available = Boolean(body.delivery_available);
  }
  if (body.delivery_radius_km !== undefined) {
    if (body.delivery_radius_km === null) {
      patch.delivery_radius_km = null;
    } else {
      const parsed = parseStoreDeliveryRadiusKmForWrite(body.delivery_radius_km);
      if (!parsed.ok) {
        return NextResponse.json({ ok: false, error: parsed.error }, { status: 400 });
      }
      patch.delivery_radius_km = parsed.value;
    }
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

  // OPS-09 — NOT NULL jsonb 컬럼: null(초기화) → {} / [] (DB 원문 500 방지).
  if (body.business_hours_json !== undefined) {
    const hours = normalizeStoreBusinessHoursJsonForWrite(body.business_hours_json);
    if (!hours.ok) {
      return NextResponse.json({ ok: false, error: hours.error }, { status: 400 });
    }
    patch.business_hours_json = hours.value;
  }

  if (body.gallery_images_json !== undefined) {
    const gallery = normalizeStoreGalleryImagesJsonForWrite(body.gallery_images_json);
    if (!gallery.ok) {
      return NextResponse.json({ ok: false, error: gallery.error }, { status: 400 });
    }
    patch.gallery_images_json = gallery.value;
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
  /**
   * LOC-013 — coords re-sent unchanged (7 dp) are not a location change: checkout-geo refresh and geo
   * discovery invalidation run only on a real pin move.
   */
  const currentCoords = {
    lat: (currentRow as { lat?: unknown }).lat,
    lng: (currentRow as { lng?: unknown }).lng,
  };
  const storeCoordsChanged = storeCoordsPatchChangesPin(patch, currentCoords);

  // ACTIVE STORE GEO SSOT — cannot enable Delivery without canonical stores.lat/lng.
  if (patch.delivery_available === true) {
    const effectiveLat =
      patch.lat !== undefined ? patch.lat : (currentRow as { lat?: unknown }).lat;
    const effectiveLng =
      patch.lng !== undefined ? patch.lng : (currentRow as { lng?: unknown }).lng;
    if (!storeHasCanonicalDeliveryOrigin(effectiveLat, effectiveLng)) {
      return NextResponse.json(
        { ok: false, error: STORE_DELIVERY_REQUIRES_CANONICAL_GEO_ERROR },
        { status: 400 }
      );
    }
  }

  // LOC-007 — real pin move > 1 km or into another LGU than the saved City needs owner confirmation.
  if (storeCoordsChanged && body.confirmLocationMove !== true) {
    const move = evaluateStoreLocationMove({
      currentLat: (currentRow as { lat?: unknown }).lat,
      currentLng: (currentRow as { lng?: unknown }).lng,
      nextLat: patch.lat !== undefined ? patch.lat : (currentRow as { lat?: unknown }).lat,
      nextLng: patch.lng !== undefined ? patch.lng : (currentRow as { lng?: unknown }).lng,
      city: (patch.city !== undefined ? patch.city : currentRow.city) as string | null,
      region: (patch.region !== undefined ? patch.region : currentRow.region) as string | null,
    });
    if (move.requiresConfirm) {
      return NextResponse.json(
        {
          ok: false,
          error: STORE_LOCATION_MOVE_CONFIRM_REQUIRED_ERROR,
          move_km: move.moveKm,
          reasons: move.reasons,
          city_lgu_id: move.cityLguId,
          pin_lgu_id: move.pinLguId,
        },
        { status: 409 }
      );
    }
  }

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

  // ND-2 — 승인 매장의 핵심 위치(주소·좌표) 변경: 즉시 반영 + 관리자 재검증 표시 (같은 UPDATE 로 원자 기록).
  const currentRecord = currentRow as unknown as Record<string, unknown>;
  const coreChangedFields: StoreCoreLocationField[] = changedStoreCoreLocationFields(
    currentRecord,
    locationBuilt.patch
  );
  const flagCoreInfo = shouldFlagStoreCoreInfoReverification(
    gate.store.approval_status,
    coreChangedFields
  );
  if (flagCoreInfo) {
    Object.assign(
      patch,
      buildStoreCoreInfoReverificationPatch(coreChangedFields, new Date().toISOString())
    );
  }

  const runStoreUpdate = (rowPatch: Record<string, unknown>) => {
    let q = sb.from("stores").update(rowPatch).eq("id", sid);
    // OPS-09 — CAS: 폼이 읽은 뒤 다른 저장이 있었으면 0행 → 409 (business_hours_json 전체 덮어쓰기 lost update 방지).
    if (expectedUpdatedAt) q = q.eq("updated_at", expectedUpdatedAt);
    return q
      .select(
        [
          "id, owner_user_id, store_name, slug, business_type, owner_can_edit_store_identity",
          "store_category_id, store_topic_id",
          "description, kakao_id, phone, email, website_url",
          "region, city, district, address_line1, address_line2, place_id, formatted_address, detail_address, lat, lng",
          "profile_image_url, business_hours_json, gallery_images_json, is_open",
          "delivery_available, delivery_radius_km, pickup_available, reservation_available, visit_available, menu_sold_out_bottom",
          "messenger_voice_messages_enabled, messenger_voice_calls_enabled, messenger_video_calls_enabled",
          "approval_status, is_visible, first_listed_at, rejected_reason, revision_note",
          "created_at, updated_at, approved_at",
          "store_categories ( name, slug ), store_topics ( name, slug )",
        ].join(", ")
      )
      .maybeSingle();
  };

  let { data: updated, error: upErr } = await runStoreUpdate(patch);
  let coreInfoFlagSaved = flagCoreInfo;
  if (upErr && flagCoreInfo && isStoreCoreInfoFlagColumnMissingError(upErr.message)) {
    // 배포 순서 보호: 플래그 컬럼 마이그레이션 적용 전이면 플래그 없이 저장(감사·관리자 알림은 유지).
    console.error("[PATCH /api/me/stores/storeId] core_info flag columns missing", upErr.message);
    for (const k of STORE_CORE_INFO_FLAG_KEYS) delete patch[k];
    coreInfoFlagSaved = false;
    ({ data: updated, error: upErr } = await runStoreUpdate(patch));
  }

  if (upErr) {
    console.error("[PATCH /api/me/stores/storeId]", upErr);
    // LOC-005 — DB guard (stores_guard_delivery_requires_geo) uses the same code as the API check.
    if (isStoreDeliveryGeoGuardViolation(upErr)) {
      return NextResponse.json(
        { ok: false, error: STORE_DELIVERY_REQUIRES_CANONICAL_GEO_ERROR },
        { status: 400 }
      );
    }
    // OPS-09 — DB 원문을 클라이언트에 노출하지 않는다 (로그에만).
    return NextResponse.json({ ok: false, error: "update_failed" }, { status: 500 });
  }

  if (!updated && expectedUpdatedAt) {
    return NextResponse.json({ ok: false, error: STORE_CHANGED_CONFLICT_ERROR }, { status: 409 });
  }

  if (!updated) {
    console.error("[PATCH /api/me/stores/storeId] update returned no row", sid);
    return NextResponse.json({ ok: false, error: "update_no_row" }, { status: 500 });
  }

  // C-6 / DEF-16 — 보완 요청 매장의 신청 내용 수정 = 재제출 → 심사 대기 복귀 (상태 조건부).
  if (ownerEditReturnsStoreToPending(gate.store.approval_status, Object.keys(patch))) {
    const { data: resubmitted, error: resubmitErr } = await sb
      .from("stores")
      .update({ approval_status: "pending" })
      .eq("id", sid)
      .eq("approval_status", "revision_requested")
      .select("id, approval_status")
      .maybeSingle();
    if (resubmitErr) {
      console.error("[PATCH /api/me/stores/storeId] resubmit", resubmitErr);
    } else if (resubmitted) {
      (updated as unknown as { approval_status?: string }).approval_status = "pending";
      invalidateMeStoresListServerCache(userId);
      const rm = getAuditRequestMeta(req);
      await appendAuditLog(sb, {
        actor_type: "user",
        actor_id: userId,
        target_type: "store",
        target_id: sid,
        action: "store.owner_resubmit",
        before_json: { approval_status: "revision_requested" },
        after_json: { approval_status: "pending", fields: Object.keys(patch) },
        ip: rm.ip,
        user_agent: rm.userAgent,
      }).catch((e: unknown) => console.error("[PATCH /api/me/stores/storeId] resubmit audit", e));
    }
  }

  // ACC-06 — 오너 매장 정보 변경 감사 (실제로 바뀐 키만 before/after). 감사 실패는 로그만, 저장 결과는 유지.
  const auditDiff = buildOwnerStoreUpdateAuditDiff(currentRecord, patch);
  if (auditDiff) {
    const rm = getAuditRequestMeta(req);
    await appendAuditLog(sb, {
      actor_type: "user",
      actor_id: userId,
      target_type: "store",
      target_id: sid,
      action: "store.owner_update",
      before_json: auditDiff.before,
      after_json: {
        ...auditDiff.after,
        fields: auditDiff.fields,
        approval_status: gate.store.approval_status,
        ...(flagCoreInfo
          ? { core_info_reverification: { fields: coreChangedFields, flag_saved: coreInfoFlagSaved } }
          : {}),
      },
      ip: rm.ip,
      user_agent: rm.userAgent,
    }).catch((e: unknown) => console.error("[PATCH /api/me/stores/storeId] owner_update audit", e));
  }

  // ND-2 — 관리자 재검증 알림 (매장 결정 권한 `business` 보유 관리자). 실패는 outbox 재시도·로그.
  if (flagCoreInfo) {
    const storeName = String((updated as unknown as { store_name?: string }).store_name ?? "").trim();
    await createAdminNotification(sb, {
      broadcastPermission: "business",
      requiredPermission: "business",
      kind: "store_core_info_changed",
      severity: "warning",
      title: `매장 주소·위치 변경 재검증 · ${storeName || sid}`,
      body: `변경 항목: ${coreChangedFields.join(", ")}`,
      linkUrl: `/admin/business/${encodeURIComponent(sid)}`,
      workRef: { table: "stores", id: sid },
      dedupeKey: `store_core_info_changed:${sid}:${String(patch.core_info_changed_at ?? "")}`,
      actorUserId: userId,
      push: true,
    })
      .then((r) => {
        if (!r.ok) console.error("[PATCH /api/me/stores/storeId] core_info admin notify", r.error);
      })
      .catch((e: unknown) => console.error("[PATCH /api/me/stores/storeId] core_info admin notify", e));
  }

  // OPS-02 — 다른 서버리스 인스턴스의 매장 공개 캐시도 무효화 (관리자 DEF-64 와 같은 세대 bump).
  bumpStorePublicSharedCacheGeneration("owner_store.profile");

  const slugRaw = (updated as unknown as { slug?: string }).slug;
  afterCanonicalStoreLocationWrite({
    sb,
    storeId: sid,
    patch: withoutUnchangedStoreCoords(patch, currentCoords),
    slug: slugRaw,
    ownerUserId: userId,
  });

  if (storeCoordsChanged) {
    const store_orders_checkout_geo_sync = await refreshStoreOrdersCheckoutGeoAfterStoreLocationChanged(
      sb as never,
      sid
    );
    return NextResponse.json({ ok: true, store: updated, store_orders_checkout_geo_sync });
  }

  return NextResponse.json({ ok: true, store: updated });
}
