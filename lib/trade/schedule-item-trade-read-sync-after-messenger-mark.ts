/**
 * CM `mark_read` RPC 성공 후 `item_trade`·`product_chats` 원장 동기화를 응답 이후로 미룬다.
 * 메신저 participant 읽음은 RPC에서 이미 확정 — 본 작업은 거래 탭/목록 미읽음 힌트 정합용.
 *
 * - 동일 커서 TTL 중복 스케줄 억제
 * - 동일 user·CM 방 에 대해 background 실행 중이면 **마지막 요청만** pending 후 연속 처리
 *
 * @see syncItemTradeReadWithMessengerRoomMark
 */
import { after } from "next/server";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";
import {
  syncItemTradeReadWithMessengerRoomMark,
  type ItemTradeSyncWithMessengerMarkDiag,
} from "@/lib/trade/sync-item-trade-read-with-messenger-room";

function trimId(value: unknown): string {
  return String(value ?? "").trim();
}

const DEDUPE_TTL_MS = 5000;

/** 같은 커서로 TTL 안 재스케줄 */
const recentSchedule = new Map<string, number>();

function pruneScheduleMap(now: number): void {
  if (recentSchedule.size < 400) return;
  const cutoff = now - DEDUPE_TTL_MS * 4;
  for (const [k, t] of recentSchedule) {
    if (t < cutoff) recentSchedule.delete(k);
  }
}

export type ScheduleArgs = {
  userId: string;
  communityMessengerRoomId: string;
  communityMessengerLastReadMessageId: string | null;
  /** 있으면 브리지에서 CM 메시지 `created_at` 재조회 생략 */
  communityMessengerLastReadMessageCreatedAt?: string | null;
};

export type ScheduleItemTradeReadSyncAfterMessengerMarkResult = {
  scheduled: boolean;
  dedupeHit: boolean;
  skippedReason: string;
  /** user·room 단위로 이미 실행 중일 때 pending 만 갱신 */
  inflightCoalesce?: boolean;
  registry_background_inflight_key?: string;
};

type Slot = { pending: ScheduleArgs | null };

/** 동일 viewer·CM room 에 대해 한 번에 하나의 chain 만 실행 — pending 은 마지막 요청만 유지 */
const roomInflightSlots = new Map<string, Slot>();

export function scheduleItemTradeReadSyncAfterMessengerMark(
  args: ScheduleArgs
): ScheduleItemTradeReadSyncAfterMessengerMarkResult {
  const uid = trimId(args.userId);
  const cmId = trimId(args.communityMessengerRoomId);
  const cursor = trimId(args.communityMessengerLastReadMessageId) || null;
  const cursorKey = cursor ?? "__open_tail__";
  const inflightKey = `${uid}\0${cmId}`;

  if (!uid || !cmId) {
    return { scheduled: false, dedupeHit: false, skippedReason: "missing_ids" };
  }

  const dedupeKey = `${uid}\0${cmId}\0${cursorKey}`;
  const now = Date.now();
  pruneScheduleMap(now);
  const prevAt = recentSchedule.get(dedupeKey);
  if (prevAt != null && now - prevAt < DEDUPE_TTL_MS) {
    if (process.env.NODE_ENV === "development") {
      // eslint-disable-next-line no-console
      console.info("[cm-mark-read-trade-sync]", { phase: "dedupe_hit_same_cursor_ttl", dedupeKey });
    }
    return {
      scheduled: false,
      dedupeHit: true,
      skippedReason: "same_cursor_ttl",
      registry_background_inflight_key: inflightKey,
    };
  }
  recentSchedule.set(dedupeKey, now);

  const existing = roomInflightSlots.get(inflightKey);
  if (existing) {
    existing.pending = {
      userId: uid,
      communityMessengerRoomId: cmId,
      communityMessengerLastReadMessageId: cursor,
      communityMessengerLastReadMessageCreatedAt: args.communityMessengerLastReadMessageCreatedAt,
    };
    if (process.env.NODE_ENV === "development") {
      // eslint-disable-next-line no-console
      console.info("[cm-mark-read-trade-sync]", {
        phase: "registry_background_inflight_coalesce",
        inflightKey,
        pendingCursor: cursorKey,
      });
    }
    return {
      scheduled: false,
      dedupeHit: true,
      skippedReason: "inflight_room_chain_pending",
      inflightCoalesce: true,
      registry_background_inflight_key: inflightKey,
    };
  }

  const slot: Slot = { pending: null };
  roomInflightSlots.set(inflightKey, slot);

  const first: ScheduleArgs = {
    userId: uid,
    communityMessengerRoomId: cmId,
    communityMessengerLastReadMessageId: cursor,
    communityMessengerLastReadMessageCreatedAt: args.communityMessengerLastReadMessageCreatedAt,
  };

  after(async () => {
    let current: ScheduleArgs | null = first;
    try {
      while (current) {
        const tWall = typeof performance !== "undefined" ? performance.now() : Date.now();
        const diag: ItemTradeSyncWithMessengerMarkDiag = {};
        try {
          const sb = tryCreateSupabaseServiceClient();
          if (!sb) {
            // eslint-disable-next-line no-console
            console.warn("[cm-mark-read-trade-sync]", {
              phase: "no_service_role",
              userId: current.userId,
              cmRoomId: current.communityMessengerRoomId,
            });
            break;
          }
          await syncItemTradeReadWithMessengerRoomMark(
            sb,
            {
              userId: current.userId,
              communityMessengerRoomId: current.communityMessengerRoomId,
              communityMessengerLastReadMessageId: current.communityMessengerLastReadMessageId,
              communityMessengerLastReadMessageCreatedAt: current.communityMessengerLastReadMessageCreatedAt ?? undefined,
            },
            diag
          );
          const wallMs =
            typeof performance !== "undefined"
              ? Math.round(performance.now() - tWall)
              : Math.round(Date.now() - tWall);
          if (process.env.NODE_ENV === "development") {
            // eslint-disable-next-line no-console
            console.info("[cm-mark-read-trade-sync]", {
              phase: "background_done",
              inflightKey,
              wall_ms: wallMs,
              total_queries:
                (diag.unread_recalc_query_count ?? 0) + (diag.meta_fallback_query_count ?? 0),
              ...diag,
            });
          }
        } catch (err) {
          // eslint-disable-next-line no-console
          console.error("[cm-mark-read-trade-sync]", {
            phase: "background_error",
            err,
            inflightKey,
            userId: current.userId,
            cmRoomId: current.communityMessengerRoomId,
          });
        }

        const next = slot.pending;
        slot.pending = null;
        current = next;
      }
    } finally {
      roomInflightSlots.delete(inflightKey);
    }
  });

  return {
    scheduled: true,
    dedupeHit: false,
    skippedReason: "none",
    registry_background_inflight_key: inflightKey,
  };
}
