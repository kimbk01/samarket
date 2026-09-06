import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { isAdminDeliveryAdProduct } from "@/lib/stores/advertising/admin-delivery-ad-contract";
import {
  adminExtendDeliveryAdCampaign,
  type AdminDeliveryAdExtendKind,
} from "@/lib/stores/advertising/admin-delivery-ad-extension-writer";
import {
  calculateDeliveryAdExtensionQuote,
  DELIVERY_AD_EXTENSION_POLICY_TABLE,
  type DeliveryAdExtensionPolicyRow,
} from "@/lib/stores/advertising/delivery-ad-commercial-contract";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ campaignId: string }> };

function mapPolicy(raw: Record<string, unknown> | null): DeliveryAdExtensionPolicyRow | null {
  if (!raw) return null;
  return {
    extensionEnabled: raw.extension_enabled === true,
    additionalDayPriceMinor:
      raw.additional_day_price_minor == null ? null : Number(raw.additional_day_price_minor),
    currency: String(raw.currency ?? "PHP"),
    minimumExtensionDays: Number(raw.minimum_extension_days ?? 1),
    maximumExtensionDays: Number(raw.maximum_extension_days ?? 30),
    extensionUnitDays: Number(raw.extension_unit_days ?? 1),
  };
}

/** GET quote preview — no mutation. */
export async function GET(req: NextRequest, ctx: Ctx) {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;
  const sb = tryGetSupabaseForStores();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  }
  const { campaignId } = await ctx.params;
  const days = Number(req.nextUrl.searchParams.get("days") ?? "0");
  const kindRaw = String(req.nextUrl.searchParams.get("kind") ?? "PAID").trim();
  const kind: AdminDeliveryAdExtendKind =
    kindRaw === "ADMIN_FREE_COMPENSATION" ? "ADMIN_FREE_COMPENSATION" : "PAID";
  const previousEndAt = String(req.nextUrl.searchParams.get("previousEndAt") ?? "").trim();
  if (!previousEndAt || !Number.isInteger(days) || days < 1) {
    return NextResponse.json({ ok: false, error: "invalid_quote_input" }, { status: 400 });
  }
  const { data: policyRaw, error } = await sb
    .from(DELIVERY_AD_EXTENSION_POLICY_TABLE)
    .select("*")
    .limit(1)
    .maybeSingle();
  if (error) {
    return NextResponse.json({ ok: false, error: "policy_unavailable" }, { status: 503 });
  }
  const policy = mapPolicy((policyRaw as Record<string, unknown> | null) ?? null);
  if (!policy) {
    return NextResponse.json({ ok: false, error: "policy_unavailable" }, { status: 503 });
  }
  const quote = calculateDeliveryAdExtensionQuote({
    previousEndAtIso: previousEndAt,
    requestedDays: days,
    policy,
    partnerDiscountPercent: 0,
    extensionKind: kind,
  });
  if (!quote.ok) {
    return NextResponse.json({ ok: false, error: quote.error }, { status: 422 });
  }
  return NextResponse.json({
    ok: true,
    quote: {
      extensionKind: quote.extensionKind,
      daysAdded: quote.daysAdded,
      amountMinor: quote.finalExtensionAmountMinor,
      currency: quote.currency,
      previousEndAt: quote.previousEndAt,
      newEndAt: quote.newEndAt,
      unitPriceMinor: quote.unitPriceMinorSnapshot,
      partnerDiscountPercent: quote.partnerDiscountPercentSnapshot,
    },
    campaignId,
  });
}

/** POST — execute PAID or compensation extension. */
export async function POST(req: NextRequest, ctx: Ctx) {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;
  const sb = tryGetSupabaseForStores();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  }
  const { campaignId } = await ctx.params;
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  if (!isAdminDeliveryAdProduct(body.productKind)) {
    return NextResponse.json({ ok: false, error: "invalid_product" }, { status: 400 });
  }
  const kindRaw = String(body.extensionKind ?? "").trim();
  const extensionKind: AdminDeliveryAdExtendKind | null =
    kindRaw === "PAID" || kindRaw === "ADMIN_FREE_COMPENSATION"
      ? (kindRaw as AdminDeliveryAdExtendKind)
      : null;
  if (!extensionKind) {
    return NextResponse.json({ ok: false, error: "invalid_extension_kind" }, { status: 400 });
  }
  const result = await adminExtendDeliveryAdCampaign(sb, {
    adminUserId: admin.userId,
    productKind: body.productKind,
    campaignId,
    expectedUpdatedAt: String(body.expectedUpdatedAt ?? ""),
    requestedDays: Number(body.requestedDays ?? 0),
    extensionKind,
    reason: String(body.reason ?? ""),
    idempotencyKey: body.idempotencyKey != null ? String(body.idempotencyKey) : null,
  });
  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: result.error, detail: result.detail },
      { status: result.httpStatus }
    );
  }
  return NextResponse.json({ ok: true, extension: result });
}
