import { NextRequest, NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/admin/require-admin-permission";
import { loadAdminGiftProductDetail } from "@/lib/gift-certificate/admin-gift-product-detail";
import {
  validateGiftProductExpiryPolicy,
  validateGiftProductFunding,
  type GiftDiscountFundingParty,
} from "@/lib/gift-certificate/gift-certificate-domain-contract";
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

type Ctx = { params: Promise<{ id: string }> };

/** GET /api/admin/gift-certificates/products/[id] — canonical product master detail. */
export async function GET(_req: NextRequest, ctx: Ctx) {
  const gate = await requireAdminPermission("business");
  if (!gate.ok) return gate.response;

  const id = s((await ctx.params).id);
  if (!id) return NextResponse.json({ ok: false, error: "id_required" }, { status: 400 });

  const detail = await loadAdminGiftProductDetail(gate.sb, id);
  if (!detail) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true, ...detail });
}

/** PATCH/DELETE /api/admin/gift-certificates/products/[id] */
export async function PATCH(req: NextRequest, ctx: Ctx) {
  const gate = await requireAdminPermission("business");
  if (!gate.ok) return gate.response;

  const id = s((await ctx.params).id);
  if (!id) return NextResponse.json({ ok: false, error: "id_required" }, { status: 400 });

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const { data: existing, error: loadErr } = await gate.sb
    .from(GIFT_TABLES.products)
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (loadErr) {
    return NextResponse.json({ ok: false, error: loadErr.message }, { status: 500 });
  }
  if (!existing) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }

  const before = existing as Record<string, unknown>;
  const action = s(body.action).toLowerCase();
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  let eventType = "PRODUCT_UPDATED";

  if (action === "activate") {
    patch.active = true;
    patch.archived_at = null;
    eventType = "PRODUCT_ACTIVATED";
  } else if (action === "pause" || action === "deactivate") {
    patch.active = false;
    eventType = "PRODUCT_PAUSED";
  } else if (action === "archive") {
    patch.active = false;
    patch.archived_at = new Date().toISOString();
    eventType = "PRODUCT_ARCHIVED";
  } else if (action === "unarchive") {
    patch.archived_at = null;
    eventType = "PRODUCT_UNARCHIVED";
  } else if (action === "hide") {
    patch.mall_visible = false;
    eventType = "PRODUCT_MALL_HIDDEN";
  } else if (action === "show" || action === "unhide") {
    patch.mall_visible = true;
    eventType = "PRODUCT_MALL_SHOWN";
  } else {
    if ("title" in body) {
      const title = s(body.title);
      if (!title) return NextResponse.json({ ok: false, error: "invalid_title" }, { status: 400 });
      patch.title = title;
    }
    if ("imageUrl" in body || "image_url" in body) {
      const imageUrl = s(body.imageUrl ?? body.image_url);
      patch.image_url = imageUrl || null;
    }
    if ("transferable" in body) {
      patch.transferable = body.transferable !== false;
    }
    if ("salesStartsAt" in body || "sales_starts_at" in body) {
      const v = s(body.salesStartsAt ?? body.sales_starts_at);
      if (v) patch.sales_starts_at = v;
    }
    if ("salesEndsAt" in body || "sales_ends_at" in body) {
      const raw = body.salesEndsAt ?? body.sales_ends_at;
      patch.sales_ends_at = raw == null || s(raw) === "" ? null : s(raw);
    }
    if ("active" in body && typeof body.active === "boolean") {
      patch.active = body.active;
      if (body.active) patch.archived_at = null;
    }
    if ("mallVisible" in body || "mall_visible" in body) {
      patch.mall_visible = body.mallVisible !== false && body.mall_visible !== false;
    }

    // Money fields: Product Master may change after issue; existing Instance snapshots stay immutable.
    const wantsMoney =
      "faceValue" in body ||
      "face_value" in body ||
      "purchasePrice" in body ||
      "purchase_price" in body ||
      "platformFeeRate" in body ||
      "platform_fee_rate" in body ||
      "discountFundingParty" in body ||
      "discount_funding_party" in body;

    if (wantsMoney) {
      const faceValue = Math.trunc(
        Number(body.faceValue ?? body.face_value ?? before.face_value)
      );
      const purchasePrice = Math.trunc(
        Number(body.purchasePrice ?? body.purchase_price ?? before.purchase_price)
      );
      const platformFeeRate = Math.trunc(
        Number(body.platformFeeRate ?? body.platform_fee_rate ?? before.platform_fee_rate ?? 0)
      );
      const discountFundingParty = String(
        body.discountFundingParty ?? body.discount_funding_party ?? before.discount_funding_party ?? "NONE"
      ) as GiftDiscountFundingParty;
      const platformFundedUnits = Math.trunc(
        Number(body.platformFundedUnits ?? body.platform_funded_units ?? before.platform_funded_units ?? 0)
      );
      const merchantFundedUnits = Math.trunc(
        Number(body.merchantFundedUnits ?? body.merchant_funded_units ?? before.merchant_funded_units ?? 0)
      );
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
      patch.face_value = faceValue;
      patch.purchase_price = purchasePrice;
      patch.platform_fee_rate = Math.max(0, Math.min(100, platformFeeRate));
      patch.discount_funding_party = discountFundingParty;
      patch.platform_funded_units = platformFundedUnits;
      patch.merchant_funded_units = merchantFundedUnits;
    }

    if ("maxIssuance" in body || "max_issuance" in body) {
      const raw = body.maxIssuance ?? body.max_issuance;
      patch.max_issuance =
        raw == null || raw === "" ? null : Math.max(1, Math.trunc(Number(raw) || 0));
    }

    const wantsExpiry =
      "expiryPolicy" in body ||
      "expiry_policy" in body ||
      "validityDays" in body ||
      "validity_days" in body ||
      "fixedValidUntil" in body ||
      "fixed_valid_until" in body;
    if (wantsExpiry) {
      const expiry = validateGiftProductExpiryPolicy({
        expiryPolicy: body.expiryPolicy ?? body.expiry_policy ?? before.expiry_policy ?? "NO_EXPIRY",
        validityDays: body.validityDays ?? body.validity_days ?? before.validity_days,
        fixedValidUntil: body.fixedValidUntil ?? body.fixed_valid_until ?? before.fixed_valid_until,
      });
      if (!expiry.ok) {
        return NextResponse.json({ ok: false, error: expiry.error }, { status: 400 });
      }
      patch.expiry_policy = expiry.expiryPolicy;
      patch.validity_days = expiry.validityDays;
      patch.fixed_valid_until = expiry.fixedValidUntil;
      eventType = "PRODUCT_EXPIRY_POLICY_UPDATED";
    }
  }

  const { data, error } = await gate.sb
    .from(GIFT_TABLES.products)
    .update(patch)
    .eq("id", id)
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  await recordGiftAdminEvent(gate.sb, {
    entityType: "product",
    entityId: id,
    eventType,
    operatorId: gate.actor.userId,
    before,
    after: data,
  });

  return NextResponse.json({ ok: true, product: data });
}

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  const gate = await requireAdminPermission("business");
  if (!gate.ok) return gate.response;

  const id = s((await ctx.params).id);
  if (!id) return NextResponse.json({ ok: false, error: "id_required" }, { status: 400 });

  const { count, error: countErr } = await gate.sb
    .from(GIFT_TABLES.instances)
    .select("id", { count: "exact", head: true })
    .eq("product_id", id);
  if (countErr) {
    return NextResponse.json({ ok: false, error: countErr.message }, { status: 500 });
  }
  if ((count ?? 0) > 0) {
    return NextResponse.json(
      { ok: false, error: "delete_forbidden_has_instances", instance_count: count },
      { status: 409 }
    );
  }

  const { data: existing } = await gate.sb.from(GIFT_TABLES.products).select("*").eq("id", id).maybeSingle();

  const { error } = await gate.sb.from(GIFT_TABLES.products).delete().eq("id", id);
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  await recordGiftAdminEvent(gate.sb, {
    entityType: "product",
    entityId: id,
    eventType: "PRODUCT_DELETED",
    operatorId: gate.actor.userId,
    before: existing,
  });

  return NextResponse.json({ ok: true, deleted: id });
}
