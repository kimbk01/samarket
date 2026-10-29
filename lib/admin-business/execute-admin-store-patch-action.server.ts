/**
 * 관리자 매장 PATCH action 실행 (단건 PATCH `/api/admin/stores/[id]` · 일괄 `/api/admin/stores/bulk` 공용).
 * 라우트 본문을 그대로 옮긴 것 — 권한(`requireAdminPermission("business")`)·본문 파싱은 호출부 책임.
 * 3-C S-13: 샘플 매장 판매 승인 시 DB 트리거 예외(`sample_store_cannot_sell`)는 409 + 사유.
 */
import { NextResponse } from "next/server";
import { checkStoreDeliveryMenuBeforeExpose } from "@/lib/stores/delivery-menus/store-delivery-menu-guard.server";
import { appendAuditLog } from "@/lib/audit/append-audit-log";
import {
  ADMIN_STORE_ACTIONS_REQUIRING_REASON,
  ADMIN_STORE_REASON_MIN_LENGTH,
  isAdminStoreTransitionAllowed,
  safeNotifyOwnerStoreDecision,
  type AdminStoreApprovalAction,
} from "@/lib/admin-business/admin-store-decision";
import { ADMIN_REASON_REQUIRED_CODE } from "@/lib/admin/operator-ux/admin-reason";
import { isAdminStorePatchAction } from "@/lib/admin-business/admin-store-patch-commands";
import { buildStoreTaxonomyPatch } from "@/lib/stores/build-store-taxonomy-patch";
import { normalizeStoreBusinessHoursJsonForWrite } from "@/lib/stores/owner-store-patch-fields";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";
import { normalizePhMobileDb } from "@/lib/utils/ph-mobile";
import { refreshStoreOrdersCheckoutGeoAfterStoreLocationChanged } from "@/lib/stores/sync-store-orders-checkout-geo";
import {
  buildStoreLocationPatchFields,
  storeLocationPatchTouchesCoords,
} from "@/lib/stores/build-store-location-patch";
import { afterCanonicalStoreLocationWrite } from "@/lib/stores/after-canonical-store-location-write";
import { invalidateDiscoveryAfterStoreWrite } from "@/lib/stores/discovery/invalidate-discovery-after-store-write";
import { clearStoreHomeFeedServerCache } from "@/lib/stores/store-home-feed-server-cache";
import { invalidateStorePublicCachesForSlugOnServer } from "@/lib/stores/store-public-cache-invalidate-server";
import { bumpStorePublicSharedCacheGeneration } from "@/lib/stores/store-public-shared-cache-generation";
import {
  STORE_CORE_INFO_REVIEW_NONE,
  STORE_CORE_INFO_REVIEW_PENDING,
} from "@/lib/stores/store-core-info-reverification";
import { invalidateMeStoresListServerCache } from "@/lib/me/load-me-stores-for-user";
import { buildStoreVisibilityWritePatch } from "@/lib/stores/store-first-listed-at";
import {
  buildAdminStoreVisibilityLockPatch,
  isStoreAdminVisibilityLockColumnMissingError,
} from "@/lib/stores/store-admin-visibility-lock";
import { parseAdminStoreFeaturedPatch } from "@/lib/admin-business/admin-store-featured";
import { parseStoreDeliveryRadiusKmForWrite } from "@/lib/delivery/store-delivery-radius";
import {
  currentStoreDistanceMode,
  isStoreDistanceMode,
  mergeStoreDistanceOverride,
} from "@/lib/admin-business/admin-store-distance-override";
import {
  DELIVERY_OPS_SETTING_KEYS,
  invalidateDeliveryDistanceSettingsCache,
} from "@/lib/delivery/delivery-ops-settings";
import { invalidateDiscoveryGlobalDistancePolicy } from "@/lib/stores/discovery/invalidate-discovery-store-projections";
import {
  STORE_DELIVERY_REQUIRES_CANONICAL_GEO_ERROR,
  isStoreDeliveryGeoGuardViolation,
  storeHasCanonicalDeliveryOrigin,
} from "@/lib/stores/store-canonical-delivery-origin";

export type AdminStorePatchBody = {
  action?: string;
  reason?: string;
  note?: string;
  memo?: string;
  enabled?: boolean;
  store_name?: string;
  store_category_id?: string | null;
  store_topic_id?: string | null;
  phone?: string | null;
  description?: string | null;
  email?: string | null;
  region?: string | null;
  city?: string | null;
  district?: string | null;
  address_line1?: string | null;
  address_line2?: string | null;
  place_id?: string | null;
  formatted_address?: string | null;
  detail_address?: string | null;
  lat?: number | null;
  lng?: number | null;
  business_hours_json?: Record<string, unknown> | null;
  delivery_available?: boolean;
  pickup_available?: boolean;
  is_open?: boolean;
  delivery_radius_km?: number | null;
  /** set_store_delivery_distance — 매장 거리 정책 모드 */
  distance_mode?: string;
  /** set_store_delivery_distance — 화면이 불러온 모드 (다르면 409 status_changed → 재조회) */
  expected_distance_mode?: string | null;
  /** confirm_core_info_reverified — 화면이 본 변경 시각 (다르면 409 status_changed → 재조회) */
  expected_core_info_changed_at?: string | null;
  /** set_store_featured — 추천 기간 (ISO · null = 제한 없음). `enabled` 와 함께 보낸다. */
  featured_start_at?: string | null;
  featured_end_at?: string | null;
};

/** DB 트리거 `store_sales_permissions_block_sample_approval` 예외 메시지 = 응답 오류 코드. */
export const SAMPLE_STORE_CANNOT_SELL_ERROR = "sample_store_cannot_sell" as const;

export function isSampleStoreCannotSellError(err: { message?: unknown } | null | undefined): boolean {
  return String(err?.message ?? "").includes(SAMPLE_STORE_CANNOT_SELL_ERROR);
}

export type AdminStoreRequestMeta = { ip: string | null; userAgent: string | null };

export async function executeAdminStorePatchAction(input: {
  id: string;
  body: AdminStorePatchBody;
  actorId: string;
  requestMeta: AdminStoreRequestMeta;
}): Promise<NextResponse> {
  const { id, body, actorId } = input;
  const rm = input.requestMeta;
  const action = String(body.action ?? "").trim();
  if (!isAdminStorePatchAction(action)) {
    return NextResponse.json({ ok: false, error: "unknown_action" }, { status: 400 });
  }
  const reason = String(body.reason ?? body.note ?? "").trim() || null;
  // R2 — 입점·판매 승인(approve L2)·노출 켜기(exposeStart L2)도 확인창 사유를 받아 감사(after.reason)에 남긴다.
  const reasonRequired =
    ADMIN_STORE_ACTIONS_REQUIRING_REASON.has(action) ||
    action === "approve_store" ||
    action === "approve_sales" ||
    (action === "set_store_visible" && body.enabled === true);
  if (reasonRequired && (reason ?? "").length < ADMIN_STORE_REASON_MIN_LENGTH) {
    return NextResponse.json({ ok: false, error: ADMIN_REASON_REQUIRED_CODE }, { status: 400 });
  }

  const sb = tryGetSupabaseForStores();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  }

  const { data: store, error: findErr } = await sb
    .from("stores")
    .select(
      "id, owner_user_id, approval_status, rejected_reason, is_visible, first_listed_at, store_name, slug, store_category_id, store_topic_id, phone, description, email, admin_internal_memo, delivery_available, delivery_radius_km, pickup_available, is_open, business_hours_json, owner_can_edit_store_identity, region, city, district, address_line1, address_line2, place_id, formatted_address, detail_address, lat, lng"
    )
    .eq("id", id)
    .maybeSingle();

  if (findErr || !store) {
    return NextResponse.json({ ok: false, error: "store_not_found" }, { status: 404 });
  }


  const auditOk = async (
    before: Record<string, unknown> | null,
    after: Record<string, unknown>
  ) => {
    await appendAuditLog(sb, {
      actor_type: "admin",
      actor_id: actorId,
      target_type: "store",
      target_id: id,
      action: `store.${action}`,
      before_json: before,
      after_json: { action, reason, ...after },
      ip: rm.ip,
      user_agent: rm.userAgent,
    });
    const slug = typeof store.slug === "string" ? store.slug.trim() : "";
    if (slug) {
      try {
        clearStoreHomeFeedServerCache();
        invalidateStorePublicCachesForSlugOnServer(slug);
      } catch {
        /* best-effort */
      }
    }
    // DEF-64 — 다른 서버리스 인스턴스의 매장 공개 캐시도 무효화 (Next cache tag 세대).
    bumpStorePublicSharedCacheGeneration(`admin_store.${action}`);
    return NextResponse.json({ ok: true });
  };

  if (
    action === "approve_store" ||
    action === "start_review" ||
    action === "mark_under_review" ||
    action === "reject_store" ||
    action === "request_revision" ||
    action === "suspend_store" ||
    action === "resume_store" ||
    action === "reopen_application"
  ) {
    if (!isAdminStoreTransitionAllowed(action as AdminStoreApprovalAction, store.approval_status)) {
      return NextResponse.json(
        { ok: false, error: "invalid_store_transition", current: store.approval_status },
        { status: 409 }
      );
    }
    const before: Record<string, unknown> = {
      approval_status: store.approval_status,
      is_visible: store.is_visible,
    };
    let patch: Record<string, unknown> = {};
    if (action === "start_review" || action === "mark_under_review") {
      patch = { approval_status: "under_review" };
    } else if (action === "approve_store") {
      patch = {
        approval_status: "approved",
        is_visible: false,
        approved_at: new Date().toISOString(),
        rejected_reason: null,
        revision_note: null,
        suspended_reason: null,
      };
    } else if (action === "reject_store") {
      patch = {
        approval_status: "rejected",
        is_visible: false,
        rejected_reason: reason,
        revision_note: null,
      };
    } else if (action === "request_revision") {
      patch = {
        approval_status: "revision_requested",
        revision_note: reason,
      };
    } else if (action === "reopen_application") {
      // ACC-04 — 같은 stores 행으로 재심사: 사장님이 보완 화면에서 고쳐 재제출(revision_requested → pending).
      before.rejected_reason = (store as { rejected_reason?: string | null }).rejected_reason ?? null;
      patch = {
        approval_status: "revision_requested",
        revision_note: reason,
        rejected_reason: null,
      };
    } else if (action === "suspend_store") {
      patch = {
        approval_status: "suspended",
        is_visible: false,
        suspended_reason: reason,
      };
    } else if (action === "resume_store") {
      // 「운영 재개(노출 복구)」 — 중지 시 내린 노출을 함께 복구한다 (DEF-12).
      patch = {
        approval_status: "approved",
        suspended_reason: null,
        ...buildStoreVisibilityWritePatch(true),
        // O-04 — 관리자 노출 켜기 = 오너 재노출 잠금 해제.
        ...buildAdminStoreVisibilityLockPatch(true, actorId),
      };
    }

    /** 안전장치 S3 — 운영 재개는 노출을 함께 켜므로 메뉴 확인 (지정 메뉴 또는 업종 기본 메뉴 필수) */
    if (action === "resume_store") {
      const menuCheck = await checkStoreDeliveryMenuBeforeExpose(sb, {
        id,
        store_category_id: (store as { store_category_id?: string | null }).store_category_id ?? null,
        store_topic_id: (store as { store_topic_id?: string | null }).store_topic_id ?? null,
      });
      if (!menuCheck.ok) return NextResponse.json({ ok: false, error: menuCheck.error }, { status: 409 });
    }

    // 상태 조건부 업데이트 — 동시 처리 시 다른 관리자의 결정을 덮어쓰지 않는다.
    const runTransitionUpdate = (rowPatch: Record<string, unknown>) =>
      sb
        .from("stores")
        .update(rowPatch)
        .eq("id", id)
        .eq("approval_status", String(store.approval_status ?? ""))
        .select("id");
    let { data: updatedRows, error: upErr } = await runTransitionUpdate(patch);
    if (upErr && isStoreAdminVisibilityLockColumnMissingError(upErr.message)) {
      // 배포 순서 보호 (O-04): 잠금 컬럼 마이그레이션 적용 전이면 잠금 필드 없이 저장.
      console.error("[admin/stores PATCH store] admin_visibility_locked column missing", upErr.message);
      delete patch.admin_visibility_locked;
      delete patch.admin_visibility_locked_at;
      delete patch.admin_visibility_locked_by;
      ({ data: updatedRows, error: upErr } = await runTransitionUpdate(patch));
    }
    if (upErr) {
      console.error("[admin/stores PATCH store]", upErr);
      return NextResponse.json({ ok: false, error: "update_failed" }, { status: 500 });
    }
    if (!updatedRows || updatedRows.length === 0) {
      return NextResponse.json({ ok: false, error: "status_changed" }, { status: 409 });
    }
    const ownerUserId = String((store as { owner_user_id?: unknown }).owner_user_id ?? "").trim();
    if (ownerUserId) {
      invalidateMeStoresListServerCache(ownerUserId);
    }
    await safeNotifyOwnerStoreDecision(sb, {
      action,
      storeId: id,
      ownerUserId,
      storeName: store.store_name as string | null,
      reason,
      adminActorId: actorId,
    });
    return auditOk(before, patch);
  }

  if (action === "confirm_core_info_reverified") {
    // ND-2 — 재검증 완료: 표시가 남아 있고(관리자가 본 변경 시각과 같을 때만) 해제. 동시 변경은 409.
    const expected = String(body.expected_core_info_changed_at ?? "").trim();
    let q = sb
      .from("stores")
      .update({
        core_info_review_status: STORE_CORE_INFO_REVIEW_NONE,
        core_info_verified_at: new Date().toISOString(),
        core_info_verified_by: actorId,
      })
      .eq("id", id)
      .eq("core_info_review_status", STORE_CORE_INFO_REVIEW_PENDING);
    if (expected) q = q.eq("core_info_changed_at", expected);
    const { data: cleared, error: clrErr } = await q.select("id, core_info_changed_at, core_info_changed_fields");
    if (clrErr) {
      console.error("[admin/stores PATCH core_info reverified]", clrErr);
      if (/core_info_/i.test(clrErr.message) && /does not exist|schema cache/i.test(clrErr.message)) {
        return NextResponse.json({ ok: false, error: "migration_required" }, { status: 503 });
      }
      return NextResponse.json({ ok: false, error: "update_failed" }, { status: 500 });
    }
    if (!cleared || cleared.length === 0) {
      return NextResponse.json({ ok: false, error: "status_changed" }, { status: 409 });
    }
    const row = cleared[0] as { core_info_changed_at?: string | null; core_info_changed_fields?: unknown };
    return auditOk(
      {
        core_info_review_status: STORE_CORE_INFO_REVIEW_PENDING,
        core_info_changed_at: row.core_info_changed_at ?? null,
        core_info_changed_fields: row.core_info_changed_fields ?? null,
        region: store.region,
        city: store.city,
        district: store.district,
        address_line1: store.address_line1,
        address_line2: store.address_line2,
        lat: store.lat,
        lng: store.lng,
      },
      { core_info_review_status: STORE_CORE_INFO_REVIEW_NONE }
    );
  }

  if (action === "set_owner_identity_editable") {
    const enabled = Boolean(body.enabled);
    const before = {
      owner_can_edit_store_identity: (store as Record<string, unknown>)
        .owner_can_edit_store_identity,
    };
    const { error: idErr } = await sb
      .from("stores")
      .update({ owner_can_edit_store_identity: enabled })
      .eq("id", id);
    if (idErr) {
      console.error("[admin/stores PATCH identity flag]", idErr);
      return NextResponse.json({ ok: false, error: "update_failed" }, { status: 500 });
    }
    return auditOk(before, { owner_can_edit_store_identity: enabled });
  }

  if (action === "set_store_visible") {
    if (store.approval_status !== "approved") {
      return NextResponse.json(
        { ok: false, error: "store_not_approved_for_visibility" },
        { status: 400 }
      );
    }
    const visible = Boolean(body.enabled);
    /** 안전장치 S3 — 노출 켜기 전 메뉴 확인 (지정 메뉴 또는 업종 기본 메뉴 필수) */
    if (visible && store.is_visible !== true) {
      const menuCheck = await checkStoreDeliveryMenuBeforeExpose(sb, {
        id,
        store_category_id: (store as { store_category_id?: string | null }).store_category_id ?? null,
        store_topic_id: (store as { store_topic_id?: string | null }).store_topic_id ?? null,
      });
      if (!menuCheck.ok) return NextResponse.json({ ok: false, error: menuCheck.error }, { status: 409 });
    }
    const before = {
      is_visible: store.is_visible,
      first_listed_at: (store as { first_listed_at?: string | null }).first_listed_at ?? null,
    };
    // Visibility intent only — first_listed_at stamp is DB trigger authority (P1-C1).
    // O-04 — 관리자 숨김 = 오너 재노출 잠금, 관리자 노출 켜기 = 잠금 해제 (같은 UPDATE).
    const visPatch = {
      ...buildStoreVisibilityWritePatch(visible),
      ...buildAdminStoreVisibilityLockPatch(visible, actorId),
    };
    let { error: visErr } = await sb.from("stores").update(visPatch).eq("id", id);
    if (visErr && isStoreAdminVisibilityLockColumnMissingError(visErr.message)) {
      // 배포 순서 보호: 잠금 컬럼 마이그레이션 적용 전이면 노출만 저장 (잠금 없음 — 기존 동작).
      console.error("[admin/stores PATCH is_visible] admin_visibility_locked column missing", visErr.message);
      ({ error: visErr } = await sb.from("stores").update(buildStoreVisibilityWritePatch(visible)).eq("id", id));
    }
    if (visErr) {
      console.error("[admin/stores PATCH is_visible]", visErr);
      return NextResponse.json({ ok: false, error: "update_failed" }, { status: 500 });
    }
    const visOwnerId = String((store as { owner_user_id?: unknown }).owner_user_id ?? "").trim();
    if (visOwnerId) invalidateMeStoresListServerCache(visOwnerId);
    return auditOk(before, visPatch);
  }

  if (action === "set_store_featured") {
    const parsed = parseAdminStoreFeaturedPatch(body);
    if (!parsed.ok) {
      return NextResponse.json({ ok: false, error: parsed.error }, { status: 400 });
    }
    const { data: featRow, error: featFindErr } = await sb
      .from("stores")
      .select("is_featured, featured_start_at, featured_end_at")
      .eq("id", id)
      .maybeSingle();
    if (featFindErr) {
      console.error("[admin/stores PATCH featured read]", featFindErr);
      return NextResponse.json({ ok: false, error: "update_failed" }, { status: 500 });
    }
    const before = {
      is_featured: (featRow as { is_featured?: unknown } | null)?.is_featured ?? null,
      featured_start_at: (featRow as { featured_start_at?: unknown } | null)?.featured_start_at ?? null,
      featured_end_at: (featRow as { featured_end_at?: unknown } | null)?.featured_end_at ?? null,
    };
    const { error: featErr } = await sb.from("stores").update(parsed.patch).eq("id", id);
    if (featErr) {
      console.error("[admin/stores PATCH featured]", featErr);
      return NextResponse.json({ ok: false, error: "update_failed" }, { status: 500 });
    }
    // 캐시 무효화(홈 피드·공개 매장·공유 세대)는 set_store_visible 과 같이 auditOk 가 처리한다.
    return auditOk(before, parsed.patch);
  }

  if (action === "set_admin_memo") {
    const memo = String(body.memo ?? body.note ?? "").trim().slice(0, 2000);
    const before = { admin_internal_memo: store.admin_internal_memo };
    const { error: memoErr } = await sb
      .from("stores")
      .update({ admin_internal_memo: memo })
      .eq("id", id);
    if (memoErr) {
      if (/admin_internal_memo|does not exist/i.test(memoErr.message)) {
        return NextResponse.json({ ok: false, error: "migration_required" }, { status: 503 });
      }
      return NextResponse.json({ ok: false, error: "update_failed" }, { status: 500 });
    }
    return auditOk(before, { admin_internal_memo: memo });
  }

  if (action === "set_store_name") {
    const name = String(body.store_name ?? "").trim();
    if (!name || name.length < 2) {
      return NextResponse.json({ ok: false, error: "store_name_required" }, { status: 400 });
    }
    const before = { store_name: store.store_name };
    const { error: upErr } = await sb.from("stores").update({ store_name: name }).eq("id", id);
    if (upErr) {
      console.error("[admin/stores PATCH store_name]", upErr);
      return NextResponse.json({ ok: false, error: "update_failed" }, { status: 500 });
    }
    return auditOk(before, { store_name: name });
  }

  if (action === "set_store_taxonomy") {
    const built = await buildStoreTaxonomyPatch(sb, {
      currentCategoryId:
        typeof store.store_category_id === "string" ? store.store_category_id : null,
      currentTopicId: typeof store.store_topic_id === "string" ? store.store_topic_id : null,
      store_category_id: body.store_category_id,
      store_topic_id: body.store_topic_id,
    });
    if (!built.ok) {
      return NextResponse.json({ ok: false, error: built.error }, { status: 400 });
    }
    const before = {
      store_category_id: store.store_category_id,
      store_topic_id: store.store_topic_id,
    };
    const { error: upErr } = await sb.from("stores").update(built.patch).eq("id", id);
    if (upErr) {
      console.error("[admin/stores PATCH taxonomy]", upErr);
      return NextResponse.json({ ok: false, error: "update_failed" }, { status: 500 });
    }
    return auditOk(before, built.patch);
  }

  if (action === "set_store_contact") {
    const patch: Record<string, unknown> = {};
    const before: Record<string, unknown> = {};
    if (body.phone !== undefined) {
      before.phone = store.phone;
      if (body.phone === null || String(body.phone).trim() === "") {
        patch.phone = null;
      } else {
        const norm = normalizePhMobileDb(String(body.phone));
        if (!norm) {
          return NextResponse.json({ ok: false, error: "invalid_phone" }, { status: 400 });
        }
        patch.phone = norm;
      }
    }
    if (body.description !== undefined) {
      before.description = store.description;
      patch.description =
        body.description === null
          ? null
          : String(body.description).trim().slice(0, 4000) || null;
    }
    if (body.email !== undefined) {
      // stores.email = GCash mobile number (Owner SSOT: normalizePhMobileDb)
      before.email = store.email;
      if (body.email === null || String(body.email).trim() === "") {
        patch.email = null;
      } else {
        const norm = normalizePhMobileDb(String(body.email));
        // Owner route stores null when digits are incomplete/invalid — same rule.
        patch.email = norm;
      }
    }
    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ ok: false, error: "contact_fields_required" }, { status: 400 });
    }
    const { error: upErr } = await sb.from("stores").update(patch).eq("id", id);
    if (upErr) {
      console.error("[admin/stores PATCH contact]", upErr);
      return NextResponse.json({ ok: false, error: "update_failed" }, { status: 500 });
    }
    return auditOk(before, patch);
  }

  if (action === "set_store_location") {
    const built = buildStoreLocationPatchFields(
      {
        region: store.region as string | null,
        city: store.city as string | null,
        district: store.district as string | null,
        address_line1: store.address_line1 as string | null,
        address_line2: store.address_line2 as string | null,
        place_id: store.place_id as string | null,
        formatted_address: store.formatted_address as string | null,
        lat: store.lat,
        lng: store.lng,
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
    if (!built.ok) {
      return NextResponse.json({ ok: false, error: built.error }, { status: 400 });
    }
    if (!built.touched) {
      return NextResponse.json({ ok: false, error: "location_fields_required" }, { status: 400 });
    }
    const before = {
      region: store.region,
      city: store.city,
      district: store.district,
      address_line1: store.address_line1,
      address_line2: store.address_line2,
      place_id: store.place_id,
      formatted_address: store.formatted_address,
      detail_address: (store as { detail_address?: string | null }).detail_address,
      lat: store.lat,
      lng: store.lng,
    };
    const { error: upErr } = await sb.from("stores").update(built.patch).eq("id", id);
    if (upErr) {
      console.error("[admin/stores PATCH location]", upErr);
      // LOC-005 — DB guard: delivery ON cannot lose stores.lat/lng (same code as API check).
      if (isStoreDeliveryGeoGuardViolation(upErr)) {
        return NextResponse.json(
          { ok: false, error: STORE_DELIVERY_REQUIRES_CANONICAL_GEO_ERROR },
          { status: 400 }
        );
      }
      return NextResponse.json({ ok: false, error: "update_failed" }, { status: 500 });
    }
    let store_orders_checkout_geo_sync: unknown;
    if (storeLocationPatchTouchesCoords(built.patch)) {
      store_orders_checkout_geo_sync = await refreshStoreOrdersCheckoutGeoAfterStoreLocationChanged(
        sb as never,
        id
      );
    }
    await appendAuditLog(sb, {
      actor_type: "admin",
      actor_id: actorId,
      target_type: "store",
      target_id: id,
      action: `store.${action}`,
      before_json: before,
      after_json: { action, reason, ...built.patch },
      ip: rm.ip,
      user_agent: rm.userAgent,
    });
    const slug = typeof store.slug === "string" ? store.slug.trim() : "";
    afterCanonicalStoreLocationWrite({
      sb,
      storeId: id,
      patch: built.patch,
      slug,
      ownerUserId: typeof store.owner_user_id === "string" ? store.owner_user_id : null,
    });
    bumpStorePublicSharedCacheGeneration(`admin_store.${action}`); // DEF-64
    return NextResponse.json({
      ok: true,
      ...(store_orders_checkout_geo_sync !== undefined
        ? { store_orders_checkout_geo_sync }
        : {}),
    });
  }

  if (action === "set_business_hours") {
    const before = { business_hours_json: store.business_hours_json };
    // OPS-09 — NOT NULL DEFAULT '{}': null(초기화) → {} (오너 PATCH 와 같은 정규화).
    const hours = normalizeStoreBusinessHoursJsonForWrite(body.business_hours_json);
    if (!hours.ok) {
      return NextResponse.json({ ok: false, error: hours.error }, { status: 400 });
    }
    const nextHours = hours.value;
    const { error: upErr } = await sb
      .from("stores")
      .update({ business_hours_json: nextHours })
      .eq("id", id);
    if (upErr) {
      console.error("[admin/stores PATCH hours]", upErr);
      return NextResponse.json({ ok: false, error: "update_failed" }, { status: 500 });
    }
    invalidateDiscoveryAfterStoreWrite(sb, id, { business_hours_json: nextHours });
    return auditOk(before, { business_hours_json: nextHours });
  }

  if (action === "set_delivery_flags") {
    const patch: Record<string, unknown> = {};
    const before: Record<string, unknown> = {};
    if (typeof body.delivery_available === "boolean") {
      if (
        body.delivery_available === true &&
        !storeHasCanonicalDeliveryOrigin(store.lat, store.lng)
      ) {
        return NextResponse.json(
          { ok: false, error: STORE_DELIVERY_REQUIRES_CANONICAL_GEO_ERROR },
          { status: 400 }
        );
      }
      before.delivery_available = store.delivery_available;
      patch.delivery_available = body.delivery_available;
    }
    if (typeof body.pickup_available === "boolean") {
      before.pickup_available = store.pickup_available;
      patch.pickup_available = body.pickup_available;
    }
    if (typeof body.is_open === "boolean") {
      before.is_open = store.is_open;
      patch.is_open = body.is_open;
    }
    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ ok: false, error: "delivery_flags_required" }, { status: 400 });
    }
    const { error: upErr } = await sb.from("stores").update(patch).eq("id", id);
    if (upErr) {
      console.error("[admin/stores PATCH delivery flags]", upErr);
      if (isStoreDeliveryGeoGuardViolation(upErr)) {
        return NextResponse.json(
          { ok: false, error: STORE_DELIVERY_REQUIRES_CANONICAL_GEO_ERROR },
          { status: 400 }
        );
      }
      return NextResponse.json({ ok: false, error: "update_failed" }, { status: 500 });
    }
    invalidateDiscoveryAfterStoreWrite(sb, id, patch);
    return auditOk(before, patch);
  }

  if (action === "set_delivery_radius") {
    const before: Record<string, unknown> = {
      delivery_radius_km: (store as { delivery_radius_km?: unknown }).delivery_radius_km ?? null,
    };
    let nextRadius: number | null;
    if (body.delivery_radius_km === null) {
      nextRadius = null;
    } else if (body.delivery_radius_km === undefined) {
      return NextResponse.json({ ok: false, error: "delivery_radius_km_required" }, { status: 400 });
    } else {
      const parsed = parseStoreDeliveryRadiusKmForWrite(body.delivery_radius_km);
      if (!parsed.ok) {
        return NextResponse.json({ ok: false, error: parsed.error }, { status: 400 });
      }
      nextRadius = parsed.value;
    }
    const patch = { delivery_radius_km: nextRadius };
    const { error: upErr } = await sb.from("stores").update(patch).eq("id", id);
    if (upErr) {
      console.error("[admin/stores PATCH delivery radius]", upErr);
      return NextResponse.json({ ok: false, error: "update_failed" }, { status: 500 });
    }
    // Owner R PATCH parity: discovery invalidation + HOME feed clear.
    invalidateDiscoveryAfterStoreWrite(sb, id, patch);
    clearStoreHomeFeedServerCache();
    const slug = typeof store.slug === "string" ? store.slug.trim() : "";
    if (slug) {
      try {
        invalidateStorePublicCachesForSlugOnServer(slug);
      } catch {
        /* best-effort */
      }
    }
    return auditOk(before, patch);
  }

  if (action === "set_store_delivery_distance") {
    const mode = String(body.distance_mode ?? "").trim();
    if (!isStoreDistanceMode(mode)) {
      return NextResponse.json({ ok: false, error: "invalid_distance_mode" }, { status: 400 });
    }
    let nextRadius: number | null;
    if (body.delivery_radius_km === null) {
      nextRadius = null;
    } else if (body.delivery_radius_km === undefined) {
      return NextResponse.json({ ok: false, error: "delivery_radius_km_required" }, { status: 400 });
    } else {
      const parsed = parseStoreDeliveryRadiusKmForWrite(body.delivery_radius_km);
      if (!parsed.ok) {
        return NextResponse.json({ ok: false, error: parsed.error }, { status: 400 });
      }
      nextRadius = parsed.value;
    }

    const settingsKey = DELIVERY_OPS_SETTING_KEYS.storeDistanceOverrides;
    const readOverrides = async () =>
      sb
        .from("admin_settings")
        .select("value_json, updated_at")
        .eq("key", settingsKey)
        .maybeSingle();
    const first = await readOverrides();
    if (first.error) {
      console.error("[admin/stores PATCH distance] read", first.error);
      return NextResponse.json({ ok: false, error: "update_failed" }, { status: 500 });
    }
    const prevMode = currentStoreDistanceMode(first.data?.value_json, id);
    const expected = String(body.expected_distance_mode ?? "").trim();
    if (expected && isStoreDistanceMode(expected) && expected !== prevMode) {
      // 다른 관리자가 먼저 바꿈 — 덮어쓰지 않고 재조회 안내.
      return NextResponse.json(
        { ok: false, error: "status_changed", current: prevMode },
        { status: 409 }
      );
    }
    const prevRadius = (store as { delivery_radius_km?: unknown }).delivery_radius_km ?? null;
    const before = { delivery_radius_km: prevRadius, distance_mode: prevMode };

    const prevRadiusNum = prevRadius == null ? null : Number(prevRadius);
    if (prevRadiusNum !== nextRadius) {
      const { error: radErr } = await sb
        .from("stores")
        .update({ delivery_radius_km: nextRadius })
        .eq("id", id);
      if (radErr) {
        console.error("[admin/stores PATCH distance] radius", radErr);
        return NextResponse.json({ ok: false, error: "update_failed" }, { status: 500 });
      }
      invalidateDiscoveryAfterStoreWrite(sb, id, { delivery_radius_km: nextRadius });
    }

    if (mode !== prevMode) {
      // 최신 JSON 위에 이 매장 항목만 병합 → updated_at 이 그대로일 때만 저장 (최대 3회 재시도).
      let snapshot = first.data as { value_json?: unknown; updated_at?: string | null } | null;
      let saved = false;
      for (let attempt = 0; attempt < 3 && !saved; attempt++) {
        if (attempt > 0) {
          const again = await readOverrides();
          if (again.error) break;
          snapshot = again.data as typeof snapshot;
        }
        const merged = mergeStoreDistanceOverride(snapshot?.value_json, id, mode);
        const nowIso = new Date().toISOString();
        if (snapshot) {
          let q = sb
            .from("admin_settings")
            .update({ value_json: merged, updated_at: nowIso })
            .eq("key", settingsKey);
          q = snapshot.updated_at ? q.eq("updated_at", snapshot.updated_at) : q.is("updated_at", null);
          const { data: rows, error: upErr } = await q.select("key");
          if (upErr) {
            console.error("[admin/stores PATCH distance] overrides", upErr);
            break;
          }
          saved = Array.isArray(rows) && rows.length > 0;
        } else {
          const { error: insErr } = await sb
            .from("admin_settings")
            .insert({ key: settingsKey, value_json: merged, updated_at: nowIso });
          if (!insErr) saved = true;
          else if (!/duplicate|unique/i.test(insErr.message)) {
            console.error("[admin/stores PATCH distance] overrides insert", insErr);
            break;
          }
        }
      }
      if (!saved) {
        return NextResponse.json({ ok: false, error: "status_changed" }, { status: 409 });
      }
      invalidateDeliveryDistanceSettingsCache();
      void invalidateDiscoveryGlobalDistancePolicy(sb);
    }
    clearStoreHomeFeedServerCache();
    return auditOk(before, { delivery_radius_km: nextRadius, distance_mode: mode });
  }

  if (action === "approve_sales" || action === "reject_sales" || action === "suspend_sales") {
    if (store.approval_status !== "approved") {
      return NextResponse.json(
        { ok: false, error: "store_not_approved_for_sales" },
        { status: 400 }
      );
    }

    const { data: prevPerm } = await sb
      .from("store_sales_permissions")
      .select("allowed_to_sell, sales_status, rejection_reason, suspension_reason")
      .eq("store_id", id)
      .maybeSingle();
    let permPatch: Record<string, unknown> = {};
    if (action === "approve_sales") {
      permPatch = {
        allowed_to_sell: true,
        sales_status: "approved",
        approved_at: new Date().toISOString(),
        rejection_reason: null,
        suspension_reason: null,
      };
    } else if (action === "reject_sales") {
      permPatch = {
        allowed_to_sell: false,
        sales_status: "rejected",
        rejection_reason: reason,
      };
    } else {
      permPatch = {
        allowed_to_sell: false,
        sales_status: "suspended",
        suspension_reason: reason,
      };
    }

    const { error: pErr } = await sb
      .from("store_sales_permissions")
      .upsert({ store_id: id, ...permPatch }, { onConflict: "store_id" });

    if (pErr) {
      console.error("[admin/stores PATCH sales]", pErr);
      // 3-C S-13 — 샘플 매장 판매 승인은 DB 트리거가 막는다 (20270707130000). 500 대신 409 + 사유.
      if (isSampleStoreCannotSellError(pErr)) {
        return NextResponse.json(
          { ok: false, error: SAMPLE_STORE_CANNOT_SELL_ERROR },
          { status: 409 }
        );
      }
      return NextResponse.json({ ok: false, error: "update_failed" }, { status: 500 });
    }
    await safeNotifyOwnerStoreDecision(sb, {
      action,
      storeId: id,
      ownerUserId: store.owner_user_id as string | null,
      storeName: store.store_name as string | null,
      reason,
      adminActorId: actorId,
    });
    return auditOk((prevPerm as Record<string, unknown> | null) ?? { sales: null }, permPatch);
  }

  return NextResponse.json({ ok: false, error: "unknown_action" }, { status: 400 });
}
