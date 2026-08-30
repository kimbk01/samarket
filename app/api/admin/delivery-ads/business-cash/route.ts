import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";
import {
  adminCreditBusinessCash,
  loadCampaignFundingRow,
  loadOwnerBusinessCashBalance,
} from "@/lib/stores/advertising/delivery-ad-business-cash-writer";
import { assertBusinessCashMoneyMinor } from "@/lib/stores/advertising/delivery-ad-business-cash-contract";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET ?ownerUserId=&campaignId=&product= — Admin funding visibility / balance. */
export async function GET(req: NextRequest) {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;
  const sb = tryGetSupabaseForStores();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  }

  const ownerUserId = req.nextUrl.searchParams.get("ownerUserId")?.trim() ?? "";
  const campaignId = req.nextUrl.searchParams.get("campaignId")?.trim() ?? "";
  const productRaw = req.nextUrl.searchParams.get("product");
  const product =
    productRaw === "banner" || productRaw === "store_sponsored" ? productRaw : null;

  const out: Record<string, unknown> = { ok: true };
  if (ownerUserId) {
    out.businessCash = await loadOwnerBusinessCashBalance(sb, ownerUserId, "PHP");
  }
  if (campaignId && product) {
    out.funding = await loadCampaignFundingRow(sb, {
      productKind: product,
      campaignId,
    });
  }
  return NextResponse.json(out);
}

/** POST — Admin Business Cash credit (auditable; required when no external top-up). */
export async function POST(req: NextRequest) {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;
  const sb = tryGetSupabaseForStores();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const ownerUserId = String(body.ownerUserId ?? "").trim();
  const amountMinor = Number(body.amountMinor);
  const reason = String(body.reason ?? "").trim();
  const nonce = String(body.nonce ?? crypto.randomUUID()).trim();
  if (!ownerUserId) {
    return NextResponse.json({ ok: false, error: "owner_required" }, { status: 400 });
  }
  if (!assertBusinessCashMoneyMinor(amountMinor)) {
    return NextResponse.json({ ok: false, error: "invalid_amount" }, { status: 400 });
  }
  if (!reason) {
    return NextResponse.json({ ok: false, error: "reason_required" }, { status: 400 });
  }

  const result = await adminCreditBusinessCash(sb, {
    adminUserId: admin.userId,
    ownerUserId,
    amountMinor,
    currency: String(body.currency ?? "PHP"),
    reason,
    nonce,
  });
  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: result.error, detail: result.detail },
      { status: result.error === "forbidden" ? 403 : 400 }
    );
  }
  return NextResponse.json({ ok: true, result });
}
