import { NextRequest, NextResponse } from "next/server";
import { getRouteUserId } from "@/lib/auth/get-route-user-id";
import { giftCertificateOffer } from "@/lib/gift-certificate/gift-certificate-rpc";
import { GIFT_TABLES } from "@/lib/gift-certificate/gift-certificate-schema";
import { notifyGiftTransferOffered } from "@/lib/gift-certificate/notify-gift-transfer";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST /api/me/gift-certificates/transfers/offer */
export async function POST(req: NextRequest) {
  const userId = await getRouteUserId();
  if (!userId) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
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

  const instanceId = String(body.instanceId ?? "").trim();
  const recipientUserId = String(body.recipientUserId ?? "").trim();
  const roomIdRaw = String(body.roomId ?? "").trim();
  const idempotencyKey = String(body.idempotencyKey ?? "").trim();
  if (!instanceId || !recipientUserId || !idempotencyKey) {
    return NextResponse.json(
      { ok: false, error: "instanceId_recipientUserId_idempotencyKey_required" },
      { status: 400 }
    );
  }

  const result = await giftCertificateOffer(sb, {
    senderUserId: userId,
    instanceId,
    recipientUserId,
    roomId: roomIdRaw || null,
    idempotencyKey,
  });
  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: result.error, ...(result.data ?? {}) },
      { status: 400 }
    );
  }

  // Projection after financial commit — never invent ownership from chat alone.
  const transferId = String(result.data.transfer_id ?? result.data.id ?? "").trim();
  const roomId = roomIdRaw;
  if (transferId && roomId) {
    const { data: existingTransfer } = await sb
      .from(GIFT_TABLES.transfers)
      .select("messenger_message_id")
      .eq("id", transferId)
      .maybeSingle();
    const existingMsgId = String(
      (existingTransfer as { messenger_message_id?: string | null } | null)?.messenger_message_id ??
        ""
    ).trim();
    if (existingMsgId) {
      return NextResponse.json({ ok: true, ...result.data });
    }
    const { data: inst } = await sb
      .from(GIFT_TABLES.instances)
      .select(
        "id, store_id, face_value, remaining_balance, gift_certificate_products(title, image_url, stores(store_name))"
      )
      .eq("id", instanceId)
      .maybeSingle();
    const face = Math.trunc(Number((inst as { face_value?: number } | null)?.face_value ?? 0));
    const remaining = Math.trunc(
      Number((inst as { remaining_balance?: number } | null)?.remaining_balance ?? 0)
    );
    const storeId = String((inst as { store_id?: string } | null)?.store_id ?? "");
    const productRaw = (inst as { gift_certificate_products?: unknown } | null)?.gift_certificate_products;
    const productObj = Array.isArray(productRaw) ? productRaw[0] : productRaw;
    const product =
      productObj && typeof productObj === "object"
        ? (productObj as Record<string, unknown>)
        : null;
    const storesRaw = product?.stores;
    const storeObj = Array.isArray(storesRaw) ? storesRaw[0] : storesRaw;
    const storeName =
      storeObj && typeof storeObj === "object" && (storeObj as { store_name?: unknown }).store_name != null
        ? String((storeObj as { store_name: unknown }).store_name)
        : "";
    const title = product?.title != null ? String(product.title) : "";
    const imageUrl = product?.image_url == null ? null : String(product.image_url);
    const createdAt = new Date().toISOString();
    const preview = "Gift certificate";
    const { data: msg, error: msgErr } = await sb
      .from("community_messenger_messages")
      .insert({
        room_id: roomId,
        sender_id: userId,
        message_type: "gift_certificate",
        content: preview,
        metadata: {
          gift_transfer_id: transferId,
          instance_id: instanceId,
          store_id: storeId || undefined,
          store_name: storeName || undefined,
          title: title || undefined,
          image_url: imageUrl,
          face_value: face,
          remaining_balance: remaining,
          transfer_status: "PENDING",
        },
        created_at: createdAt,
      })
      .select("id")
      .maybeSingle();
    if (!msgErr && msg && typeof (msg as { id?: string }).id === "string") {
      const mid = String((msg as { id: string }).id);
      await sb
        .from(GIFT_TABLES.transfers)
        .update({ messenger_message_id: mid })
        .eq("id", transferId);
      await sb
        .from("community_messenger_rooms")
        .update({
          last_message: preview,
          last_message_at: createdAt,
          last_message_type: "gift_certificate",
          updated_at: createdAt,
        })
        .eq("id", roomId);
      await sb.rpc("community_messenger_apply_unread_for_text_message", {
        p_room_id: roomId,
        p_sender_id: userId,
        p_read_at: createdAt,
      });
      await notifyGiftTransferOffered(sb, {
        recipientUserId,
        senderUserId: userId,
        transferId,
        roomId,
        instanceId,
      }).catch(() => {});
      try {
        const { publishMessengerRoomBumpAfterMutation } = await import(
          "@/lib/community-messenger/server/publish-messenger-room-bump"
        );
        await publishMessengerRoomBumpAfterMutation({
          rawRouteRoomId: roomId,
          canonicalRoomId: roomId,
          fromUserId: userId,
          messageId: mid,
          messageCreatedAt: createdAt,
        });
      } catch {
        /* best-effort projection bump */
      }
    }
  }

  return NextResponse.json({ ok: true, ...result.data });
}
