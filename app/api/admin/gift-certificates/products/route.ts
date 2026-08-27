import { NextRequest, NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/admin/require-admin-permission";
import {
  validateGiftProductFunding,
  type GiftDiscountFundingParty,
} from "@/lib/gift-certificate/gift-certificate-domain-contract";
import { GIFT_TABLES } from "@/lib/gift-certificate/gift-certificate-schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function s(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function n(v: unknown): number {
  return Math.trunc(Number(v) || 0);
}

/** GET+POST /api/admin/gift-certificates/products — admin creates product from application */
export async function GET(req: NextRequest) {
  const gate = await requireAdminPermission("business");
  if (!gate.ok) return gate.response;

  const storeId = new URL(req.url).searchParams.get("storeId")?.trim() || "";
  let q = gate.sb
    .from(GIFT_TABLES.products)
    .select(
      "id, store_id, application_id, title, face_value, purchase_price, platform_fee_rate, discount_funding_party, platform_funded_units, merchant_funded_units, transferable, sales_starts_at, sales_ends_at, active, image_url, issued_count, max_issuance, created_at, stores(store_name)"
    )
    .order("created_at", { ascending: false })
    .limit(100);
  if (storeId) q = q.eq("store_id", storeId);

  const { data, error } = await q;
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  const productsRaw = (data ?? []) as Record<string, unknown>[];
  const productIds = productsRaw.map((r) => s(r.id)).filter(Boolean);
  const outstandingByProduct = new Map<string, number>();
  const redeemedByProduct = new Map<string, number>();

  if (productIds.length) {
    const { data: instances } = await gate.sb
      .from(GIFT_TABLES.instances)
      .select("id, product_id, remaining_balance, status")
      .in("product_id", productIds)
      .limit(5000);
    const instanceIds: string[] = [];
    for (const raw of instances ?? []) {
      const r = raw as Record<string, unknown>;
      const pid = s(r.product_id);
      const st = s(r.status);
      if (st === "ACTIVE" || st === "PARTIALLY_REDEEMED" || st === "GIFT_LOCKED") {
        outstandingByProduct.set(
          pid,
          (outstandingByProduct.get(pid) ?? 0) + Math.max(0, n(r.remaining_balance))
        );
      }
      instanceIds.push(s(r.id));
    }
    if (instanceIds.length) {
      const { data: redemptions } = await gate.sb
        .from(GIFT_TABLES.redemptions)
        .select("instance_id, redeemed_amount, reversed")
        .in("instance_id", instanceIds.slice(0, 2000))
        .limit(5000);
      const productByInstance = new Map(
        ((instances ?? []) as Record<string, unknown>[]).map((r) => [s(r.id), s(r.product_id)])
      );
      for (const raw of redemptions ?? []) {
        const r = raw as Record<string, unknown>;
        if (r.reversed === true) continue;
        const pid = productByInstance.get(s(r.instance_id));
        if (!pid) continue;
        redeemedByProduct.set(pid, (redeemedByProduct.get(pid) ?? 0) + Math.max(0, n(r.redeemed_amount)));
      }
    }
  }

  const products = productsRaw.map((row) => {
    const storesRaw = row.stores;
    const storeObj = Array.isArray(storesRaw) ? storesRaw[0] : storesRaw;
    const storeName =
      storeObj && typeof storeObj === "object"
        ? s((storeObj as { store_name?: unknown }).store_name)
        : "";
    const id = s(row.id);
    return {
      id,
      store_id: s(row.store_id),
      store_name: storeName,
      application_id: row.application_id == null ? null : s(row.application_id),
      title: s(row.title),
      face_value: n(row.face_value),
      purchase_price: n(row.purchase_price),
      platform_fee_rate: n(row.platform_fee_rate),
      discount_funding_party: s(row.discount_funding_party) || "NONE",
      platform_funded_units: n(row.platform_funded_units),
      merchant_funded_units: n(row.merchant_funded_units),
      transferable: row.transferable !== false,
      sales_starts_at: row.sales_starts_at == null ? null : s(row.sales_starts_at),
      sales_ends_at: row.sales_ends_at == null ? null : s(row.sales_ends_at),
      active: row.active === true,
      image_url: row.image_url == null ? null : s(row.image_url),
      issued_count: n(row.issued_count),
      max_issuance: row.max_issuance == null ? null : n(row.max_issuance),
      created_at: s(row.created_at),
      outstanding_balance: outstandingByProduct.get(id) ?? 0,
      redeemed_gross: redeemedByProduct.get(id) ?? 0,
    };
  });

  return NextResponse.json({ ok: true, products });
}

export async function POST(req: NextRequest) {
  const gate = await requireAdminPermission("business");
  if (!gate.ok) return gate.response;

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const applicationId = String(body.applicationId ?? body.application_id ?? "").trim();
  const title = String(body.title ?? "").trim();
  const faceValue = Math.trunc(Number(body.faceValue ?? body.face_value));
  const purchasePrice = Math.trunc(Number(body.purchasePrice ?? body.purchase_price));
  const platformFeeRate = Math.trunc(Number(body.platformFeeRate ?? body.platform_fee_rate ?? 0));
  const discountFundingParty = String(
    body.discountFundingParty ?? body.discount_funding_party ?? "NONE"
  ) as GiftDiscountFundingParty;
  const platformFundedUnits = Math.trunc(
    Number(body.platformFundedUnits ?? body.platform_funded_units ?? 0)
  );
  const merchantFundedUnits = Math.trunc(
    Number(body.merchantFundedUnits ?? body.merchant_funded_units ?? 0)
  );
  const transferable = body.transferable !== false;
  const salesStartsAt = String(body.salesStartsAt ?? body.sales_starts_at ?? "").trim() || null;
  const salesEndsAt = String(body.salesEndsAt ?? body.sales_ends_at ?? "").trim() || null;
  const imageUrl = String(body.imageUrl ?? body.image_url ?? "").trim() || null;
  const maxIssuanceRaw = body.maxIssuance ?? body.max_issuance;
  const maxIssuance =
    maxIssuanceRaw == null || maxIssuanceRaw === ""
      ? null
      : Math.trunc(Number(maxIssuanceRaw));

  if (!title || !Number.isFinite(faceValue) || faceValue <= 0 || !Number.isFinite(purchasePrice)) {
    return NextResponse.json({ ok: false, error: "invalid_product_fields" }, { status: 400 });
  }

  const funding = validateGiftProductFunding({
    faceValue,
    purchasePrice,
    discountFundingParty,
    platformFundedUnits,
    merchantFundedUnits,
  });
  if (!funding.ok) {
    return NextResponse.json({ ok: false, error: funding.error }, { status: 400 });
  }

  let storeId = String(body.storeId ?? body.store_id ?? "").trim();
  if (applicationId) {
    const { data: app, error: appErr } = await gate.sb
      .from(GIFT_TABLES.applications)
      .select("id, store_id, status, title, requested_face_value")
      .eq("id", applicationId)
      .maybeSingle();
    if (appErr || !app) {
      return NextResponse.json({ ok: false, error: "application_not_found" }, { status: 404 });
    }
    storeId = String(app.store_id);
  }
  if (!storeId) {
    return NextResponse.json({ ok: false, error: "store_id_required" }, { status: 400 });
  }

  const { data, error } = await gate.sb
    .from(GIFT_TABLES.products)
    .insert({
      store_id: storeId,
      application_id: applicationId || null,
      title,
      face_value: faceValue,
      purchase_price: purchasePrice,
      platform_fee_rate: Math.max(0, Math.min(100, platformFeeRate)),
      discount_funding_party: discountFundingParty,
      platform_funded_units: platformFundedUnits,
      merchant_funded_units: merchantFundedUnits,
      transferable,
      sales_starts_at: salesStartsAt ?? new Date().toISOString(),
      sales_ends_at: salesEndsAt,
      active: true,
      image_url: imageUrl,
      created_by_admin_user_id: gate.actor.userId,
      max_issuance: maxIssuance != null && Number.isFinite(maxIssuance) && maxIssuance > 0 ? maxIssuance : null,
    })
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  if (applicationId) {
    await gate.sb
      .from(GIFT_TABLES.applications)
      .update({ status: "approved", updated_at: new Date().toISOString() })
      .eq("id", applicationId);
  }

  return NextResponse.json({ ok: true, product: data }, { status: 201 });
}
