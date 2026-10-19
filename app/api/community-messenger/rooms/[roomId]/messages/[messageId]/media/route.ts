import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import { enforceRateLimit, getRateLimitKey } from "@/lib/http/api-route";
import { messengerRoomCanonicalOrJsonError } from "@/lib/community-messenger/server/messenger-room-canonical-resolve-api";
import {
  decodeMessengerMediaObjectParam,
  MESSENGER_MEDIA_ROUTE_QUERY,
} from "@/lib/community-messenger/media/messenger-media-ref";
import {
  MESSENGER_MEDIA_REDIRECT_MAX_AGE_SEC,
  resolveMessengerMediaAccess,
  type MessengerMediaMessageRow,
} from "@/lib/community-messenger/server/messenger-media-access";
import {
  appendChatContentViewAudit,
  readChatAdminReason,
  requireAnyAdminPermission,
} from "@/lib/admin/chat-admin/chat-admin-guards";
import {
  CHAT_ADMIN_GHOST_REASON_MIN_LENGTH,
  CM_REPORT_OPEN_STATUSES,
  chatRoomAdminPermissionKeys,
  decideChatContentAccess,
  resolveCmRoomContentDomain,
} from "@/lib/admin/chat-admin/chat-content-access-policy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };

/**
 * GET — C-4 메신저 첨부 조회 (이미지·파일·음성·동영상 파일 · 1:1/그룹/거래/주문 공통).
 * Query: `o` = `{bucket}/{path}` (필수), `download` (첨부 파일명), `ctx=admin` (관리자 열람·감사),
 * `format=json` (302 대신 `{ ok, url, expiresInSec }` — 네이티브 저장·인앱 브라우저용), `reason` (관리자 고스트 열람 사유).
 * 참가자(또는 관리자 정책 통과) 확인 후 짧은 서명 URL 로 302. 읽음·unread·bump 계약과 무관(읽기 전용).
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ roomId: string; messageId: string }> }
) {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;

  const rateLimit = await enforceRateLimit({
    key: `community-messenger:media:${getRateLimitKey(req, auth.userId)}`,
    limit: 600,
    windowMs: 60_000,
    message: "첨부 요청이 너무 빠릅니다. 잠시 후 다시 시도해 주세요.",
    code: "community_messenger_media_rate_limited",
  });
  if (!rateLimit.ok) return rateLimit.response;

  const { roomId: rawRoomId, messageId: rawMessageId } = await params;
  const sp = req.nextUrl.searchParams;
  const object = decodeMessengerMediaObjectParam(sp.get(MESSENGER_MEDIA_ROUTE_QUERY.object));
  if (!object) {
    return NextResponse.json({ ok: false, error: "bad_object" }, { status: 400, headers: NO_STORE });
  }
  const adminContext = sp.get(MESSENGER_MEDIA_ROUTE_QUERY.ctx) === "admin";
  const wantsJson = sp.get(MESSENGER_MEDIA_ROUTE_QUERY.format) === "json";

  const sb = getSupabaseServer();
  const result = await resolveMessengerMediaAccess(
    {
      userId: auth.userId,
      rawRoomId: String(rawRoomId ?? ""),
      messageId: String(rawMessageId ?? ""),
      object,
      download: sp.get(MESSENGER_MEDIA_ROUTE_QUERY.download),
      adminContext,
    },
    {
      loadMessage: async (messageId) => {
        const { data, error } = await sb
          .from("community_messenger_messages")
          .select("id, room_id, content, metadata, deleted_at, deleted_for_everyone_at, is_hidden_by_admin")
          .eq("id", messageId)
          .maybeSingle();
        if (error || !data) return null;
        return data as MessengerMediaMessageRow;
      },
      isParticipant: async (roomId, userId) => {
        const { data } = await sb
          .from("community_messenger_participants")
          .select("id")
          .eq("room_id", roomId)
          .eq("user_id", userId)
          .maybeSingle();
        return Boolean(data);
      },
      resolveCanonicalRoomId: async (userId, raw) => {
        const canon = await messengerRoomCanonicalOrJsonError(userId, raw);
        return canon.ok ? canon.canonicalRoomId : null;
      },
      authorizeAdmin: async ({ roomId, messageId, object: obj }) => {
        const { data: roomMeta } = await sb
          .from("community_messenger_rooms")
          .select("id, room_type, chat_domain, direct_key")
          .eq("id", roomId)
          .maybeSingle();
        if (!roomMeta) return { ok: false, status: 404, error: "not_found" };
        const domain = resolveCmRoomContentDomain(
          roomMeta as { chat_domain?: string; room_type?: string; direct_key?: string }
        );
        /** 방 유형별 권한 단일 규칙 (거래 `products` · 배달 `business` 도 허용 — 설계 §2-2). */
        const admin = await requireAnyAdminPermission(chatRoomAdminPermissionKeys(domain));
        if (!admin.ok) return { ok: false, status: admin.response.status, error: "admin_forbidden", response: admin.response };
        const [{ count: openReportCount }, { data: linkedOrder }] = await Promise.all([
          admin.sb
            .from("community_messenger_reports")
            .select("id", { count: "exact", head: true })
            .eq("room_id", roomId)
            .in("status", [...CM_REPORT_OPEN_STATUSES]),
          admin.sb
            .from("store_orders")
            .select("id")
            .eq("community_messenger_room_id", roomId)
            .limit(1)
            .maybeSingle(),
        ]);
        const reason = readChatAdminReason(req);
        const decision = decideChatContentAccess({
          domain,
          hasOpenReport: Number(openReportCount ?? 0) > 0,
          linkedStoreOrder: Boolean((linkedOrder as { id?: string } | null)?.id),
          isSuperAdmin: admin.actor.isSuperAdmin,
          reason,
        });
        if (!decision.granted) {
          return {
            ok: false,
            status: 403,
            error: decision.denial,
            response: NextResponse.json(
              { ok: false, error: decision.denial, reasonMinLength: CHAT_ADMIN_GHOST_REASON_MIN_LENGTH },
              { status: 403, headers: NO_STORE }
            ),
          };
        }
        await appendChatContentViewAudit(admin.sb, req, {
          actorId: admin.actor.userId,
          targetType: "community_messenger_room",
          roomId,
          domain,
          basis: decision.basis,
          reason,
          scope: { surface: "admin_chat_media", messageId, bucket: obj.bucket, path: obj.path },
        });
        return { ok: true };
      },
      createSignedUrl: async ({ bucket, path, expiresInSec, download }) => {
        try {
          const { data, error } = await sb.storage
            .from(bucket)
            .createSignedUrl(path, expiresInSec, download ? { download } : undefined);
          return !error && data?.signedUrl ? data.signedUrl : null;
        } catch {
          return null;
        }
      },
    }
  );

  if (!result.ok) {
    if (result.response instanceof NextResponse) return result.response;
    return NextResponse.json({ ok: false, error: result.error }, { status: result.status, headers: NO_STORE });
  }

  if (wantsJson) {
    return NextResponse.json(
      { ok: true, url: result.signedUrl, expiresInSec: result.expiresInSec },
      { headers: NO_STORE }
    );
  }
  const res = NextResponse.redirect(result.signedUrl, 302);
  res.headers.set("Cache-Control", `private, max-age=${MESSENGER_MEDIA_REDIRECT_MAX_AGE_SEC}`);
  res.headers.set("Vary", "Cookie");
  res.headers.set("Referrer-Policy", "no-referrer");
  return res;
}
