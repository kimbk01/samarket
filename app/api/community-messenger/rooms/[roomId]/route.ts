import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { enforceRateLimit, getRateLimitKey } from "@/lib/http/api-route";
import type {
  CommunityMessengerMarkReadDiag,
  CommunityMessengerMarkReadResult,
} from "@/lib/community-messenger/service";
import { devPerfNow, logDevApiPerf } from "@/lib/dev/dev-api-perf-log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 동일 user·room·read 커서 동시 PATCH → 단일 mark+broadcast (실패 응답 공유 안 함). */
const communityMessengerMarkReadInflight = new Map<
  string,
  Promise<{
    result: CommunityMessengerMarkReadResult;
    diag: CommunityMessengerMarkReadDiag;
    broadcastMs: number;
    markWallMs: number;
    broadcastDuplicateDetected: number;
  }>
>();

function communityMessengerMarkReadInflightKey(
  userId: string,
  roomId: string,
  body: { flushOpen?: boolean; lastReadMessageId?: string | undefined }
): string {
  const mid = typeof body.lastReadMessageId === "string" ? body.lastReadMessageId.trim().toLowerCase() : "";
  /** 클라이언트는 항상 flushOpen 이지만, 커서가 있으면 키에 포함해야 다른 메시지 읽음이 직렬화되지 않는다 */
  if (mid) return `${userId}\0${roomId}\0mark\0${mid}`;
  if (body.flushOpen === true) return `${userId}\0${roomId}\0open_tail`;
  return `${userId}\0${roomId}\0cursor\0`;
}

/** 클라이언트 계약 — 응답 필드는 ok·error·lastReadAt·lastReadMessageId 만 유지 */
function jsonMarkReadResponse(result: CommunityMessengerMarkReadResult) {
  if (!result.ok) {
    return { ok: false as const, error: result.error ?? "room_read_failed" };
  }
  return {
    ok: true as const,
    lastReadAt: result.lastReadAt ?? null,
    lastReadMessageId: result.lastReadMessageId ?? null,
  };
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ roomId: string }> }
) {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;

  const rateLimit = await enforceRateLimit({
    key: `community-messenger:room-snapshot:${getRateLimitKey(req, auth.userId)}`,
    limit: 120,
    windowMs: 60_000,
    message: "대화방 정보 요청이 너무 빠릅니다. 잠시 후 다시 시도해 주세요.",
    code: "community_messenger_room_snapshot_rate_limited",
  });
  if (!rateLimit.ok) return rateLimit.response;

  const { messengerRoomCanonicalOrJsonError } = await import(
    "@/lib/community-messenger/server/messenger-room-canonical-resolve-api"
  );

  const { roomId: rawRoomId } = await params;
  const canon = await messengerRoomCanonicalOrJsonError(auth.userId, String(rawRoomId ?? "").trim());
  if (!canon.ok) {
    return canon.response;
  }
  const roomId = canon.canonicalRoomId;
  const rawLimit = req.nextUrl.searchParams.get("messages");
  const memberHydration = req.nextUrl.searchParams.get("memberHydration")?.trim().toLowerCase();
  const hydrateFullMemberList = memberHydration !== "minimal";
  const svc = await import("@/lib/community-messenger/service");
  const snapshot = await svc.getCommunityMessengerRoomSnapshot(auth.userId, roomId, {
    initialMessageLimit:
      rawLimit != null && rawLimit !== ""
        ? Math.floor(Number(rawLimit))
        : undefined,
    hydrateFullMemberList,
  });
  if (!snapshot) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true, ...snapshot });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ roomId: string }> }
) {
  const tPatchRouteStart = devPerfNow();
  const tAuth0 = devPerfNow();
  const auth = await requireAuthenticatedUserId();
  const patch_room_auth_ms = devPerfNow() - tAuth0;
  if (!auth.ok) return auth.response;

  const tRl0 = devPerfNow();
  const rateLimit = await enforceRateLimit({
    key: `community-messenger:room-patch:${getRateLimitKey(req, auth.userId)}`,
    limit: 120,
    windowMs: 60_000,
    message: "대화방 변경 요청이 너무 빠릅니다. 잠시 후 다시 시도해 주세요.",
    code: "community_messenger_room_patch_rate_limited",
  });
  const patch_room_rate_limit_ms = devPerfNow() - tRl0;
  if (!rateLimit.ok) return rateLimit.response;

  let body:
    | { action?: "invite"; memberIds?: string[] }
    | { action?: "participant_settings"; isMuted?: boolean; isPinned?: boolean }
    | { action?: "mark_read"; lastReadMessageId?: string; flushOpen?: boolean }
    | { action?: "archive"; archived?: boolean }
    | { action?: "group_notice"; noticeText?: string }
    | {
        action?: "group_permissions";
        allowMemberInvite?: boolean;
        allowAdminInvite?: boolean;
        allowAdminKick?: boolean;
        allowAdminEditNotice?: boolean;
        allowMemberUpload?: boolean;
        allowMemberCall?: boolean;
      }
    | { action?: "group_member_role"; targetUserId?: string; nextRole?: "admin" | "member" }
    | { action?: "group_owner_transfer"; targetUserId?: string }
    | { action?: "group_member_remove"; targetUserId?: string }
    | { action?: "context_meta"; contextMeta?: Record<string, unknown> };
  const tParse0 = devPerfNow();
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  const patch_room_body_parse_ms = devPerfNow() - tParse0;

  const { messengerRoomCanonicalOrJsonError } = await import(
    "@/lib/community-messenger/server/messenger-room-canonical-resolve-api"
  );

  const tPerm0 = devPerfNow();
  const { roomId: rawRoomId } = await params;
  const canon = await messengerRoomCanonicalOrJsonError(auth.userId, String(rawRoomId ?? "").trim());
  const patch_room_permission_ms = devPerfNow() - tPerm0;
  if (!canon.ok) {
    return canon.response;
  }
  const roomId = canon.canonicalRoomId;
  const svc = await import("@/lib/community-messenger/service");

  if (body.action === "invite") {
    const result = await svc.inviteCommunityMessengerGroupMembers({
      userId: auth.userId,
      roomId,
      memberIds: Array.isArray(body.memberIds) ? body.memberIds.map(String) : [],
    });
    return NextResponse.json(result, { status: result.ok ? 200 : 400 });
  }
  if (body.action === "participant_settings") {
    const result = await svc.updateCommunityMessengerParticipantSettings({
      userId: auth.userId,
      roomId,
      isMuted: typeof body.isMuted === "boolean" ? body.isMuted : undefined,
      isPinned: typeof body.isPinned === "boolean" ? body.isPinned : undefined,
    });
    return NextResponse.json(result, { status: result.ok ? 200 : 400 });
  }
  if (body.action === "mark_read") {
    try {
      const inflightKey = communityMessengerMarkReadInflightKey(auth.userId, roomId, body);
      const patch_room_inflight_dedupe_hit = communityMessengerMarkReadInflight.has(inflightKey) ? 1 : 0;
      let flight = communityMessengerMarkReadInflight.get(inflightKey);
      if (!flight) {
        flight = (async () => {
          const diag: CommunityMessengerMarkReadDiag = {};
          const tMark0 = devPerfNow();
          const result = await svc.markCommunityMessengerRoomAsRead({
            userId: auth.userId,
            roomId,
            lastReadMessageId: typeof body.lastReadMessageId === "string" ? body.lastReadMessageId : undefined,
            flushOpen: body.flushOpen === true,
            diag,
          });
          const markWallMs = devPerfNow() - tMark0;
          let broadcastMs = 0;
          let broadcastDuplicateDetected = 0;
          if (result.ok && !result.broadcastSkipped) {
            const tb = devPerfNow();
            const { publishCommunityMessengerReadAckFromServer } = await import(
              "@/lib/community-messenger/realtime/read-ack-broadcast-server"
            );
            const pub = await publishCommunityMessengerReadAckFromServer({
              roomId,
              readerUserId: auth.userId,
              lastReadMessageId: result.lastReadMessageId ?? null,
              lastReadAt: result.lastReadAt ?? null,
            });
            broadcastMs = devPerfNow() - tb;
            if (pub.deduped) broadcastDuplicateDetected = 1;
          }
          return { result, diag, broadcastMs, markWallMs, broadcastDuplicateDetected };
        })().finally(() => {
          communityMessengerMarkReadInflight.delete(inflightKey);
        });
        communityMessengerMarkReadInflight.set(inflightKey, flight);
      }
      const bundle = await flight;
      const { result, diag, broadcastMs, markWallMs, broadcastDuplicateDetected } = bundle;

      const patch_room_total_ms = devPerfNow() - tPatchRouteStart;
      const dbMs = (diag.rpc_ms ?? 0) + (diag.legacy_participant_update_ms ?? 0);
      const compareMs = diag.message_order_compare_ms ?? 0;
      const existingMs = diag.existing_read_fetch_ms ?? 0;
      const mrTotal = diag.mark_read_total_ms ?? markWallMs;
      const mrTrade = diag.mark_read_trade_sync_ms ?? diag.mark_read_registry_sync_ms ?? 0;
      const mrBadge = diag.mark_read_cache_invalidate_ms ?? 0;

      const bottleneckCandidates: Array<[string, number]> = [
        ["patch_room_auth_ms", patch_room_auth_ms],
        ["patch_room_rate_limit_ms", patch_room_rate_limit_ms],
        ["patch_room_body_parse_ms", patch_room_body_parse_ms],
        ["patch_room_permission_ms", patch_room_permission_ms],
        ["mark_read_fetch_existing_ms", diag.mark_read_fetch_existing_ms ?? existingMs],
        ["mark_read_compare_ms", diag.mark_read_compare_ms ?? compareMs],
        ["mark_read_db_update_ms", diag.mark_read_db_update_ms ?? dbMs],
        ["mark_read_registry_sync_ms", diag.mark_read_registry_sync_ms ?? 0],
        ["mark_read_trade_sync_ms", mrTrade],
        ["mark_read_cache_invalidate_ms", mrBadge],
        ["patch_room_broadcast_ms", broadcastMs],
        ["mark_read_total_ms", mrTotal],
        ["patch_room_mark_handler_wall_ms", markWallMs],
      ];
      let topKey = bottleneckCandidates[0][0];
      let topMs = bottleneckCandidates[0][1];
      for (const [k, v] of bottleneckCandidates) {
        if (v > topMs) {
          topKey = k;
          topMs = v;
        }
      }

      const schedOver = diag.registry_sync_schedule_overhead_ms ?? 0;
      const markReadBottleneckCandidates: Array<[string, number]> = [
        ["mark_read_fetch_existing_ms", diag.mark_read_fetch_existing_ms ?? existingMs],
        ["mark_read_compare_ms", diag.mark_read_compare_ms ?? compareMs],
        ["mark_read_db_update_ms", diag.mark_read_db_update_ms ?? dbMs],
        ["mark_read_registry_sync_ms", diag.mark_read_registry_sync_ms ?? 0],
        ["mark_read_trade_sync_ms", diag.mark_read_trade_sync_ms ?? 0],
        ["mark_read_cache_invalidate_ms", diag.mark_read_cache_invalidate_ms ?? 0],
        ["mark_read_duplicate_skip_ms", diag.mark_read_duplicate_skip_eval_ms ?? 0],
        ["registry_sync_schedule_overhead_ms", schedOver],
      ];
      let mrTopKey = markReadBottleneckCandidates[0][0];
      let mrTopMs = markReadBottleneckCandidates[0][1];
      for (const [k, v] of markReadBottleneckCandidates) {
        if (v > mrTopMs) {
          mrTopKey = k;
          mrTopMs = v;
        }
      }

      logDevApiPerf(
        "/api/community-messenger/rooms/[roomId] PATCH mark_read",
        {
          total_route_ms: Math.round(patch_room_total_ms),
          patch_room_total_ms: Math.round(patch_room_total_ms),
          patch_room_auth_ms: Math.round(patch_room_auth_ms),
          patch_room_rate_limit_ms: Math.round(patch_room_rate_limit_ms),
          patch_room_body_parse_ms: Math.round(patch_room_body_parse_ms),
          patch_room_permission_ms: Math.round(patch_room_permission_ms),
          mark_read_total_ms: Math.round(mrTotal),
          mark_read_fetch_existing_ms: Math.round(diag.mark_read_fetch_existing_ms ?? existingMs),
          mark_read_compare_ms: Math.round(diag.mark_read_compare_ms ?? compareMs),
          mark_read_unread_calc_ms: Math.round(diag.mark_read_unread_calc_ms ?? 0),
          mark_read_db_update_ms: Math.round(diag.mark_read_db_update_ms ?? dbMs),
          mark_read_registry_sync_ms: Math.round(diag.mark_read_registry_sync_ms ?? 0),
          mark_read_broadcast_prepare_ms: 0,
          mark_read_broadcast_send_ms: Math.round(broadcastMs),
          mark_read_cache_invalidate_ms: Math.round(mrBadge),
          mark_read_realtime_wait_ms: 0,
          mark_read_post_commit_ms: 0,
          mark_read_duplicate_skip_ms: Math.round(diag.mark_read_duplicate_skip_eval_ms ?? 0),
          registry_sync_schedule_overhead_ms: Math.round(schedOver),
          mark_read_existing_snapshot_cache_hit: diag.mark_read_existing_snapshot_cache_hit ?? 0,
          mark_read_existing_snapshot_lookup_ms: Math.round(diag.mark_read_existing_snapshot_lookup_ms ?? 0),
          mark_read_existing_snapshot_reuse: diag.mark_read_existing_snapshot_reuse ?? 0,
          mark_read_existing_snapshot_singleflight_hit: diag.mark_read_existing_snapshot_singleflight_hit ?? 0,
          snapshot_cache_hit: diag.snapshot_cache_hit ?? 0,
          snapshot_request_local_hit: diag.snapshot_request_local_hit ?? 0,
          snapshot_singleflight_hit: diag.snapshot_singleflight_hit ?? 0,
          registry_sync_total_ms: 0,
          registry_sync_db_ms: 0,
          registry_sync_rpc_ms: 0,
          registry_sync_unread_recalc_ms: 0,
          registry_sync_meta_fallback_ms: 0,
          registry_sync_cache_invalidate_ms: 0,
          mark_read_top_bottleneck_ms: Math.round(mrTopMs),
          patch_room_existing_read_fetch_ms: Math.round(existingMs),
          patch_room_message_order_compare_ms: Math.round(compareMs),
          patch_room_db_update_ms: Math.round(dbMs),
          patch_room_broadcast_ms: Math.round(broadcastMs),
          patch_room_payload_build_ms: 0,
          patch_room_mark_handler_wall_ms: Math.round(markWallMs),
          patch_room_top_bottleneck_ms: Math.round(topMs),
          patch_room_inflight_wait_ms: 0,
        },
        {
          patch_room_same_last_read_detected: result.sameLastReadDetected ? 1 : 0,
          patch_room_duplicate_ack_skipped: result.duplicateAckSkipped ? 1 : 0,
          patch_room_broadcast_skipped: result.broadcastSkipped ? 1 : 0,
          patch_room_last_read_advanced: result.ok && result.lastReadAdvanced === true ? 1 : 0,
          patch_room_regression_blocked: result.regressionBlocked ? 1 : 0,
          patch_room_top_bottleneck: topKey,
          patch_room_inflight_dedupe_hit: patch_room_inflight_dedupe_hit,
          patch_room_inflight_key: inflightKey,
          patch_room_broadcast_duplicate_detected: broadcastDuplicateDetected,
          mark_read_top_bottleneck: mrTopKey,
          mark_read_rpc_mode: diag.mark_read_rpc_mode ?? null,
          mark_read_existing_snapshot_cache_hit: diag.mark_read_existing_snapshot_cache_hit ?? 0,
          mark_read_existing_snapshot_lookup_ms: Math.round(diag.mark_read_existing_snapshot_lookup_ms ?? 0),
          mark_read_existing_snapshot_reuse: diag.mark_read_existing_snapshot_reuse ?? 0,
          mark_read_existing_snapshot_singleflight_hit: diag.mark_read_existing_snapshot_singleflight_hit ?? 0,
          mark_read_snapshot_cache_key: diag.mark_read_snapshot_cache_key ?? "",
          snapshot_cache_hit: diag.snapshot_cache_hit ?? 0,
          snapshot_request_local_hit: diag.snapshot_request_local_hit ?? 0,
          snapshot_singleflight_hit: diag.snapshot_singleflight_hit ?? 0,
          registry_sync_background_scheduled: diag.registry_sync_background_scheduled ?? 0,
          registry_sync_dedupe_hit: diag.registry_sync_dedupe_hit ?? 0,
          registry_sync_skipped_reason: diag.registry_sync_skipped_reason ?? "",
          registry_sync_required_for_response: diag.registry_sync_required_for_response ?? 0,
          registry_sync_broadcast_dependency: diag.registry_sync_broadcast_dependency ?? "",
          registry_sync_note:
            result.ok && result.lastReadAdvanced && !result.duplicateAckSkipped
              ? "item_trade_bridge_deferred_after_response_see_cm_mark_read_trade_sync_log"
              : "n/a",
        }
      );

      return NextResponse.json(jsonMarkReadResponse(result), { status: result.ok ? 200 : 400 });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      console.error("[mark_read_error]", e);
      return NextResponse.json({ ok: false, error: message }, { status: 500 });
    }
  }
  if (body.action === "archive") {
    const result = await svc.updateCommunityMessengerRoomArchiveState({
      userId: auth.userId,
      roomId,
      archived: typeof body.archived === "boolean" ? body.archived : true,
    });
    return NextResponse.json(result, { status: result.ok ? 200 : 400 });
  }
  if (body.action === "group_notice") {
    const result = await svc.updateCommunityMessengerPrivateGroupNotice({
      userId: auth.userId,
      roomId,
      noticeText: typeof body.noticeText === "string" ? body.noticeText : "",
    });
    return NextResponse.json(result, { status: result.ok ? 200 : 400 });
  }
  if (body.action === "group_permissions") {
    const result = await svc.updateCommunityMessengerPrivateGroupPermissions({
      userId: auth.userId,
      roomId,
      allowMemberInvite: typeof body.allowMemberInvite === "boolean" ? body.allowMemberInvite : undefined,
      allowAdminInvite: typeof body.allowAdminInvite === "boolean" ? body.allowAdminInvite : undefined,
      allowAdminKick: typeof body.allowAdminKick === "boolean" ? body.allowAdminKick : undefined,
      allowAdminEditNotice: typeof body.allowAdminEditNotice === "boolean" ? body.allowAdminEditNotice : undefined,
      allowMemberUpload: typeof body.allowMemberUpload === "boolean" ? body.allowMemberUpload : undefined,
      allowMemberCall: typeof body.allowMemberCall === "boolean" ? body.allowMemberCall : undefined,
    });
    return NextResponse.json(result, { status: result.ok ? 200 : 400 });
  }
  if (body.action === "group_member_role") {
    const result = await svc.setCommunityMessengerGroupMemberRole({
      userId: auth.userId,
      roomId,
      targetUserId: typeof body.targetUserId === "string" ? body.targetUserId : "",
      nextRole: body.nextRole === "admin" ? "admin" : "member",
    });
    return NextResponse.json(result, { status: result.ok ? 200 : 400 });
  }
  if (body.action === "group_owner_transfer") {
    const result = await svc.transferCommunityMessengerGroupOwner({
      userId: auth.userId,
      roomId,
      targetUserId: typeof body.targetUserId === "string" ? body.targetUserId : "",
    });
    return NextResponse.json(result, { status: result.ok ? 200 : 400 });
  }
  if (body.action === "group_member_remove") {
    const result = await svc.kickCommunityMessengerGroupMember({
      userId: auth.userId,
      roomId,
      targetUserId: typeof body.targetUserId === "string" ? body.targetUserId : "",
    });
    return NextResponse.json(result, { status: result.ok ? 200 : 400 });
  }
  if (body.action === "context_meta") {
    const raw = body.contextMeta;
    if (!raw || typeof raw !== "object") {
      return NextResponse.json({ ok: false, error: "invalid_context_meta" }, { status: 400 });
    }
    const { parseCommunityMessengerRoomContextMeta } = await import("@/lib/community-messenger/room-context-meta");
    let parsed;
    try {
      parsed = parseCommunityMessengerRoomContextMeta(JSON.stringify(raw));
    } catch {
      parsed = null;
    }
    if (!parsed) {
      return NextResponse.json({ ok: false, error: "invalid_context_meta" }, { status: 400 });
    }
    const result = await svc.updateCommunityMessengerRoomContextMeta({
      userId: auth.userId,
      roomId,
      contextMeta: parsed,
    });
    return NextResponse.json(result, { status: result.ok ? 200 : 400 });
  }
  {
    return NextResponse.json({ ok: false, error: "bad_action" }, { status: 400 });
  }
}
