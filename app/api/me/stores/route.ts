import { NextRequest, NextResponse } from "next/server";
import { getRouteUserId } from "@/lib/auth/get-route-user-id";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";
import { loadMeStoresListForUser } from "@/lib/me/load-me-stores-for-user";
import { makeStoreSlug } from "@/lib/stores/make-store-slug";
import { isMissingStoresApplicantNicknameColumnError } from "@/lib/stores/stores-applicant-nickname-db";
import { normalizeOptionalPhMobileDb } from "@/lib/utils/ph-mobile";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 심사·운영 중 매장 — 동일 계정 2건 신청 방지·전화번호 중복 방지에 공통 사용 */
const STORE_ACTIVE_PIPELINE_STATUSES = [
  "pending",
  "under_review",
  "revision_requested",
  "approved",
  "suspended",
] as const;

/** 내 매장 목록 */
export async function GET() {
  const userId = await getRouteUserId();
  if (!userId) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const supabase = tryGetSupabaseForStores();
  if (!supabase) {
    return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  }

  const result = await loadMeStoresListForUser(supabase, userId);
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    stores: result.stores,
  });
}

type ApplyBody = {
  /** 신청자 닉네임 — 프로필과 별도로 수정 가능 */
  applicantNickname?: string;
  shopName?: string;
  description?: string;
  phone?: string;
  kakaoId?: string;
  region?: string;
  city?: string;
  addressStreetLine?: string;
  addressDetail?: string;
  /** @deprecated — street 로만 매핑 */
  addressLabel?: string;
  /** `/stores`·어드민 업종과 동일 슬러그 */
  categoryPrimarySlug?: string;
  categorySubSlug?: string;
  /** DB에 taxonomy 행이 없을 때 표시용 (클라 병합 목록 기준) */
  categoryLabelLine?: string;
};

/** 매장 등록 신청 (1건 제한: 진행중·승인 매장이 있으면 409) */
export async function POST(req: NextRequest) {
  const userId = await getRouteUserId();
  if (!userId) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const supabase = tryGetSupabaseForStores();
  if (!supabase) {
    return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  }

  let body: ApplyBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const applicantNickname = String(body.applicantNickname ?? "").trim();
  if (!applicantNickname || applicantNickname.length > 20) {
    return NextResponse.json(
      { ok: false, error: "applicant_nickname_required" },
      { status: 400 }
    );
  }

  const shopName = String(body.shopName ?? "").trim();
  if (shopName.length < 2) {
    return NextResponse.json({ ok: false, error: "shopName_required" }, { status: 400 });
  }

  const { data: blockers, error: blockErr } = await supabase
    .from("stores")
    .select("id")
    .eq("owner_user_id", userId)
    .in("approval_status", [...STORE_ACTIVE_PIPELINE_STATUSES])
    .limit(1);

  if (blockErr) {
    console.error("[POST /api/me/stores] block check", blockErr);
    return NextResponse.json({ ok: false, error: blockErr.message }, { status: 500 });
  }
  if (blockers && blockers.length > 0) {
    return NextResponse.json(
      { ok: false, error: "already_has_active_application" },
      { status: 409 }
    );
  }

  const description = String(body.description ?? "").trim() || null;
  const kakaoId = String(body.kakaoId ?? "").trim() || null;

  const primarySlug = String(body.categoryPrimarySlug ?? "").trim().toLowerCase();
  const subSlug = String(body.categorySubSlug ?? "").trim().toLowerCase();
  if (!primarySlug || !subSlug) {
    return NextResponse.json(
      { ok: false, error: "category_slugs_required" },
      { status: 400 }
    );
  }

  let store_category_id: string | null = null;
  let store_topic_id: string | null = null;
  let taxonomyBusinessType: string | null = null;

  const { data: catRow, error: catErr } = await supabase
    .from("store_categories")
    .select("id, name, slug")
    .eq("slug", primarySlug)
    .eq("is_active", true)
    .maybeSingle();

  if (catErr) {
    console.error("[POST /api/me/stores] category lookup", catErr);
  } else if (catRow?.id) {
    const { data: topicRow, error: topicErr } = await supabase
      .from("store_topics")
      .select("id, name, slug")
      .eq("slug", subSlug)
      .eq("store_category_id", catRow.id)
      .eq("is_active", true)
      .maybeSingle();

    if (topicErr) {
      console.error("[POST /api/me/stores] topic lookup", topicErr);
    } else if (topicRow?.id) {
      store_category_id = catRow.id as string;
      store_topic_id = topicRow.id as string;
      taxonomyBusinessType = `${String(catRow.name)} · ${String(topicRow.name)}`;
    }
  }

  const labelFallback = String(body.categoryLabelLine ?? "").trim();
  const business_type =
    taxonomyBusinessType ||
    labelFallback ||
    `${primarySlug} · ${subSlug}`;

  const phoneNorm = normalizeOptionalPhMobileDb(String(body.phone ?? "").trim());
  if (!phoneNorm.ok) {
    return NextResponse.json({ ok: false, error: phoneNorm.error }, { status: 400 });
  }

  if (phoneNorm.value) {
    const { data: phoneDup, error: phoneDupErr } = await supabase
      .from("stores")
      .select("id")
      .eq("phone", phoneNorm.value)
      .in("approval_status", [...STORE_ACTIVE_PIPELINE_STATUSES])
      .limit(1);

    if (phoneDupErr) {
      console.error("[POST /api/me/stores] phone duplicate check", phoneDupErr);
      return NextResponse.json({ ok: false, error: phoneDupErr.message }, { status: 500 });
    }
    if (phoneDup && phoneDup.length > 0) {
      return NextResponse.json(
        { ok: false, error: "store_phone_already_registered" },
        { status: 409 }
      );
    }
  }

  const streetRaw = String(body.addressStreetLine ?? body.addressLabel ?? "").trim();
  const detailRaw = String(body.addressDetail ?? "").trim();
  const street = streetRaw || null;
  const detail = detailRaw || null;

  /** business_hours_json 은 DB 기본 `{}` — 승인 후 매장 설정에서 영업·공지 등과 동일 스키마로 채움 */
  let insertPayload: Record<string, unknown> = {
    owner_user_id: userId,
    applicant_nickname: applicantNickname,
    store_name: shopName,
    business_type,
    store_category_id,
    store_topic_id,
    description,
    kakao_id: kakaoId,
    phone: phoneNorm.value,
    region: String(body.region ?? "").trim() || null,
    city: String(body.city ?? "").trim() || null,
    /** 피드·정렬 보조 — 주소 한 줄과 동기 */
    district: street,
    address_line1: street,
    address_line2: detail,
    approval_status: "pending",
    is_visible: false,
  };

  const postInsertSelect =
    "id, owner_user_id, store_name, slug, business_type, description, kakao_id, phone, region, city, district, address_line1, address_line2, approval_status, rejected_reason, created_at, updated_at, approved_at, profile_image_url";

  let inserted: Record<string, unknown> | null = null;
  let insErr: { code?: string; message: string } | null = null;

  for (let attempt = 0; attempt < 3; attempt++) {
    const slug = makeStoreSlug(shopName);
    let result = await supabase
      .from("stores")
      .insert({ ...insertPayload, slug })
      .select(postInsertSelect)
      .maybeSingle();

    if (
      result.error &&
      isMissingStoresApplicantNicknameColumnError(result.error.message ?? "") &&
      "applicant_nickname" in insertPayload
    ) {
      const { applicant_nickname: _drop, ...rest } = insertPayload;
      insertPayload = rest;
      result = await supabase
        .from("stores")
        .insert({ ...insertPayload, slug })
        .select(postInsertSelect)
        .maybeSingle();
    }

    insErr = result.error;
    inserted = result.data as Record<string, unknown> | null;
    if (!insErr) break;
    if (insErr.code === "23503") {
      return NextResponse.json(
        { ok: false, error: "owner_not_in_auth_users" },
        { status: 400 }
      );
    }
    if (insErr.code !== "23505") {
      console.error("[POST /api/me/stores]", insErr);
      return NextResponse.json({ ok: false, error: insErr.message }, { status: 500 });
    }
  }

  if (insErr || !inserted) {
    return NextResponse.json({ ok: false, error: "slug_collision" }, { status: 409 });
  }

  return NextResponse.json({ ok: true, store: inserted });
}
