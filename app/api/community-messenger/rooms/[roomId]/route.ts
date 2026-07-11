import { NextRequest, NextResponse, after } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { ensureApiRouteAuthGate } from "@/lib/auth/ensure-api-route-auth-gate";
import { enforceRateLimit, getRateLimitKey } from "@/lib/http/api-route";
import type {
  CommunityMessengerMarkReadDiag,
  CommunityMessengerMarkReadResult,
} from "@/lib/community-messenger/service";
import { devPerfNow, logDevApiPerf } from "@/lib/dev/dev-api-perf-log";
import { warnMarkReadPerformanceLockIfNeeded } from "@/lib/community-messenger/mark-read-performance-lock";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 동일 user·room·read 커서 동시 PATCH → 단일 mark+broadcast (실패 응답 공유 안 함). */
const communityMessengerMarkReadInflight = new Map<
  string,
  Promise<{
    result: CommunityMessengerMarkReadResult;
    diag: CommunityMessengerMarkReadDiag;
    markWallMs: number;
  }>
>();

const MARK_READ_INFLIGHT_RESULT_TTL_MS = (() => {
  const n = Number(process.env.SAMARKET_MARK_READ_INFLIGHT_RESULT_TTL_MS);
  if (Number.isFinite(n) && n >= 300 && n <= 500) return Math.floor(n);
  return 400;
})();

const communityMessengerMarkReadRecentResult = new Map<
  string,
  {
    expiresAt: number;
    bundle: {
      result: CommunityMessengerMarkReadResult;
      diag: CommunityMessengerMarkReadDiag;
      markWallMs: number;
    };
  }
>();

type MarkReadInflightBundle = {
  result: CommunityMessengerMarkReadResult;
  diag: CommunityMessengerMarkReadDiag;
  markWallMs: number;
};

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

  const {
    messengerRoomCanonicalOrJsonError,
    seedMessengerRoomMembershipFromRouteCanonical,
  } = await import("@/lib/community-messenger/server/messenger-room-canonical-resolve-api");

  const { roomId: rawRoomId } = await params;
  const rawRouteRoomId = String(rawRoomId ?? "").trim();
  const canon = await messengerRoomCanonicalOrJsonError(auth.userId, rawRouteRoomId);
  if (!canon.ok) {
    return canon.response;
  }
  seedMessengerRoomMembershipFromRouteCanonical(auth.userId, rawRouteRoomId, canon.canonicalRoomId);
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
  const authGate = await ensureApiRouteAuthGate();
  const patch_room_auth_ms = devPerfNow() - tAuth0;
  if (!authGate.ok) return authGate.response;
  const auth = { ok: true as const, userId: authGate.userId };
  const patch_room_auth_cache_hit = authGate.auth_cache_hit;

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

  const {
    messengerRoomCanonicalOrJsonError,
    seedMessengerRoomMembershipFromRouteCanonical,
  } = await import("@/lib/community-messenger/server/messenger-room-canonical-resolve-api");

  const tPerm0 = devPerfNow();
  const { roomId: rawRoomId } = await params;
  const rawRouteRoomId = String(rawRoomId ?? "").trim();
  const canon = await messengerRoomCanonicalOrJsonError(auth.userId, rawRouteRoomId);
  const patch_room_permission_ms = devPerfNow() - tPerm0;
  const permission_query_ms = canon.permission_query_ms;
  const membership_cache_hit = canon.membership_cache_hit;
  const permissionBreakdown = {
    permission_cache_lookup_ms: canon.permission_cache_lookup_ms,
    permission_db_query_ms: canon.permission_db_query_ms,
    permission_profile_join_ms: canon.permission_profile_join_ms,
    permission_room_fetch_ms: canon.permission_room_fetch_ms,
    permission_canonical_build_ms: canon.permission_canonical_build_ms,
    permission_cache_store_ms: canon.permission_cache_store_ms,
    permission_source: canon.permission_source,
    permission_cache_reason: canon.permission_cache_reason,
  };
  if (!canon.ok) {
    return canon.response;
  }
  seedMessengerRoomMembershipFromRouteCanonical(auth.userId, rawRouteRoomId, canon.canonicalRoomId);
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
      let patch_room_inflight_dedupe_hit = 0;
      let bundle: MarkReadInflightBundle;

      const recent = communityMessengerMarkReadRecentResult.get(inflightKey);
      if (recent && recent.expiresAt > Date.now()) {
        patch_room_inflight_dedupe_hit = 1;
        bundle = recent.bundle;
      } else {
        let flight = communityMessengerMarkReadInflight.get(inflightKey);
        if (flight) {
          patch_room_inflight_dedupe_hit = 1;
        } else {
          flight = (async () => {
            const diag: CommunityMessengerMarkReadDiag = {
              permission_query_ms,
              ...permissionBreakdown,
              membership_cache_hit,
              optimistic_ack_possible: 1,
            };
            const tMark0 = devPerfNow();
            const result = await svc.markCommunityMessengerRoomAsRead({
              userId: auth.userId,
              roomId,
              lastReadMessageId: typeof body.lastReadMessageId === "string" ? body.lastReadMessageId : undefined,
              flushOpen: body.flushOpen === true,
              diag,
            });
            const markWallMs = devPerfNow() - tMark0;
            return { result, diag, markWallMs };
          })().finally(() => {
            communityMessengerMarkReadInflight.delete(inflightKey);
          });
          communityMessengerMarkReadInflight.set(inflightKey, flight);
        }
        bundle = await flight!;
        communityMessengerMarkReadRecentResult.set(inflightKey, {
          expiresAt: Date.now() + MARK_READ_INFLIGHT_RESULT_TTL_MS,
          bundle,
        });
      }
      const { result, diag, markWallMs } = bundle;

      if (result.ok) {
        try {
          const { getSupabaseServer } = await import("@/lib/chat/supabase-server");
          const { clearMessengerRoomNotificationTargetAfterRead } = await import(
            "@/lib/notifications/notification-target-messenger-bridge"
          );
          await clearMessengerRoomNotificationTargetAfterRead(getSupabaseServer(), auth.userId, roomId);
        } catch {
          /* badge target clear best-effort */
        }
        after(async () => {
          try {
            const { getSupabaseServer } = await import("@/lib/chat/supabase-server");
            const { runLegacyRoomReadNotificationEngineAdapter } = await import(
              "@/lib/notifications/engine/adapters/legacy-room-read-adapter"
            );
            await runLegacyRoomReadNotificationEngineAdapter(getSupabaseServer(), {
              userId: auth.userId,
              roomId,
              lastReadMessageId: result.lastReadMessageId ?? null,
              readAt: result.lastReadAt ?? new Date().toISOString(),
              causation: "legacy_patch_mark_read",
            });
          } catch {
            /* notification engine shadow */
          }
        });
      }

      const tBeforeResponse = devPerfNow();
      const response_before_broadcast = 1;
      const broadcastDuplicateDetected = 0;

      if (result.ok && !result.broadcastSkipped) {
        const broadcastPayload = {
          roomId,
          readerUserId: auth.userId,
          lastReadMessageId: result.lastReadMessageId ?? null,
          lastReadAt: result.lastReadAt ?? null,
        };
        after(async () => {
          const tPost0 = devPerfNow();
          let emitMs = 0;
          let waitMs = 0;
          let deduped = 0;
          try {
            const { publishCommunityMessengerReadAckFromServer } = await import(
              "@/lib/community-messenger/realtime/read-ack-broadcast-server"
            );
            const pub = await publishCommunityMessengerReadAckFromServer(broadcastPayload);
            emitMs = pub.broadcast_emit_ms ?? 0;
            waitMs = pub.broadcast_wait_ms ?? 0;
            if (pub.deduped) deduped = 1;
          } catch {
            /* best-effort — HTTP 응답·낙관 UI는 이미 확정 */
          } finally {
            const postMs = Math.round(devPerfNow() - tPost0);
            logDevApiPerf(
              "/api/community-messenger/rooms/[roomId] PATCH mark_read post_response",
              {
                post_response_work_ms: postMs,
                broadcast_after_response_ms: postMs,
                broadcast_emit_ms: emitMs,
                broadcast_wait_ms: waitMs,
                response_before_broadcast: 1,
              },
              {
                roomId,
                patch_room_broadcast_duplicate_detected: deduped,
              }
            );
          }
        });
      }

      const patch_room_total_ms = devPerfNow() - tPatchRouteStart;
      const patch_room_response_wall_ms = Math.round(tBeforeResponse - tPatchRouteStart);
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
        ["permission_query_ms", permission_query_ms],
        ["mark_read_fetch_existing_ms", diag.mark_read_fetch_existing_ms ?? existingMs],
        ["mark_read_compare_ms", diag.mark_read_compare_ms ?? compareMs],
        ["mark_read_db_update_ms", diag.mark_read_db_update_ms ?? dbMs],
        ["mark_read_registry_sync_ms", diag.mark_read_registry_sync_ms ?? 0],
        ["mark_read_trade_sync_ms", mrTrade],
        ["mark_read_cache_invalidate_ms", mrBadge],
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
          patch_room_auth_cache_hit: patch_room_auth_cache_hit,
          patch_room_rate_limit_ms: Math.round(patch_room_rate_limit_ms),
          patch_room_body_parse_ms: Math.round(patch_room_body_parse_ms),
          patch_room_permission_ms: Math.round(patch_room_permission_ms),
          permission_query_ms: Math.round(permission_query_ms),
          membership_cache_hit,
          permission_cache_lookup_ms: Math.round(permissionBreakdown.permission_cache_lookup_ms),
          permission_db_query_ms: Math.round(permissionBreakdown.permission_db_query_ms),
          permission_profile_join_ms: Math.round(permissionBreakdown.permission_profile_join_ms),
          permission_room_fetch_ms: Math.round(permissionBreakdown.permission_room_fetch_ms),
          permission_canonical_build_ms: Math.round(permissionBreakdown.permission_canonical_build_ms),
          permission_cache_store_ms: Math.round(permissionBreakdown.permission_cache_store_ms),
          mark_read_total_ms: Math.round(mrTotal),
          mark_read_fetch_existing_ms: Math.round(diag.mark_read_fetch_existing_ms ?? existingMs),
          mark_read_compare_ms: Math.round(diag.mark_read_compare_ms ?? compareMs),
          mark_read_unread_calc_ms: Math.round(diag.mark_read_unread_calc_ms ?? 0),
          mark_read_db_update_ms: Math.round(diag.mark_read_db_update_ms ?? dbMs),
          mark_read_registry_sync_ms: Math.round(diag.mark_read_registry_sync_ms ?? 0),
          mark_read_broadcast_prepare_ms: 0,
          mark_read_broadcast_send_ms: 0,
          broadcast_emit_ms: 0,
          broadcast_wait_ms: 0,
          broadcast_after_response_ms: 0,
          response_before_broadcast,
          post_response_work_ms: 0,
          patch_room_response_wall_ms,
          db_update_round_trip_ms: Math.round(diag.db_update_round_trip_ms ?? dbMs),
          ack_coalesce_hit: diag.ack_coalesce_hit ?? 0,
          optimistic_ack_possible: diag.optimistic_ack_possible ?? 1,
          snapshot_lookup_cache_hit: diag.snapshot_lookup_cache_hit ?? diag.mark_read_existing_snapshot_cache_hit ?? 0,
          mark_read_combined_rpc_ms: Math.round(diag.mark_read_combined_rpc_ms ?? 0),
          mark_read_combined_rpc_used: diag.mark_read_combined_rpc_used ?? 0,
          mark_read_fetch_existing_eliminated: diag.mark_read_fetch_existing_eliminated ?? 0,
          mark_read_db_round_trips: diag.mark_read_db_round_trips ?? 0,
          mark_read_cold_open_path: diag.mark_read_cold_open_path ?? 0,
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
          patch_room_broadcast_ms: 0,
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
          inflight_dedupe_hit: patch_room_inflight_dedupe_hit,
          duplicate_fast_path: diag.duplicate_fast_path ?? 0,
          fetch_existing_skipped: diag.fetch_existing_skipped ?? 0,
          snapshot_source: diag.snapshot_source ?? "",
          permission_source: permissionBreakdown.permission_source,
          permission_cache_reason: permissionBreakdown.permission_cache_reason,
          dedupe_hit: patch_room_inflight_dedupe_hit || broadcastDuplicateDetected ? 1 : 0,
          coalesce_hit: diag.ack_coalesce_hit ?? 0,
          mark_read_combined_rpc_used: diag.mark_read_combined_rpc_used ?? 0,
          mark_read_combined_rpc_mode: diag.mark_read_combined_rpc_mode ?? "legacy_two_round",
          mark_read_cold_open_path: diag.mark_read_cold_open_path ?? 0,
          mark_read_fetch_existing_eliminated: diag.mark_read_fetch_existing_eliminated ?? 0,
          response_before_broadcast,
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

      const expectSeededPermission =
        membership_cache_hit === 1 &&
        (permissionBreakdown.permission_cache_reason === "hit" ||
          permissionBreakdown.permission_source === "membership_cache");
      warnMarkReadPerformanceLockIfNeeded({
        sample: {
          permission_query_ms: Math.round(permission_query_ms),
          membership_cache_hit: membership_cache_hit === 1 ? 1 : 0,
          permission_source: permissionBreakdown.permission_source,
          permission_cache_reason: permissionBreakdown.permission_cache_reason,
          mark_read_combined_rpc_used: diag.mark_read_combined_rpc_used === 1 ? 1 : 0,
          mark_read_fetch_existing_ms: Math.round(diag.mark_read_fetch_existing_ms ?? existingMs),
          mark_read_db_round_trips: diag.mark_read_db_round_trips ?? 0,
          mark_read_combined_rpc_ms: Math.round(diag.mark_read_combined_rpc_ms ?? 0),
          patch_room_response_wall_ms,
          response_before_broadcast: response_before_broadcast === 1 ? 1 : 0,
          patch_room_inflight_dedupe_hit: patch_room_inflight_dedupe_hit === 1 ? 1 : 0,
          patch_room_duplicate_ack_skipped: result.duplicateAckSkipped ? 1 : 0,
          mark_read_cold_open_path: diag.mark_read_cold_open_path === 1 ? 1 : 0,
          expect_seeded_permission: expectSeededPermission,
          expect_cold_combined_open:
            body.flushOpen === true &&
            !result.duplicateAckSkipped &&
            (diag.mark_read_cold_open_path === 1 || (diag.mark_read_combined_rpc_used ?? 0) === 1),
        },
        requestKey: `${roomId}:${diag.mark_read_combined_rpc_used}:${membership_cache_hit}:${result.duplicateAckSkipped ? "dup" : "open"}`,
      });

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
