import { NextResponse } from "next/server";
import { appendAuditLog } from "@/lib/audit/append-audit-log";
import { getAuditRequestMeta } from "@/lib/audit/request-meta";
import { clientSafeInternalErrorMessage } from "@/lib/http/api-route";
import { verifyCronRequestAuthorization } from "@/lib/security/cron-auth";
import { runDeliveryAdSchedulePromoterBatch } from "@/lib/stores/advertising/delivery-ad-schedule-promoter";
import { runPartnerMembershipExpiryBatch } from "@/lib/stores/advertising/delivery-ad-partner-membership-writer";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";
import { runStoreCouponAutoEndBatch } from "@/lib/stores/store-coupon-auto-end";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** v4 W5 DB-03 — 쿠폰 만료 배치 RPC (마이그레이션 20270708150100). 함수가 없거나 실패해도 throw 하지 않는다. */
const COUPON_ENTITLEMENT_EXPIRE_RPC = "expire_stale_coupon_entitlements";
const COUPON_ENTITLEMENT_EXPIRE_BATCH = 500;

async function runCouponEntitlementExpireBatch(
  sb: NonNullable<ReturnType<typeof tryGetSupabaseForStores>>
): Promise<{ ok: true; expired: number; reservedReleased: number } | { ok: false; error: string }> {
  try {
    const { data, error } = await sb.rpc(COUPON_ENTITLEMENT_EXPIRE_RPC, {
      p_batch_limit: COUPON_ENTITLEMENT_EXPIRE_BATCH,
    });
    if (error) return { ok: false, error: error.message };
    const rec = (data ?? {}) as { expired_count?: unknown; reserved_released?: unknown };
    const expired = Number(rec.expired_count ?? 0);
    const released = Number(rec.reserved_released ?? 0);
    return {
      ok: true,
      expired: Number.isFinite(expired) ? expired : 0,
      reservedReleased: Number.isFinite(released) ? released : 0,
    };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

async function runSchedulePromoterJob(req: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) {
    return NextResponse.json({ ok: false, error: "cron_secret_not_configured" }, { status: 503 });
  }
  if (!verifyCronRequestAuthorization(req, secret)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const sb = tryGetSupabaseForStores();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  }

  try {
    const result = await runDeliveryAdSchedulePromoterBatch(sb, { batchSize: 50 });
    // ADS-05 — partner membership period end -> ENDED (only periods ending after the apply instant, D-5).
    const partnerExpiry = await runPartnerMembershipExpiryBatch(sb, { limit: 200 });
    if (!partnerExpiry.ok) {
      console.error("[cron delivery-ads-schedule-transitions] partner expiry", partnerExpiry.error);
    }
    const partnerEnded = partnerExpiry.ok ? partnerExpiry.ended : null;
    // 3-C ADS-23 — 같은 크론에서 기간 끝난 쿠폰 lifecycle 정합 (실패는 광고 배치 응답에 영향 없음).
    const couponAutoEnd = await runStoreCouponAutoEndBatch(sb).catch((e: unknown) => ({
      ok: false as const,
      error: String(e),
    }));
    if (!couponAutoEnd.ok) console.error("[cron coupon auto end]", couponAutoEnd.error);
    // v4 W5 DB-03 — 기간 지난 쿠폰(available/restored) 만료 + 캠페인 예약 금액 해제 (DB 함수, 같은 크론 · 실패는 응답에 영향 없음).
    const couponExpire = await runCouponEntitlementExpireBatch(sb);
    if (!couponExpire.ok) console.error("[cron coupon entitlement expire]", couponExpire.error);
    // 실행 기록은 바뀐 것이 있거나 하위 단계가 실패한 실행만 남긴다 — 0건 실행(5분마다)은 쌓지 않는다.
    const auditWorthy =
      result.activated > 0 ||
      result.ended > 0 ||
      result.expired > 0 ||
      result.failed > 0 ||
      partnerEnded !== 0 ||
      !couponAutoEnd.ok ||
      couponAutoEnd.ended > 0 ||
      !couponExpire.ok ||
      couponExpire.expired > 0 ||
      couponExpire.reservedReleased > 0;
    if (auditWorthy) {
      const rm = getAuditRequestMeta(req);
      void appendAuditLog(sb, {
        actor_type: "system",
        actor_id: null,
        target_type: "cron_job",
        target_id: "delivery-ads-schedule-transitions",
        action: "delivery_ads.schedule_promoter_batch",
        after_json: {
          activated: result.activated,
          ended: result.ended,
          expired: result.expired,
          failed: result.failed,
          scanned: result.scanned,
          partner_memberships_ended: partnerEnded,
          coupon_auto_ended: couponAutoEnd.ok ? couponAutoEnd.ended : null,
          coupon_entitlements_expired: couponExpire.ok ? couponExpire.expired : null,
          coupon_reserved_released_php: couponExpire.ok ? couponExpire.reservedReleased : null,
        },
        ip: rm.ip,
        user_agent: rm.userAgent,
      });
    }
    return NextResponse.json({
      ok: true,
      activated: result.activated,
      ended: result.ended,
      expired: result.expired,
      failed: result.failed,
      scanned: result.scanned,
      partnerMembershipsEnded: partnerEnded,
      results: result.results,
      coupon_auto_ended: couponAutoEnd.ok ? couponAutoEnd.ended : null,
      coupon_entitlements_expired: couponExpire.ok ? couponExpire.expired : null,
    });
  } catch (err) {
    console.error("[cron delivery-ads-schedule-transitions]", err);
    return NextResponse.json(
      { ok: false, error: clientSafeInternalErrorMessage(String(err)) },
      { status: 500 }
    );
  }
}

export async function GET(req: Request) {
  return runSchedulePromoterJob(req);
}

export async function POST(req: Request) {
  return runSchedulePromoterJob(req);
}
