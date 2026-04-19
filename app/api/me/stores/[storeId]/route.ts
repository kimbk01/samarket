import { NextRequest, NextResponse } from "next/server";
import { getRouteUserId } from "@/lib/auth/get-route-user-id";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";
import { getStoreIfOwner } from "@/lib/stores/owner-product-gate";
import { normalizePhMobileDb, PH_LOCAL_MOBILE_RULE_MESSAGE_KO } from "@/lib/utils/ph-mobile";

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
  is_open?: boolean;
  delivery_available?: boolean;
  pickup_available?: boolean;
  reservation_available?: boolean;
  visit_available?: boolean;
  /** 공개 페이지 영업시간 (JSON 객체) */
  business_hours_json?: Record<string, unknown> | null;
  /** 공개 갤러리 이미지 URL 등 (JSON 배열) */
  gallery_images_json?: unknown[] | null;
  lat?: number | null;
  lng?: number | null;
};

function trimOrNull(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const t = String(v).trim();
  return t || null;
}

function parseLat(v: unknown): number | null | "invalid" {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).trim());
  if (!Number.isFinite(n)) return "invalid";
  if (n < -90 || n > 90) return "invalid";
  return n;
}

function parseLng(v: unknown): number | null | "invalid" {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).trim());
  if (!Number.isFinite(n)) return "invalid";
  if (n < -180 || n > 180) return "invalid";
  return n;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function parseUuidOrNull(v: unknown): "omit" | null | string | "invalid" {
  if (v === undefined) return "omit";
  if (v === null) return null;
  const s = String(v).trim();
  if (!s) return null;
  return UUID_RE.test(s) ? s : "invalid";
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
    .select("store_category_id, store_topic_id")
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

    const nextCat =
      body.store_category_id !== undefined
        ? parseUuidOrNull(body.store_category_id)
        : "omit";
    if (nextCat === "invalid") {
      return NextResponse.json({ ok: false, error: "invalid_store_category_id" }, { status: 400 });
    }
    const nextTopic =
      body.store_topic_id !== undefined ? parseUuidOrNull(body.store_topic_id) : "omit";
    if (nextTopic === "invalid") {
      return NextResponse.json({ ok: false, error: "invalid_store_topic_id" }, { status: 400 });
    }

    const effectiveCategoryId =
      nextCat === "omit" ? (currentRow.store_category_id as string | null) : nextCat;
    let effectiveTopicId =
      nextTopic === "omit" ? (currentRow.store_topic_id as string | null) : nextTopic;

    if (nextCat !== "omit" && nextTopic === "omit") {
      if (effectiveTopicId && effectiveCategoryId) {
        const { data: existingTopic } = await sb
          .from("store_topics")
          .select("store_category_id")
          .eq("id", effectiveTopicId)
          .maybeSingle();
        if (existingTopic && existingTopic.store_category_id !== effectiveCategoryId) {
          effectiveTopicId = null;
        }
      }
    }

    if (effectiveTopicId) {
      const { data: topicRow, error: topicErr } = await sb
        .from("store_topics")
        .select("store_category_id")
        .eq("id", effectiveTopicId)
        .maybeSingle();
      if (topicErr) {
        console.error("[PATCH /api/me/stores/storeId] topic check", topicErr);
        return NextResponse.json({ ok: false, error: topicErr.message }, { status: 500 });
      }
      if (!topicRow) {
        return NextResponse.json({ ok: false, error: "store_topic_not_found" }, { status: 400 });
      }
      if (
        effectiveCategoryId != null &&
        topicRow.store_category_id !== effectiveCategoryId
      ) {
        return NextResponse.json(
          { ok: false, error: "store_topic_category_mismatch" },
          { status: 400 }
        );
      }
    }

    if (nextCat !== "omit" && nextCat === null) {
      patch.store_category_id = null;
      patch.store_topic_id = null;
    } else {
      if (nextCat !== "omit") patch.store_category_id = nextCat;
      if (nextTopic !== "omit") {
        patch.store_topic_id = nextTopic;
      } else if (nextCat !== "omit" && !effectiveTopicId && currentRow.store_topic_id) {
        patch.store_topic_id = null;
      }
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

  if (body.region !== undefined) patch.region = trimOrNull(body.region);
  if (body.city !== undefined) patch.city = trimOrNull(body.city);
  if (body.district !== undefined) patch.district = trimOrNull(body.district);
  if (body.address_line1 !== undefined) patch.address_line1 = trimOrNull(body.address_line1);
  if (body.address_line2 !== undefined) patch.address_line2 = trimOrNull(body.address_line2);
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
  if (body.is_open !== undefined) {
    patch.is_open = Boolean(body.is_open);
  }
  if (body.delivery_available !== undefined) {
    patch.delivery_available = Boolean(body.delivery_available);
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
      patch.business_hours_json = body.business_hours_json;
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

  if (body.lat !== undefined) {
    const la = parseLat(body.lat);
    if (la === "invalid") {
      return NextResponse.json({ ok: false, error: "invalid_lat" }, { status: 400 });
    }
    patch.lat = la;
  }
  if (body.lng !== undefined) {
    const ln = parseLng(body.lng);
    if (ln === "invalid") {
      return NextResponse.json({ ok: false, error: "invalid_lng" }, { status: 400 });
    }
    patch.lng = ln;
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

  const { data: updated, error: upErr } = await sb
    .from("stores")
    .update(patch)
    .eq("id", sid)
    .select(
      [
        "id, owner_user_id, store_name, slug, business_type, owner_can_edit_store_identity",
        "store_category_id, store_topic_id",
        "description, kakao_id, phone, email, website_url",
        "region, city, district, address_line1, address_line2, lat, lng",
        "profile_image_url, business_hours_json, gallery_images_json, is_open",
        "delivery_available, pickup_available, reservation_available, visit_available",
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

  return NextResponse.json({ ok: true, store: updated });
}
