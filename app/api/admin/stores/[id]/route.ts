import { NextRequest, NextResponse } from "next/server";
import { isRouteAdmin } from "@/lib/auth/is-route-admin";
import { getRouteUserId } from "@/lib/auth/get-route-user-id";
import { appendAuditLog } from "@/lib/audit/append-audit-log";
import { getAuditRequestMeta } from "@/lib/audit/request-meta";
import { isAdminStorePatchAction } from "@/lib/admin-business/admin-store-patch-commands";
import { buildStoreTaxonomyPatch } from "@/lib/stores/build-store-taxonomy-patch";
import { loadBusinessControlCenterDetail } from "@/lib/admin-business/load-business-control-center-detail";
import { sanitizeBusinessHoursJsonForPersistence } from "@/lib/stores/serialize-store-business-hours-json";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";
import { normalizePhMobileDb } from "@/lib/utils/ph-mobile";
import { clearStoreHomeFeedServerCache } from "@/lib/stores/store-home-feed-server-cache";
import { invalidateStorePublicCachesForSlugOnServer } from "@/lib/stores/store-public-cache-invalidate-server";
import {
  buildStoreLocationPatchFields,
  storeLocationPatchTouchesCoords,
} from "@/lib/stores/build-store-location-patch";
import { refreshStoreOrdersCheckoutGeoAfterStoreLocationChanged } from "@/lib/stores/sync-store-orders-checkout-geo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type PatchBody = {
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
};

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  if (!(await isRouteAdmin())) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const { id: storeId } = await context.params;
  const id = typeof storeId === "string" ? storeId.trim() : "";
  if (!id) return NextResponse.json({ ok: false, error: "missing_id" }, { status: 400 });

  const sb = tryGetSupabaseForStores();
  if (!sb) return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });

  const detail = await loadBusinessControlCenterDetail(sb, id);
  if (!detail.ok) {
    if (detail.error === "store_not_found") {
      return NextResponse.json({ ok: false, error: "store_not_found" }, { status: 404 });
    }
    return NextResponse.json(
      { ok: false, error: detail.message ?? "load_failed" },
      { status: 500 }
    );
  }

  const ownerNickname = detail.owner.displayLabel;
  return NextResponse.json({
    ok: true,
    store: {
      ...detail.store,
      applicant_nickname:
        String(detail.store.applicant_nickname ?? "").trim() || ownerNickname,
      owner_username: detail.owner.username,
      owner_handle: detail.owner.handle,
      sales_permission: detail.salesPermission,
    },
    ownerNickname,
    owner: detail.owner,
    salesPermission: detail.salesPermission,
    stats: detail.stats,
    kpi: detail.kpi,
    fee: detail.fee,
    delivery: detail.delivery,
    ops: detail.ops,
    logs: detail.logs,
  });
}

/**
 * Admin store command PATCH — action-gated; not a free-form row update.
 * Fee override / distance override live on separate SSOT APIs (see admin-store-patch-commands).
 */
export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  if (!(await isRouteAdmin())) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const { id: storeId } = await context.params;
  const id = typeof storeId === "string" ? storeId.trim() : "";
  if (!id) {
    return NextResponse.json({ ok: false, error: "missing_id" }, { status: 400 });
  }

  let body: PatchBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const action = String(body.action ?? "").trim();
  if (!isAdminStorePatchAction(action)) {
    return NextResponse.json({ ok: false, error: "unknown_action" }, { status: 400 });
  }
  const reason = String(body.reason ?? body.note ?? "").trim() || null;

  const sb = tryGetSupabaseForStores();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  }

  const { data: store, error: findErr } = await sb
    .from("stores")
    .select(
      "id, approval_status, is_visible, store_name, slug, store_category_id, store_topic_id, phone, description, email, admin_internal_memo, delivery_available, pickup_available, is_open, business_hours_json, owner_can_edit_store_identity, region, city, district, address_line1, address_line2, place_id, formatted_address, detail_address, lat, lng"
    )
    .eq("id", id)
    .maybeSingle();

  if (findErr || !store) {
    return NextResponse.json({ ok: false, error: "store_not_found" }, { status: 404 });
  }

  const actorId = await getRouteUserId();
  const rm = getAuditRequestMeta(req);

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
    return NextResponse.json({ ok: true });
  };

  if (
    action === "approve_store" ||
    action === "start_review" ||
    action === "mark_under_review" ||
    action === "reject_store" ||
    action === "request_revision" ||
    action === "suspend_store" ||
    action === "resume_store"
  ) {
    const before = {
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
    } else if (action === "suspend_store") {
      patch = {
        approval_status: "suspended",
        is_visible: false,
        suspended_reason: reason,
      };
    } else if (action === "resume_store") {
      patch = {
        approval_status: "approved",
        suspended_reason: null,
      };
    }

    const { error: upErr } = await sb.from("stores").update(patch).eq("id", id);
    if (upErr) {
      console.error("[admin/stores PATCH store]", upErr);
      return NextResponse.json({ ok: false, error: upErr.message }, { status: 500 });
    }
    return auditOk(before, patch);
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
      return NextResponse.json({ ok: false, error: idErr.message }, { status: 500 });
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
    const before = { is_visible: store.is_visible };
    const { error: visErr } = await sb.from("stores").update({ is_visible: visible }).eq("id", id);
    if (visErr) {
      console.error("[admin/stores PATCH is_visible]", visErr);
      return NextResponse.json({ ok: false, error: visErr.message }, { status: 500 });
    }
    return auditOk(before, { is_visible: visible });
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
      return NextResponse.json({ ok: false, error: memoErr.message }, { status: 500 });
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
      return NextResponse.json({ ok: false, error: upErr.message }, { status: 500 });
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
      return NextResponse.json({ ok: false, error: upErr.message }, { status: 500 });
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
      return NextResponse.json({ ok: false, error: upErr.message }, { status: 500 });
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
      return NextResponse.json({ ok: false, error: upErr.message }, { status: 500 });
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
    if (slug) {
      try {
        clearStoreHomeFeedServerCache();
        invalidateStorePublicCachesForSlugOnServer(slug);
      } catch {
        /* best-effort */
      }
    }
    return NextResponse.json({
      ok: true,
      ...(store_orders_checkout_geo_sync !== undefined
        ? { store_orders_checkout_geo_sync }
        : {}),
    });
  }

  if (action === "set_business_hours") {
    const before = { business_hours_json: store.business_hours_json };
    let nextHours: unknown = null;
    if (body.business_hours_json === null) {
      nextHours = null;
    } else if (
      typeof body.business_hours_json === "object" &&
      body.business_hours_json !== null &&
      !Array.isArray(body.business_hours_json)
    ) {
      nextHours = sanitizeBusinessHoursJsonForPersistence(body.business_hours_json);
    } else {
      return NextResponse.json({ ok: false, error: "invalid_business_hours_json" }, { status: 400 });
    }
    const { error: upErr } = await sb
      .from("stores")
      .update({ business_hours_json: nextHours })
      .eq("id", id);
    if (upErr) {
      console.error("[admin/stores PATCH hours]", upErr);
      return NextResponse.json({ ok: false, error: upErr.message }, { status: 500 });
    }
    return auditOk(before, { business_hours_json: nextHours });
  }

  if (action === "set_delivery_flags") {
    const patch: Record<string, unknown> = {};
    const before: Record<string, unknown> = {};
    if (typeof body.delivery_available === "boolean") {
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
      return NextResponse.json({ ok: false, error: upErr.message }, { status: 500 });
    }
    return auditOk(before, patch);
  }

  if (action === "approve_sales" || action === "reject_sales" || action === "suspend_sales") {
    if (store.approval_status !== "approved") {
      return NextResponse.json(
        { ok: false, error: "store_not_approved_for_sales" },
        { status: 400 }
      );
    }

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
      return NextResponse.json({ ok: false, error: pErr.message }, { status: 500 });
    }
    return auditOk({ sales: "previous" }, permPatch);
  }

  return NextResponse.json({ ok: false, error: "unknown_action" }, { status: 400 });
}
