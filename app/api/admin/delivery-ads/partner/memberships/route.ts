import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";
import {
  DELIVERY_AD_PARTNER_MEMBERSHIP_STATUSES,
  DELIVERY_AD_PARTNER_PAYMENT,
  type DeliveryAdPartnerMembershipStatus,
} from "@/lib/stores/advertising/delivery-ad-commercial-contract";
import {
  adminApprovePartnerMembership,
  adminEndPartnerMembership,
  listPartnerMembershipsForAdmin,
  loadDeliveryAdPartnerConfig,
  partnerMembershipAdminFilterLabel,
} from "@/lib/stores/advertising/delivery-ad-partner-membership-writer";
import { formatDeliveryAdPhpMinor } from "@/lib/stores/advertising/delivery-ad-commercial-labels";

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

  const [list, config] = await Promise.all([
    listPartnerMembershipsForAdmin(sb, { status, storeId }),
    loadDeliveryAdPartnerConfig(sb),
  ]);
  if (list.error) {
    return NextResponse.json({ ok: false, error: list.error }, { status: 500 });
  }

  const storeIds = [...new Set(list.items.map((m) => m.storeId))];
  const storesRes =
    storeIds.length > 0
      ? await sb.from("stores").select("id, name").in("id", storeIds)
      : { data: [] as Array<{ id: string; name: string | null }> };
  const nameById = new Map(
    (storesRes.data ?? []).map((s) => [String(s.id), String(s.name ?? "")])
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
    memberships: list.items.map((m) => ({
      ...m,
      storeName: nameById.get(m.storeId) ?? null,
      statusLabelKo: partnerMembershipAdminFilterLabel(m.status, "ko"),
      statusLabelEn: partnerMembershipAdminFilterLabel(m.status, "en"),
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

/** POST — approve | end */
export async function POST(req: NextRequest) {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;
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
    return NextResponse.json({
      ok: true,
      membership: result.membership,
      payment: DELIVERY_AD_PARTNER_PAYMENT,
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
    return NextResponse.json({ ok: true, membership: result.membership });
  }

  return NextResponse.json({ ok: false, error: "unknown_op" }, { status: 400 });
}
