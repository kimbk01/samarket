import { NextRequest, NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/admin/require-admin-permission";
import {
  assertGiftScopeStoreId,
  isGiftScope,
  resolveGiftCreationSource,
  validateGiftProductFunding,
  type GiftDiscountFundingParty,
  type GiftScope,
} from "@/lib/gift-certificate/gift-certificate-domain-contract";
import { evaluateGiftProductCustomerPurchaseEligibility } from "@/lib/gift-certificate/gift-product-customer-catalog";
import { GIFT_TABLES } from "@/lib/gift-certificate/gift-certificate-schema";
import { recordGiftAdminEvent } from "@/lib/gift-certificate/record-gift-admin-event";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function s(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function n(v: unknown): number {
  return Math.trunc(Number(v) || 0);
}

/** GET+POST /api/admin/gift-certificates/products */
export async function GET(req: NextRequest) {
  const gate = await requireAdminPermission("business");
  if (!gate.ok) return gate.response;

  const url = new URL(req.url);
  const storeId = url.searchParams.get("storeId")?.trim() || "";
  const scopeParam = (url.searchParams.get("scope") || url.searchParams.get("giftScope") || "ALL")
    .trim()
    .toUpperCase();

  let q = gate.sb
    .from(GIFT_TABLES.products)
    .select(
      "id, store_id, gift_scope, creation_source, application_id, title, face_value, purchase_price, platform_fee_rate, discount_funding_party, platform_funded_units, merchant_funded_units, transferable, sales_starts_at, sales_ends_at, active, archived_at, mall_visible, image_url, issued_count, max_issuance, created_at, updated_at, stores(store_name)"
    )
    .order("created_at", { ascending: false })
    .limit(200);
  if (storeId) q = q.eq("store_id", storeId);
  if (scopeParam === "STORE" || scopeParam === "PLATFORM") {
    q = q.eq("gift_scope", scopeParam);
  }

  const { data, error } = await q;
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  const productsRaw = (data ?? []) as Record<string, unknown>[];
  const productIds = productsRaw.map((r) => s(r.id)).filter(Boolean);
  const outstandingByProduct = new Map<string, number>();
  const redeemedByProduct = new Map<string, number>();
  const redeemedByStore = new Map<string, Map<string, { gross: number; fee: number; net: number }>>();

  if (productIds.length) {
    const { data: instances } = await gate.sb
      .from(GIFT_TABLES.instances)
      .select("id, product_id, remaining_balance, status")
      .in("product_id", productIds)
      .limit(5000);
    const instanceIds: string[] = [];
    const productByInstance = new Map<string, string>();
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
      const iid = s(r.id);
      instanceIds.push(iid);
      productByInstance.set(iid, pid);
    }
    if (instanceIds.length) {
      const { data: redemptions } = await gate.sb
        .from(GIFT_TABLES.redemptions)
        .select("instance_id, store_id, redeemed_amount, platform_fee_amount, merchant_net_amount, reversed")
        .in("instance_id", instanceIds.slice(0, 2000))
        .limit(5000);
      for (const raw of redemptions ?? []) {
        const r = raw as Record<string, unknown>;
        if (r.reversed === true) continue;
        const pid = productByInstance.get(s(r.instance_id));
        if (!pid) continue;
        const gross = Math.max(0, n(r.redeemed_amount));
        redeemedByProduct.set(pid, (redeemedByProduct.get(pid) ?? 0) + gross);
        const sid = s(r.store_id);
        if (!sid) continue;
        let byStore = redeemedByStore.get(pid);
        if (!byStore) {
          byStore = new Map();
          redeemedByStore.set(pid, byStore);
        }
        const prev = byStore.get(sid) ?? { gross: 0, fee: 0, net: 0 };
        byStore.set(sid, {
          gross: prev.gross + gross,
          fee: prev.fee + Math.max(0, n(r.platform_fee_amount)),
          net: prev.net + Math.max(0, n(r.merchant_net_amount)),
        });
      }
    }
  }

  const storeIdsForNames = new Set<string>();
  for (const m of redeemedByStore.values()) {
    for (const sid of m.keys()) storeIdsForNames.add(sid);
  }
  const storeNameById = new Map<string, string>();
  if (storeIdsForNames.size) {
    const { data: stores } = await gate.sb
      .from("stores")
      .select("id, store_name")
      .in("id", [...storeIdsForNames].slice(0, 500));
    for (const raw of stores ?? []) {
      const r = raw as Record<string, unknown>;
      storeNameById.set(s(r.id), s(r.store_name));
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
    const giftScope: GiftScope = s(row.gift_scope) === "PLATFORM" ? "PLATFORM" : "STORE";
    const byStore = redeemedByStore.get(id);
    const redemption_by_store = byStore
      ? [...byStore.entries()].map(([sid, agg]) => ({
          store_id: sid,
          store_name: storeNameById.get(sid) || "",
          gross: agg.gross,
          fee: agg.fee,
          net: agg.net,
        }))
      : [];
    const mallVisible = row.mall_visible !== false;
    const customerEval = evaluateGiftProductCustomerPurchaseEligibility({
      active: row.active === true,
      mall_visible: mallVisible,
      archived_at: row.archived_at == null ? null : s(row.archived_at),
      sales_starts_at: row.sales_starts_at == null ? null : s(row.sales_starts_at),
      sales_ends_at: row.sales_ends_at == null ? null : s(row.sales_ends_at),
      max_issuance: row.max_issuance == null ? null : n(row.max_issuance),
      issued_count: n(row.issued_count),
    });
    return {
      id,
      gift_scope: giftScope,
      creation_source: row.creation_source == null ? null : s(row.creation_source),
      store_id: giftScope === "PLATFORM" ? null : s(row.store_id) || null,
      store_name: giftScope === "PLATFORM" ? "" : storeName,
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
      archived_at: row.archived_at == null ? null : s(row.archived_at),
      mall_visible: mallVisible,
      image_url: row.image_url == null ? null : s(row.image_url),
      issued_count: n(row.issued_count),
      max_issuance: row.max_issuance == null ? null : n(row.max_issuance),
      created_at: s(row.created_at),
      updated_at: row.updated_at == null ? s(row.created_at) : s(row.updated_at),
      outstanding_balance: outstandingByProduct.get(id) ?? 0,
      redeemed_gross: redeemedByProduct.get(id) ?? 0,
      redemption_by_store,
      customer_purchasable: customerEval.eligible,
      customer_purchase_reason: customerEval.reason,
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
  const scopeRaw = String(body.giftScope ?? body.gift_scope ?? "STORE").trim().toUpperCase();
  if (!isGiftScope(scopeRaw)) {
    return NextResponse.json({ ok: false, error: "invalid_gift_scope" }, { status: 400 });
  }
  const giftScope: GiftScope = scopeRaw;

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
  const draftRequested = body.draft === true || body.active === false;
  // Approve path: applicationId → inactive draft (approve ≠ activate). Direct admin create may activate.
  const activate = applicationId
    ? false
    : draftRequested
      ? false
      : body.active !== false;
  const mallVisible = activate === true && body.mallVisible !== false && body.mall_visible !== false;

  if (!title || !Number.isFinite(faceValue) || faceValue <= 0 || !Number.isFinite(purchasePrice)) {
    return NextResponse.json({ ok: false, error: "invalid_product_fields" }, { status: 400 });
  }

  if (giftScope === "PLATFORM" && applicationId) {
    return NextResponse.json({ ok: false, error: "platform_rejects_application" }, { status: 400 });
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

  let storeId: string | null = String(body.storeId ?? body.store_id ?? "").trim() || null;
  if (applicationId) {
    if (giftScope !== "STORE") {
      return NextResponse.json({ ok: false, error: "application_requires_store_scope" }, { status: 400 });
    }
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

  const scopeStore = assertGiftScopeStoreId(giftScope, storeId);
  if (!scopeStore.ok) {
    return NextResponse.json({ ok: false, error: scopeStore.error }, { status: 400 });
  }

  const creationSource = resolveGiftCreationSource({ giftScope, applicationId });

  const { data, error } = await gate.sb
    .from(GIFT_TABLES.products)
    .insert({
      store_id: giftScope === "PLATFORM" ? null : storeId,
      gift_scope: giftScope,
      creation_source: creationSource,
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
      active: activate,
      mall_visible: mallVisible,
      archived_at: null,
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
    await recordGiftAdminEvent(gate.sb, {
      entityType: "application",
      entityId: applicationId,
      eventType: "APPLICATION_APPROVED_DRAFT_PRODUCT",
      operatorId: gate.actor.userId,
      after: { productId: String((data as { id?: string }).id ?? ""), active: false },
    });
  }

  await recordGiftAdminEvent(gate.sb, {
    entityType: "product",
    entityId: String((data as { id?: string }).id ?? ""),
    eventType: activate ? "PRODUCT_CREATED_ACTIVE" : "PRODUCT_CREATED_DRAFT",
    operatorId: gate.actor.userId,
    after: {
      active: activate,
      mall_visible: mallVisible,
      application_id: applicationId || null,
    },
  });

  return NextResponse.json({ ok: true, product: data }, { status: 201 });
}
