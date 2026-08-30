import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";
import { loadDeliveryAdCommercialCatalog } from "@/lib/stores/advertising/delivery-ad-commercial-catalog";
import {
  adminCreateDeliveryAdPackage,
  adminSetPlacementSellable,
  adminUpdateDeliveryAdExtensionPolicy,
  adminUpdateDeliveryAdPackagePrice,
  adminUpdateDeliveryAdPartnerConfig,
  adminUpdateDeliveryAdProductCommercial,
} from "@/lib/stores/advertising/delivery-ad-commercial-admin-writer";
import { isDeliveryAdProductKey } from "@/lib/stores/advertising/delivery-ad-product-registry";
import {
  DELIVERY_AD_COMMERCIAL_PLACEMENT_LABELS,
  isDeliveryAdCommercialPlacementKey,
} from "@/lib/stores/advertising/delivery-ad-commercial-labels";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET — full commercial catalog for Admin settings. */
export async function GET() {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;
  const sb = tryCreateSupabaseServiceClient();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  }
  const catalog = await loadDeliveryAdCommercialCatalog(sb);
  return NextResponse.json({
    ok: true,
    catalog,
    placementLabels: DELIVERY_AD_COMMERCIAL_PLACEMENT_LABELS,
    priceChangeWarning: {
      ko: "가격 변경은 기존 신청/구매 금액에 소급 적용되지 않습니다.",
      en: "Price changes do not apply retroactively to existing applications or purchases.",
    },
  });
}

type PatchBody = {
  op?: string;
  reason?: string;
  productKey?: string;
  displayName?: string;
  description?: string | null;
  enabled?: boolean;
  acceptingApplications?: boolean;
  packageId?: string;
  priceAmountMinor?: number | null;
  durationDays?: number;
  displayOrder?: number;
  inventoryKey?: string;
  sellable?: boolean;
  code?: string;
  extensionEnabled?: boolean;
  additionalDayPriceMinor?: number | null;
  minimumExtensionDays?: number;
  maximumExtensionDays?: number;
  monthlyFeeMinor?: number | null;
  advertisingDiscountPercent?: number;
  acceptingNewMembers?: boolean;
};

/** PATCH — canonical Admin commercial writes (server authority). */
export async function PATCH(req: NextRequest) {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;
  const sb = tryCreateSupabaseServiceClient();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  }

  let body: PatchBody;
  try {
    body = (await req.json()) as PatchBody;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const op = String(body.op ?? "").trim();
  const reason = String(body.reason ?? "").trim() || "admin_commercial_update";
  const actorUserId = admin.userId;

  let result: { ok: true } | { ok: false; error: string } | { ok: true; package: unknown };

  switch (op) {
    case "update_product": {
      if (!isDeliveryAdProductKey(body.productKey)) {
        return NextResponse.json({ ok: false, error: "invalid_product" }, { status: 400 });
      }
      result = await adminUpdateDeliveryAdProductCommercial(sb, {
        productKey: body.productKey,
        displayName: body.displayName,
        description: body.description,
        enabled: body.enabled,
        acceptingApplications: body.acceptingApplications,
        actorUserId,
        reason,
      });
      break;
    }
    case "update_package": {
      const packageId = String(body.packageId ?? "").trim();
      if (!packageId) {
        return NextResponse.json({ ok: false, error: "missing_package_id" }, { status: 400 });
      }
      result = await adminUpdateDeliveryAdPackagePrice(sb, {
        packageId,
        priceAmountMinor: body.priceAmountMinor,
        enabled: body.enabled,
        durationDays: body.durationDays,
        displayName: body.displayName,
        displayOrder: body.displayOrder,
        actorUserId,
        reason,
      });
      break;
    }
    case "create_package": {
      if (!isDeliveryAdProductKey(body.productKey)) {
        return NextResponse.json({ ok: false, error: "invalid_product" }, { status: 400 });
      }
      const inventoryKey = String(body.inventoryKey ?? "").trim();
      if (!isDeliveryAdCommercialPlacementKey(inventoryKey)) {
        return NextResponse.json({ ok: false, error: "invalid_placement" }, { status: 400 });
      }
      result = await adminCreateDeliveryAdPackage(sb, {
        productKind: body.productKey,
        inventoryKey,
        code: String(body.code ?? ""),
        displayName: String(body.displayName ?? ""),
        durationDays: Number(body.durationDays),
        priceAmountMinor: body.priceAmountMinor ?? null,
        enabled: body.enabled === true,
        displayOrder: Number.isInteger(body.displayOrder) ? Number(body.displayOrder) : 100,
        actorUserId,
        reason,
      });
      break;
    }
    case "update_placement": {
      if (!isDeliveryAdProductKey(body.productKey)) {
        return NextResponse.json({ ok: false, error: "invalid_product" }, { status: 400 });
      }
      const inventoryKey = String(body.inventoryKey ?? "").trim();
      if (!isDeliveryAdCommercialPlacementKey(inventoryKey)) {
        return NextResponse.json({ ok: false, error: "invalid_placement" }, { status: 400 });
      }
      result = await adminSetPlacementSellable(sb, {
        productKind: body.productKey,
        inventoryKey,
        sellable: body.sellable === true,
        actorUserId,
        reason,
      });
      break;
    }
    case "update_extension": {
      result = await adminUpdateDeliveryAdExtensionPolicy(sb, {
        extensionEnabled: body.extensionEnabled === true,
        additionalDayPriceMinor: body.additionalDayPriceMinor ?? null,
        minimumExtensionDays: body.minimumExtensionDays,
        maximumExtensionDays: body.maximumExtensionDays,
        actorUserId,
        reason,
      });
      break;
    }
    case "update_partner": {
      result = await adminUpdateDeliveryAdPartnerConfig(sb, {
        monthlyFeeMinor: body.monthlyFeeMinor ?? null,
        advertisingDiscountPercent: Number(body.advertisingDiscountPercent ?? 0),
        enabled: body.enabled,
        acceptingNewMembers: body.acceptingNewMembers,
        actorUserId,
        reason,
      });
      break;
    }
    default:
      return NextResponse.json({ ok: false, error: "unknown_op" }, { status: 400 });
  }

  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: 400 });
  }

  const catalog = await loadDeliveryAdCommercialCatalog(sb);
  return NextResponse.json({ ok: true, catalog });
}
