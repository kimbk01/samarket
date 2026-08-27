import { NextResponse } from "next/server";
import { getRouteUserId } from "@/lib/auth/get-route-user-id";
import { giftCertificateCancel } from "@/lib/gift-certificate/gift-certificate-rpc";
import { GIFT_TABLES } from "@/lib/gift-certificate/gift-certificate-schema";
import { notifyGiftTransferCancelled } from "@/lib/gift-certificate/notify-gift-transfer";
import { projectGiftTransferMessengerStatus } from "@/lib/gift-certificate/project-gift-transfer-messenger-status";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST /api/me/gift-certificates/transfers/[transferId]/cancel */
export async function POST(
  _req: Request,
  context: { params: Promise<{ transferId: string }> }
) {
  const userId = await getRouteUserId();
  if (!userId) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const { transferId } = await context.params;
  const tid = typeof transferId === "string" ? transferId.trim() : "";
  if (!tid) {
    return NextResponse.json({ ok: false, error: "missing_transfer_id" }, { status: 400 });
  }
  const sb = tryGetSupabaseForStores();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  }

  const { data: transferBeforeCancel } = await sb
    .from(GIFT_TABLES.transfers)
    .select("id, sender_user_id, recipient_user_id, room_id, instance_id")
    .eq("id", tid)
    .maybeSingle();

  const result = await giftCertificateCancel(sb, {
    senderUserId: userId,
    transferId: tid,
  });
  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: result.error, ...(result.data ?? {}) },
      { status: 400 }
    );
  }
  await projectGiftTransferMessengerStatus(sb, {
    transferId: tid,
    transferStatus: "CANCELLED",
  }).catch(() => {});
  const transfer = transferBeforeCancel as {
    sender_user_id?: string | null;
    recipient_user_id?: string | null;
    room_id?: string | null;
    instance_id?: string | null;
  } | null;
  await notifyGiftTransferCancelled(sb, {
    senderUserId: String(transfer?.sender_user_id ?? userId),
    recipientUserId: String(transfer?.recipient_user_id ?? ""),
    transferId: tid,
    roomId: transfer?.room_id ?? null,
    instanceId: String(transfer?.instance_id ?? ""),
  }).catch(() => {});
  return NextResponse.json({ ok: true, ...result.data });
}
