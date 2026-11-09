import { NextRequest, NextResponse } from "next/server";
import { getRouteUserId } from "@/lib/auth/get-route-user-id";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";
import { loadMeStoresListForUser, invalidateMeStoresListServerCache } from "@/lib/me/load-me-stores-for-user";
import {
  isMissingStoresApplicantNicknameColumnError,
  STORES_APPLICANT_NICKNAME_SAVE_FAILED_ERROR,
} from "@/lib/stores/stores-applicant-nickname-db";
import { formatAddressBookCardPresentation } from "@/lib/addresses/address-book-card-presentation";
import { getUserAddressDefaults } from "@/lib/addresses/user-address-service";
import { classifyStoresInsertUniqueViolation } from "@/lib/stores/classify-stores-insert-unique-violation";
import { internalErrorResponse } from "@/lib/security/internal-error-response";
import {
  makeStoreApplicationSlug,
  parseStoreApplicationInput,
  type StoreApplicationBody,
} from "@/lib/stores/store-application-input.server";
import {
  consumeStorePhoneVerification,
  isStorePhoneUsedByOtherStore,
  linkStorePhoneVerificationToStore,
  releaseStorePhoneVerification,
} from "@/lib/stores/store-phone-otp-service";
import { appendStoreApplicationEvent } from "@/lib/stores/store-application-events.server";
import { notifyAdminsStoreApplicationSubmitted } from "@/lib/stores/store-application-admin-notify.server";
import { loadDeliveryLaunchSettingsCached } from "@/lib/delivery/launch/delivery-launch-settings.server";
import {
  activeFreeUntilOrNull,
  checkStorePartnerAgreementInput,
  parseStorePartnerAgreementInput,
} from "@/lib/stores/partner/store-partner-agreement-contract";
import {
  loadCurrentStorePartnerTerms,
  recordStorePartnerAgreement,
  resolveStorePartnerFeeAfter,
} from "@/lib/stores/partner/store-partner-agreement.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
    const status = result.error.startsWith("supabase_") ? 503 : 500;
    return NextResponse.json({ ok: false, error: result.error }, { status });
  }

  return NextResponse.json({
    ok: true,
    stores: result.stores,
  });
}

type ApplyBody = StoreApplicationBody & {
  /**
   * 매장 입점·수수료 서약 (2026-11-10) — 게시된 store_partner_terms 가 있으면 필수.
   * `{ documentId, version, locale, agreeTerms: true, agreeFee: true }`
   */
  partner_agreement?: unknown;
};

/**
 * 매장 등록 신청 (계정당 1건 — DB 유일 인덱스 `stores_one_owner_one_store_uidx`).
 * 매장 신청 v2 (Owner 2026-11-10): 매장 ID(slug)는 서버가 자동 생성(화면 미표시) · 매장 전화는
 * 매장 전용 인증 기록 id 로만 받음 · 실제 영업장 위치(지도 좌표) 필수 · 매장 이름 중복은 지점명으로 구분 ·
 * 상태 기록(store_application_events) · 관리자 알림.
 */
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

  // 계정당 매장 1개 (상태 무관) — 이미 있으면 신청 화면 대신 운영 홈에서 상태를 본다.
  const { data: blockers, error: blockErr } = await supabase
    .from("stores")
    .select("id")
    .eq("owner_user_id", userId)
    .limit(1);
  if (blockErr) {
    return internalErrorResponse("save_failed", "[/api/me/stores POST] block check", blockErr, 500);
  }
  if (blockers && blockers.length > 0) {
    return NextResponse.json(
      { ok: false, error: "already_has_active_application", storeId: String(blockers[0]?.id ?? "") },
      { status: 409 }
    );
  }

  const parsed = await parseStoreApplicationInput(supabase, body, { excludeStoreId: null });
  if (!parsed.ok) {
    return NextResponse.json({ ok: false, error: parsed.error }, { status: parsed.status });
  }
  const fields = parsed.fields;

  // 신청자 대표 주소 — 회원 게이트 증빙 스냅숏(어드민 「신청자」 블록 전용 · 매장 위치 아님)
  let applicationAddressBook: ReturnType<typeof formatAddressBookCardPresentation> = null;
  try {
    const addressDefaults = await getUserAddressDefaults(supabase, userId);
    applicationAddressBook = formatAddressBookCardPresentation(addressDefaults.master);
  } catch (err) {
    console.error("[POST /api/me/stores] master address load", err);
    return NextResponse.json({ ok: false, error: "master_address_load_failed" }, { status: 503 });
  }
  if (!applicationAddressBook) {
    return NextResponse.json({ ok: false, error: "master_address_required" }, { status: 400 });
  }

  /**
   * 매장 입점·수수료 서약 — 게시된 약관이 있으면 필수. 기록 값(무료 종료일·업종·요율·본문 해시)은
   * 화면 값이 아니라 서버가 다시 계산한다. 읽기 실패는 서약 없이 통과시키지 않는다(fail-closed).
   */
  const partnerInput = parseStorePartnerAgreementInput(body.partner_agreement);
  const partnerTerms = await loadCurrentStorePartnerTerms(supabase, partnerInput?.locale ?? "ko");
  if (!partnerTerms.ok) {
    return internalErrorResponse("save_failed", "[/api/me/stores POST] partner terms", partnerTerms.error, 500);
  }
  const partnerCheck = checkStorePartnerAgreementInput(partnerTerms.terms, partnerInput);
  if (!partnerCheck.ok) {
    return NextResponse.json({ ok: false, error: partnerCheck.error }, { status: 400 });
  }
  let partnerFreeUntil: string | null = null;
  let partnerFeePercentAfter: number | null = null;
  if (partnerCheck.required) {
    const launch = await loadDeliveryLaunchSettingsCached();
    partnerFreeUntil = activeFreeUntilOrNull(launch.freeUntil);
    const fee = await resolveStorePartnerFeeAfter(supabase, {
      categoryId: fields.store_category_id,
      topicId: fields.store_topic_id,
    });
    if (!fee.ok) {
      return internalErrorResponse("save_failed", "[/api/me/stores POST] partner fee rate", "fee_rate_read_failed", 500);
    }
    partnerFeePercentAfter = fee.feePercent;
  }

  // 매장 전화 — 매장 전용 인증 기록으로만 (마지막에 사용 처리: 앞 단계 실패로 인증이 소모되지 않게)
  const phone = await consumeStorePhoneVerification(supabase, {
    userId,
    verificationId: String(body.phoneVerificationId ?? ""),
    purpose: "store_apply",
    storeId: null,
  });
  if (!phone.ok) {
    return NextResponse.json({ ok: false, error: phone.code }, { status: phone.status });
  }
  const dupPhone = await isStorePhoneUsedByOtherStore(supabase, phone.data.phoneDb09, null);
  if (!dupPhone.ok || dupPhone.data) {
    await releaseStorePhoneVerification(supabase, phone.data.verificationId);
    if (!dupPhone.ok) return NextResponse.json({ ok: false, error: "store_phone_check_failed" }, { status: 500 });
    return NextResponse.json({ ok: false, error: "store_phone_already_registered" }, { status: 409 });
  }

  /** business_hours_json 은 DB 기본 `{}` — 승인 후 매장 설정에서 영업·공지 등과 동일 스키마로 채움 */
  const insertPayload: Record<string, unknown> = {
    owner_user_id: userId,
    applicant_nickname: fields.applicant_nickname,
    store_name: fields.store_name,
    branch_name: fields.branch_name,
    business_type: fields.business_type,
    application_request_note: fields.application_request_note,
    application_address_book: applicationAddressBook,
    store_category_id: fields.store_category_id,
    store_topic_id: fields.store_topic_id,
    description: fields.description,
    kakao_id: fields.kakao_id,
    phone: phone.data.phoneDb09,
    phone_verified_at: phone.data.verifiedAt,
    phone_verification_id: phone.data.verificationId,
    approval_status: "pending",
    is_visible: false,
    ...fields.location,
  };

  const postInsertSelect =
    "id, owner_user_id, store_name, slug, business_type, description, kakao_id, phone, region, city, district, address_line1, address_line2, approval_status, rejected_reason, created_at, updated_at, approved_at, profile_image_url";

  let inserted: Record<string, unknown> | null = null;
  let insErr: { code?: string; message: string } | null = null;
  // slug 는 사장님에게 보이지 않는 내부 값 — 겹치면 짧은 코드를 붙여 다시 만든다.
  for (let attempt = 0; attempt < 5; attempt++) {
    const result = await supabase
      .from("stores")
      .insert({ ...insertPayload, slug: makeStoreApplicationSlug(fields.store_name, attempt) })
      .select(postInsertSelect)
      .maybeSingle();
    if (result.error && isMissingStoresApplicantNicknameColumnError(result.error.message ?? "")) {
      await releaseStorePhoneVerification(supabase, phone.data.verificationId);
      return NextResponse.json({ ok: false, error: STORES_APPLICANT_NICKNAME_SAVE_FAILED_ERROR }, { status: 503 });
    }
    insErr = result.error;
    inserted = result.data as Record<string, unknown> | null;
    if (!insErr) break;
    const uniqueBiz = classifyStoresInsertUniqueViolation(insErr);
    if (uniqueBiz === "slug_collision") continue;
    await releaseStorePhoneVerification(supabase, phone.data.verificationId);
    if (insErr.code === "23503") {
      return NextResponse.json({ ok: false, error: "owner_not_in_auth_users" }, { status: 400 });
    }
    if (uniqueBiz) return NextResponse.json({ ok: false, error: uniqueBiz }, { status: 409 });
    return internalErrorResponse("save_failed", "[/api/me/stores POST]", insErr, 500);
  }
  if (insErr || !inserted) {
    await releaseStorePhoneVerification(supabase, phone.data.verificationId);
    return internalErrorResponse("save_failed", "[/api/me/stores POST] slug", insErr ?? "insert_failed", 500);
  }
  const insertedId = String(inserted.id ?? "");
  await linkStorePhoneVerificationToStore(supabase, phone.data.verificationId, insertedId);

  if (partnerCheck.required) {
    const recorded = await recordStorePartnerAgreement(supabase, {
      storeId: insertedId,
      ownerUserId: userId,
      terms: partnerCheck.terms,
      freeUntil: partnerFreeUntil,
      storeCategoryId: fields.store_category_id,
      storeTopicId: fields.store_topic_id,
      feePercentAfter: partnerFeePercentAfter,
      source: "application",
    });
    if (!recorded.ok) {
      // 반쪽 상태 금지 — 서약 기록 없이 신청 매장만 남지 않게 방금 만든 매장 행을 지운다.
      const { error: rollbackErr } = await supabase
        .from("stores")
        .delete()
        .eq("id", insertedId)
        .eq("owner_user_id", userId);
      if (rollbackErr) {
        console.error("[POST /api/me/stores] partner agreement rollback failed", insertedId, rollbackErr.message);
      }
      await releaseStorePhoneVerification(supabase, phone.data.verificationId);
      invalidateMeStoresListServerCache(userId);
      return internalErrorResponse("save_failed", "[/api/me/stores POST] partner agreement", recorded.error, 500);
    }
  }

  await appendStoreApplicationEvent(supabase, {
    storeId: insertedId,
    fromStatus: null,
    toStatus: "pending",
    action: "submit",
    actorType: "owner",
    actorId: userId,
  });
  await notifyAdminsStoreApplicationSubmitted(supabase, {
    storeId: insertedId,
    storeName: fields.store_name,
    kind: "submit",
    actorUserId: userId,
  });

  invalidateMeStoresListServerCache(userId);
  return NextResponse.json({ ok: true, store: inserted });
}
