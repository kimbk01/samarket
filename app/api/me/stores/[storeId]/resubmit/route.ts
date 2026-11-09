import { NextRequest, NextResponse } from "next/server";
import { getRouteUserId } from "@/lib/auth/get-route-user-id";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";
import { invalidateMeStoresListServerCache } from "@/lib/me/load-me-stores-for-user";
import { appendAuditLog } from "@/lib/audit/append-audit-log";
import { getAuditRequestMeta } from "@/lib/audit/request-meta";
import {
  parseStoreApplicationInput,
  type StoreApplicationBody,
} from "@/lib/stores/store-application-input.server";
import {
  consumeStorePhoneVerification,
  isStorePhoneUsedByOtherStore,
  releaseStorePhoneVerification,
} from "@/lib/stores/store-phone-otp-service";
import { appendStoreApplicationEvent } from "@/lib/stores/store-application-events.server";
import { notifyAdminsStoreApplicationSubmitted } from "@/lib/stores/store-application-admin-notify.server";
import { bumpStorePublicSharedCacheGeneration } from "@/lib/stores/store-public-shared-cache-generation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 보완 요청 매장 — 신청서를 고쳐 「보완 내용 제출」 (매장 신청 v2 · Owner 2026-11-10).
 * 신청 항목 저장 + `revision_requested → pending` 을 한 번의 조건부 UPDATE 로 처리한다.
 * 보완 중에는 매장 이름·업종도 고칠 수 있다. 전화번호를 바꾸면 매장 전화 인증 기록 id 필요.
 * (프로필 일반 저장은 더 이상 자동 재제출하지 않는다.)
 */
export async function POST(req: NextRequest, context: { params: Promise<{ storeId: string }> }) {
  const userId = await getRouteUserId();
  if (!userId) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const sb = tryGetSupabaseForStores();
  if (!sb) return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  const { storeId } = await context.params;
  const sid = String(storeId ?? "").trim();
  if (!sid) return NextResponse.json({ ok: false, error: "missing_store_id" }, { status: 400 });

  let body: StoreApplicationBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const { data: store, error: readErr } = await sb
    .from("stores")
    .select("id, owner_user_id, approval_status, phone, slug")
    .eq("id", sid)
    .maybeSingle();
  if (readErr) return NextResponse.json({ ok: false, error: "store_read_failed" }, { status: 500 });
  if (!store || String(store.owner_user_id ?? "") !== userId) {
    return NextResponse.json({ ok: false, error: "store_not_found" }, { status: 404 });
  }
  if (String(store.approval_status ?? "") !== "revision_requested") {
    return NextResponse.json({ ok: false, error: "not_revision_requested" }, { status: 409 });
  }

  const parsed = await parseStoreApplicationInput(sb, body, { excludeStoreId: sid });
  if (!parsed.ok) return NextResponse.json({ ok: false, error: parsed.error }, { status: parsed.status });
  const f = parsed.fields;

  const patch: Record<string, unknown> = {
    applicant_nickname: f.applicant_nickname,
    store_name: f.store_name,
    branch_name: f.branch_name,
    business_type: f.business_type,
    store_category_id: f.store_category_id,
    store_topic_id: f.store_topic_id,
    description: f.description,
    application_request_note: f.application_request_note,
    kakao_id: f.kakao_id,
    ...f.location,
    approval_status: "pending",
  };

  let usedVerificationId: string | null = null;
  const verificationId = String(body.phoneVerificationId ?? "").trim();
  if (verificationId) {
    const phone = await consumeStorePhoneVerification(sb, {
      userId,
      verificationId,
      purpose: "store_apply",
      storeId: sid,
    });
    if (!phone.ok) return NextResponse.json({ ok: false, error: phone.code }, { status: phone.status });
    usedVerificationId = phone.data.verificationId;
    const dup = await isStorePhoneUsedByOtherStore(sb, phone.data.phoneDb09, sid);
    if (!dup.ok || dup.data) {
      await releaseStorePhoneVerification(sb, usedVerificationId);
      return NextResponse.json(
        { ok: false, error: dup.ok ? "store_phone_already_registered" : "store_phone_check_failed" },
        { status: dup.ok ? 409 : 500 }
      );
    }
    patch.phone = phone.data.phoneDb09;
    patch.phone_verified_at = phone.data.verifiedAt;
    patch.phone_verification_id = phone.data.verificationId;
  } else if (!String(store.phone ?? "").trim()) {
    return NextResponse.json({ ok: false, error: "store_phone_verification_required" }, { status: 400 });
  }

  const { data: updated, error: upErr } = await sb
    .from("stores")
    .update(patch)
    .eq("id", sid)
    .eq("approval_status", "revision_requested")
    .select("id, store_name, approval_status")
    .maybeSingle();
  if (upErr || !updated) {
    if (usedVerificationId) await releaseStorePhoneVerification(sb, usedVerificationId);
    if (upErr) {
      console.error("[POST /api/me/stores/[storeId]/resubmit]", upErr.message);
      return NextResponse.json({ ok: false, error: "update_failed" }, { status: 500 });
    }
    return NextResponse.json({ ok: false, error: "status_changed" }, { status: 409 });
  }

  await appendStoreApplicationEvent(sb, {
    storeId: sid,
    fromStatus: "revision_requested",
    toStatus: "pending",
    action: "resubmit",
    actorType: "owner",
    actorId: userId,
  });
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
  }).catch((e: unknown) => console.error("[resubmit] audit", e));
  await notifyAdminsStoreApplicationSubmitted(sb, {
    storeId: sid,
    storeName: f.store_name,
    kind: "resubmit",
    actorUserId: userId,
  });
  invalidateMeStoresListServerCache(userId);
  bumpStorePublicSharedCacheGeneration("owner_store.resubmit");
  return NextResponse.json({ ok: true, store: updated });
}
