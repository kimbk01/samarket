import { NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/admin/require-admin-permission";
import { giftCertificateConversionApprove } from "@/lib/gift-certificate/gift-certificate-rpc";
import { recordGiftAdminEvent } from "@/lib/gift-certificate/record-gift-admin-event";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST /api/admin/gift-certificates/conversions/[id]/approve */
export async function POST(
  _req: Request,
  context: { params: Promise<{ id: string }> }
) {
  const gate = await requireAdminPermission("business");
  if (!gate.ok) return gate.response;

  const { id } = await context.params;
  const requestId = typeof id === "string" ? id.trim() : "";
  if (!requestId) {
    return NextResponse.json({ ok: false, error: "missing_id" }, { status: 400 });
  }

  const result = await giftCertificateConversionApprove(gate.sb, {
    adminUserId: gate.actor.userId,
    requestId,
  });
  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: result.error, ...(result.data ?? {}) },
      { status: 400 }
    );
  }
  await recordGiftAdminEvent(gate.sb, {
    entityType: "conversion",
    entityId: requestId,
    eventType: "CONVERSION_APPROVED",
    operatorId: gate.actor.userId,
    after: result.data ?? null,
  });
  return NextResponse.json({ ok: true, ...result.data });
}
