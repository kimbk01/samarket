import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { isAdminDeliveryAdProduct } from "@/lib/stores/advertising/admin-delivery-ad-contract";
import {
  listDeliveryAdOperationsMessages,
  sendDeliveryAdOperationsMessage,
} from "@/lib/stores/advertising/delivery-ad-operations-messaging";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ campaignId: string }> };

function statusFor(error: string): number {
  switch (error) {
    case "forbidden":
      return 403;
    case "campaign_not_found":
      return 404;
    case "invalid_body":
    case "invalid_identity":
      return 400;
    default:
      return 500;
  }
}

export async function GET(req: NextRequest, ctx: Ctx) {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;

  const sb = tryGetSupabaseForStores();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  }

  const { campaignId } = await ctx.params;
  const cid = typeof campaignId === "string" ? campaignId.trim() : "";
  if (!cid) return NextResponse.json({ ok: false, error: "missing_ids" }, { status: 400 });

  const url = new URL(req.url);
  const productKind = url.searchParams.get("productKind") ?? url.searchParams.get("product_kind");
  if (!isAdminDeliveryAdProduct(productKind)) {
    return NextResponse.json({ ok: false, error: "invalid_product" }, { status: 400 });
  }

  const result = await listDeliveryAdOperationsMessages(sb, {
    actorUserId: admin.userId,
    actorRole: "admin",
    productKind,
    campaignId: cid,
  });
  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: result.error },
      { status: statusFor(result.error) }
    );
  }
  return NextResponse.json({
    ok: true,
    caseId: result.caseId,
    threadId: result.threadId,
    messages: result.messages,
  });
}

export async function POST(req: NextRequest, ctx: Ctx) {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;

  const sb = tryGetSupabaseForStores();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  }

  const { campaignId } = await ctx.params;
  const cid = typeof campaignId === "string" ? campaignId.trim() : "";
  if (!cid) return NextResponse.json({ ok: false, error: "missing_ids" }, { status: 400 });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  if (
    "kind" in body ||
    "senderRole" in body ||
    "sender_role" in body ||
    "senderUserId" in body ||
    "sourceAuditId" in body ||
    "source_audit_id" in body
  ) {
    return NextResponse.json({ ok: false, error: "invalid_request" }, { status: 400 });
  }

  if (!isAdminDeliveryAdProduct(body.productKind)) {
    return NextResponse.json({ ok: false, error: "invalid_product" }, { status: 400 });
  }

  const result = await sendDeliveryAdOperationsMessage(sb, {
    actorUserId: admin.userId,
    actorRole: "admin",
    productKind: body.productKind,
    campaignId: cid,
    body: body.body ?? body.text,
  });
  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: result.error },
      { status: statusFor(result.error) }
    );
  }
  return NextResponse.json({
    ok: true,
    message: result.message,
    caseId: result.caseId,
    threadId: result.threadId,
    caseStatus: result.caseStatus,
  });
}
