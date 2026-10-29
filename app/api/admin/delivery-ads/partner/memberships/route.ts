import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { requireAdminPermission } from "@/lib/admin/require-admin-permission";
import { appendAdminRouteAudit } from "@/lib/admin/audit/append-admin-route-audit";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";
import {
  DELIVERY_AD_PARTNER_MEMBERSHIP_STATUSES,
  DELIVERY_AD_PARTNER_PAYMENT,
  type DeliveryAdPartnerMembershipStatus,
} from "@/lib/stores/advertising/delivery-ad-commercial-contract";
import {
  adminApprovePartnerMembership,
  adminEndPartnerMembership,
  adminRejectPartnerMembership,
  isPartnerMembershipPeriodExpired,
  listOrphanPartnerFundingsForAdmin,
  listPartnerMembershipsForAdmin,
  loadDeliveryAdPartnerConfig,
  partnerMembershipEffectiveStatusLabel,
} from "@/lib/stores/advertising/delivery-ad-partner-membership-writer";
import { formatDeliveryAdPhpMinor } from "@/lib/stores/advertising/delivery-ad-commercial-labels";
import { internalErrorResponse } from "@/lib/security/internal-error-response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET — Admin Partner membership list. */
export async function GET(req: NextRequest) {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;
  const sb = tryCreateSupabaseServiceClient();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  }

  const statusRaw = String(req.nextUrl.searchParams.get("status") ?? "open").trim();
  const storeId = String(req.nextUrl.searchParams.get("storeId") ?? "").trim() || undefined;
  const status =
    statusRaw === "all" || statusRaw === "open"
      ? statusRaw
      : (DELIVERY_AD_PARTNER_MEMBERSHIP_STATUSES as readonly string[]).includes(statusRaw)
        ? (statusRaw as DeliveryAdPartnerMembershipStatus)
        : "open";

  const [list, config, orphans] = await Promise.all([
    listPartnerMembershipsForAdmin(sb, { status, storeId }),
    loadDeliveryAdPartnerConfig(sb),
    listOrphanPartnerFundingsForAdmin(sb),
  ]);
  if (list.error) {
    return internalErrorResponse("load_failed", "[/api/admin/delivery-ads/partner/memberships GET]", list.error, 500);
  }
  if (orphans.error) {
    return internalErrorResponse("orphan_fundings_load_failed", "[/api/admin/delivery-ads/partner/memberships GET]", orphans.error, 500);
  }

  const storeIds = [...new Set(list.items.map((m) => m.storeId))];
  // stores 의 이름 열은 store_name 뿐 (운영 스키마에 name 없음 — 예전엔 없는 열을 조회해 오류가 나고,
  // 오류를 확인하지 않아 매장 이름이 항상 비었다). 조회 오류는 덮지 않고 500 으로 응답한다.
  const storesRes =
    storeIds.length > 0
      ? await sb.from("stores").select("id, store_name").in("id", storeIds)
      : { data: [] as Array<{ id: string; store_name: string | null }>, error: null };
  if (storesRes.error) {
    return internalErrorResponse("stores_load_failed", "[/api/admin/delivery-ads/partner/memberships GET]", storesRes.error, 500);
  }
  const nameById = new Map(
    (storesRes.data ?? []).map((s) => [String(s.id), String(s.store_name ?? "")])
  );

  return NextResponse.json({
    ok: true,
    payment: DELIVERY_AD_PARTNER_PAYMENT,
    config: config
      ? {
          enabled: config.enabled,
          acceptingNewMembers: config.acceptingNewMembers,
          monthlyFeeMinor: config.monthlyFeeMinor,
          monthlyFeeLabel:
            config.monthlyFeeMinor == null
              ? null
              : formatDeliveryAdPhpMinor(config.monthlyFeeMinor),
          advertisingDiscountPercent: config.advertisingDiscountPercent,
        }
      : null,
    // ADS-04 — partner Cash fundings without a membership row (manual recovery via refund).
    orphanFundings: orphans.items.map((f) => ({
      ...f,
      amountLabel: formatDeliveryAdPhpMinor(f.amountMinor),
    })),
    memberships: list.items.map((m) => ({
      ...m,
      storeName: nameById.get(m.storeId) ?? null,
      // ADS-05 — read-time derivation: ACTIVE past period end is labelled expired (row itself unchanged, D-5).
      periodExpired: isPartnerMembershipPeriodExpired(m),
      statusLabelKo: partnerMembershipEffectiveStatusLabel(m, "ko"),
      statusLabelEn: partnerMembershipEffectiveStatusLabel(m, "en"),
      feeSnapshotLabel:
        m.feeSnapshotMinor == null ? null : formatDeliveryAdPhpMinor(m.feeSnapshotMinor),
    })),
  });
}

type PostBody = {
  op?: string;
  membershipId?: string;
  reason?: string;
  periodDays?: number;
};

/** POST — approve | reject | end */
export async function POST(req: NextRequest) {
  // ADS-08 — 승인·반려(회비 환불)·종료는 business 권한키 필수. GET 조회는 현행(관리자 공통) 유지.
  const gate = await requireAdminPermission("business");
  if (!gate.ok) return gate.response;
  const admin = { userId: gate.actor.userId };
  const sb = tryCreateSupabaseServiceClient();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  }

  let body: PostBody;
  try {
    body = (await req.json()) as PostBody;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const op = String(body.op ?? "").trim();
  const membershipId = String(body.membershipId ?? "").trim();
  if (!membershipId) {
    return NextResponse.json({ ok: false, error: "missing_membership_id" }, { status: 400 });
  }

  if (op === "approve") {
    const result = await adminApprovePartnerMembership(sb, {
      membershipId,
      actorUserId: admin.userId,
      reason: String(body.reason ?? "admin_partner_approve"),
      periodDays: body.periodDays,
    });
    if (!result.ok) {
      return NextResponse.json({ ok: false, error: result.error }, { status: 400 });
    }
    await appendAdminRouteAudit(sb, req, {
      actorId: admin.userId,
      targetType: "delivery_ad_partner_membership",
      targetId: membershipId,
      action: "delivery_ad_partner_membership.approve",
      after: { storeId: result.membership.storeId, status: result.membership.status, reason: body.reason ?? null, periodDays: body.periodDays ?? null },
    });
    return NextResponse.json({
      ok: true,
      membership: result.membership,
      payment: DELIVERY_AD_PARTNER_PAYMENT,
    });
  }

  if (op === "reject") {
    const result = await adminRejectPartnerMembership(sb, {
      membershipId,
      actorUserId: admin.userId,
      reason: String(body.reason ?? "admin_partner_reject"),
    });
    if (!result.ok) {
      return NextResponse.json({ ok: false, error: result.error }, { status: 400 });
    }
    await appendAdminRouteAudit(sb, req, {
      actorId: admin.userId,
      targetType: "delivery_ad_partner_membership",
      targetId: membershipId,
      action: "delivery_ad_partner_membership.reject",
      after: { storeId: result.membership.storeId, status: result.membership.status, reason: body.reason ?? null, refundIdempotent: result.refundIdempotent },
    });
    return NextResponse.json({
      ok: true,
      membership: result.membership,
      refundIdempotent: result.refundIdempotent,
    });
  }

  if (op === "end" || op === "cancel") {
    const result = await adminEndPartnerMembership(sb, {
      membershipId,
      actorUserId: admin.userId,
      reason: String(body.reason ?? `admin_partner_${op}`),
    });
    if (!result.ok) {
      return NextResponse.json({ ok: false, error: result.error }, { status: 400 });
    }
    await appendAdminRouteAudit(sb, req, {
      actorId: admin.userId,
      targetType: "delivery_ad_partner_membership",
      targetId: membershipId,
      action: `delivery_ad_partner_membership.${op}`,
      after: { storeId: result.membership.storeId, status: result.membership.status, reason: body.reason ?? null },
    });
    return NextResponse.json({ ok: true, membership: result.membership });
  }

  return NextResponse.json({ ok: false, error: "unknown_op" }, { status: 400 });
}
