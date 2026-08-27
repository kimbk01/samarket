import { NextRequest, NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/admin/require-admin-permission";
import { validateGiftProductFunding, type GiftDiscountFundingParty } from "@/lib/gift-certificate/gift-certificate-domain-contract";
import { GIFT_TABLES } from "@/lib/gift-certificate/gift-certificate-schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function s(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function n(v: unknown): number {
  return Math.trunc(Number(v) || 0);
}

type Ctx = { params: Promise<{ id: string }> };

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

  const issued = n((existing as Record<string, unknown>).issued_count);
  const action = s(body.action).toLowerCase();
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if (action === "activate") {
    patch.active = true;
    patch.archived_at = null;
  } else if (action === "pause" || action === "deactivate") {
    patch.active = false;
  } else if (action === "archive") {
    patch.active = false;
    patch.archived_at = new Date().toISOString();
  } else if (action === "unarchive") {
    patch.archived_at = null;
  } else {
    // Safe field edit
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

    // Face / purchase / fee: only when never issued
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
      if (issued > 0) {
        return NextResponse.json(
          { ok: false, error: "money_fields_locked_after_issuance" },
          { status: 409 }
        );
      }
      const faceValue = Math.trunc(
        Number(body.faceValue ?? body.face_value ?? (existing as Record<string, unknown>).face_value)
      );
      const purchasePrice = Math.trunc(
        Number(
          body.purchasePrice ??
            body.purchase_price ??
            (existing as Record<string, unknown>).purchase_price
        )
      );
      const platformFeeRate = Math.trunc(
        Number(
          body.platformFeeRate ??
            body.platform_fee_rate ??
            (existing as Record<string, unknown>).platform_fee_rate ??
            0
        )
      );
      const discountFundingParty = String(
        body.discountFundingParty ??
          body.discount_funding_party ??
          (existing as Record<string, unknown>).discount_funding_party ??
          "NONE"
      ) as GiftDiscountFundingParty;
      const platformFundedUnits = Math.trunc(
        Number(
          body.platformFundedUnits ??
            body.platform_funded_units ??
            (existing as Record<string, unknown>).platform_funded_units ??
            0
        )
      );
      const merchantFundedUnits = Math.trunc(
        Number(
          body.merchantFundedUnits ??
            body.merchant_funded_units ??
            (existing as Record<string, unknown>).merchant_funded_units ??
            0
        )
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

  const { error } = await gate.sb.from(GIFT_TABLES.products).delete().eq("id", id);
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, deleted: id });
}
