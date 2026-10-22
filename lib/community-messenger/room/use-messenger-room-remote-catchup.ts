"use client";

import { useEffect, useMemo, useRef, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import { mergeRoomMessages } from "@/components/community-messenger/room/community-messenger-room-helpers";
import { communityMessengerRoomResourcePath } from "@/lib/community-messenger/messenger-room-bootstrap";
import type { CommunityMessengerMessage, CommunityMessengerRoomSnapshot } from "@/lib/community-messenger/types";
import { isUuidLikeString } from "@/lib/shared/uuid-string";
import { applyIncomingMessageEvent } from "@/lib/community-messenger/stores/messenger-realtime-store";
import {
  buildCommunityMessengerMessagesAfterPath,
  buildCommunityMessengerMessagesLatestPath,
  MESSENGER_ROOM_AFTER_CATCHUP_MAX_PAGES,
  runMessengerRoomCatchUpSingleFlight,
  selectNewestConfirmedMessageAnchor,
} from "@/lib/community-messenger/room/messenger-room-catchup-anchor";
import { isOpenRoomTerminalCatchUpPendingForRoom } from "@/lib/community-messenger/realtime/global-messenger-room-bundle-channel";

import type { MessengerRoomBootstrapRefreshFn } from "@/lib/community-messenger/room/use-messenger-room-bootstrap-lifecycle";

/** Hub tip after catch-up timeline merge — SSOT via applyIncomingMessageEvent → projectRoomActivityToHomeList. */
function projectHubTipAfterCatchUpMerge(args: {
  viewerUserId: string | null | undefined;
  roomId: string;
  message: CommunityMessengerMessage;
  roomSummary?: CommunityMessengerRoomSnapshot["room"] | null;
}): void {
  const rid = String(args.roomId ?? "").trim();
  const mid = String(args.message?.id ?? "").trim();
  if (!rid || !mid) return;
  applyIncomingMessageEvent({
    viewerUserId: args.viewerUserId?.trim() || null,
    roomId: rid,
    roomSummary: args.roomSummary ?? undefined,
    message: args.message,
    messageRow: {
      id: args.message.id,
      room_id: rid,
      sender_id: args.message.senderId,
      message_type: args.message.messageType,
      content: args.message.content,
      metadata: args.message.metadata ?? null,
      created_at: args.message.createdAt,
    },
  });
}

export type MessengerRoomBootstrapRefresh = MessengerRoomBootstrapRefreshFn;

/**
 * - `merged`: 서버 응답으로 행을 병합했다.
 * - `none`: 요청은 성공했고 새 행이 없다(이미 최신) — full/silent refresh 근거가 아니다.
 * - `rate_limited`: 429 — 백오프(재시도 폭주·refresh 금지).
 * - `failed`: 네트워크·5xx·기타.
 */
export type MessengerRoomCatchUpOutcome = "merged" | "none" | "rate_limited" | "failed";

type RoomMessage = CommunityMessengerMessage & { pending?: boolean };

export type MessengerRoomRemoteCatchupDeps = {
  roomId: string;
  streamRoomId: string;
  refresh: MessengerRoomBootstrapRefresh;
  snapshotRef: { current: CommunityMessengerRoomSnapshot | null };
  roomMessagesRef: { current: ReadonlyArray<RoomMessage> };
  setRoomMessages: Dispatch<SetStateAction<Array<RoomMessage>>>;
  /** 테스트 주입용 */
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  setTimer?: (fn: () => void, ms: number) => unknown;
};

export type MessengerRoomRemoteCatchupApi = {
  catchUpNewerMessages: () => Promise<boolean>;
  /** 결과 구분형 — "새 메시지 없음"(none)과 실패를 가른다. */
  catchUpNewerMessagesOutcome: () => Promise<MessengerRoomCatchUpOutcome>;
  reconcileLatestMessages: () => Promise<boolean>;
  catchUpAfterRemoteBump: (
    hintMessageId?: string | null,
    opts?: { alreadyMergedSnapshot?: boolean }
  ) => Promise<void>;
};

/** 단건 GET 429 이후 지연 정합 — Retry-After 를 따르되 상한/하한 고정. */
export const MESSENGER_BUMP_RATE_LIMIT_DEFAULT_DELAY_MS = 5_000;
const BUMP_RATE_LIMIT_MIN_DELAY_MS = 1_000;
const BUMP_RATE_LIMIT_MAX_DELAY_MS = 30_000;
/** 지연 정합에서 단건 재확인할 hint 상한(제자리 UPDATE 용 — INSERT 는 after= 가 커버). */
const BUMP_DEFERRED_HINTS_CAP = 8;
const BAD_ANCHORS_PER_ROOM_CAP = 32;

/**
 * `after=` 앵커가 viewer 기준 숨김/삭제(서버 404 `not_found`)된 id — 같은 앵커로 반복 404 →
 * refresh 루프를 막기 위해 방별로 기억하고 앵커 선택에서 제외한다.
 */
const unusableAfterAnchorsByRoom = new Map<string, Set<string>>();
type DeferredBumpReconcile = { hints: Set<string>; timer: unknown };
const deferredBumpReconcileByRoom = new Map<string, DeferredBumpReconcile>();

function roomKeyOf(id: string): string {
  return id.trim().toLowerCase();
}

function markUnusableAfterAnchor(roomId: string, anchorId: string): void {
  const key = roomKeyOf(roomId);
  let set = unusableAfterAnchorsByRoom.get(key);
  if (!set) {
    set = new Set();
    unusableAfterAnchorsByRoom.set(key, set);
  }
  set.add(anchorId);
  if (set.size > BAD_ANCHORS_PER_ROOM_CAP) {
    unusableAfterAnchorsByRoom.set(key, new Set([...set].slice(-Math.floor(BAD_ANCHORS_PER_ROOM_CAP / 2))));
  }
}

function isUnusableAfterAnchor(roomId: string, anchorId: string): boolean {
  return Boolean(unusableAfterAnchorsByRoom.get(roomKeyOf(roomId))?.has(anchorId));
}

/** 테스트 격리 */
export function resetMessengerRoomRemoteCatchupStateForTests(): void {
  unusableAfterAnchorsByRoom.clear();
  deferredBumpReconcileByRoom.clear();
}

function parseRetryAfterMs(res: Response): number {
  const raw = res.headers?.get?.("retry-after")?.trim() ?? "";
  const sec = raw ? Number(raw) : NaN;
  const ms = Number.isFinite(sec) && sec > 0 ? sec * 1000 : MESSENGER_BUMP_RATE_LIMIT_DEFAULT_DELAY_MS;
  return Math.min(BUMP_RATE_LIMIT_MAX_DELAY_MS, Math.max(BUMP_RATE_LIMIT_MIN_DELAY_MS, ms));
}

const sharedOutcomes = new WeakMap<Promise<boolean>, Promise<MessengerRoomCatchUpOutcome>>();

/** 결과 구분형 single-flight — 기존 boolean single-flight(`runMessengerRoomCatchUpSingleFlight`) 위에 얹는다. */
function runOutcomeSingleFlight(
  roomId: string,
  key: string,
  run: () => Promise<MessengerRoomCatchUpOutcome>
): Promise<MessengerRoomCatchUpOutcome> {
  let ran = false;
  let outcome: MessengerRoomCatchUpOutcome = "failed";
  const shared = runMessengerRoomCatchUpSingleFlight(roomId, key, async () => {
    ran = true;
    outcome = await run();
    return outcome === "merged";
  });
  const outcomeByFlight = sharedOutcomes.get(shared);
  if (outcomeByFlight) return outcomeByFlight;
  const p = shared.then((merged) => (ran ? outcome : merged ? "merged" : "failed"));
  sharedOutcomes.set(shared, p);
  return p;
}

/**
 * 탭 복귀·bump 후 증분 동기화: `after=` 페이지 및 단건 GET 재시도.
 * React 훅과 분리된 순수 팩토리 — 훅은 ref 로 감싸 식별자만 안정화한다(테스트 대상).
 */
export function createMessengerRoomRemoteCatchup(deps: MessengerRoomRemoteCatchupDeps): MessengerRoomRemoteCatchupApi {
  const { roomId, streamRoomId, refresh, snapshotRef, roomMessagesRef, setRoomMessages } = deps;
  const doFetch: typeof fetch = deps.fetchImpl ?? ((...a) => fetch(...a));
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const setTimer = deps.setTimer ?? ((fn: () => void, ms: number) => setTimeout(fn, ms));

  const mergeCatchUpRows = (roomKey: string, incoming: CommunityMessengerMessage[]) => {
    setRoomMessages((prev) => mergeRoomMessages(prev, incoming));
    const viewer = snapshotRef.current?.viewerUserId?.trim() || null;
    const roomSummary = snapshotRef.current?.room ?? null;
    for (const row of incoming) {
      projectHubTipAfterCatchUpMerge({
        viewerUserId: viewer,
        roomId: roomKey,
        message: row,
        roomSummary,
      });
    }
  };

  /** 마지막 429 의 Retry-After(ms) — 지연 정합 예약에 사용. */
  let lastRateLimitDelayMs = MESSENGER_BUMP_RATE_LIMIT_DEFAULT_DELAY_MS;

  const resolveRoomId = () => (snapshotRef.current?.room?.id?.trim() || roomId?.trim() || "").trim();

  /**
   * 최신 창 재조회 — 빈 방(앵커 없음)·복귀 정합.
   * `after=` 는 INSERT·created_at 커서라 통화 기록(created_at=통화 시작)·제자리 UPDATE 를 놓친다.
   */
  const reconcileLatestOutcome = (): Promise<MessengerRoomCatchUpOutcome> => {
    const id = resolveRoomId();
    if (!id) return Promise.resolve("failed");
    return runOutcomeSingleFlight(id, "latest", async () => {
      try {
        const res = await doFetch(buildCommunityMessengerMessagesLatestPath(id), {
          cache: "no-store",
          credentials: "include",
        });
        if (res.status === 429) return "rate_limited";
        const json = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          messages?: CommunityMessengerMessage[];
        };
        if (!res.ok || !json.ok || !Array.isArray(json.messages)) return "failed";
        if (json.messages.length === 0) return "none";
        mergeCatchUpRows(id, json.messages);
        return "merged";
      } catch {
        return "failed";
      }
    });
  };

  const reconcileLatestMessages = async (): Promise<boolean> => (await reconcileLatestOutcome()) === "merged";

  const catchUpNewerMessagesOutcome = (): Promise<MessengerRoomCatchUpOutcome> => {
    const id = resolveRoomId();
    if (!id) return Promise.resolve("failed");
    const confirmed = roomMessagesRef.current.filter(
      (m) => !m.pending && !isUnusableAfterAnchor(id, String(m.id ?? "").trim())
    );
    const anchorId = confirmed.length > 0 ? selectNewestConfirmedMessageAnchor(confirmed) : null;
    if (!anchorId) {
      /** 빈 방 첫 메시지(비친구 첫 통화 기록 등) — 앵커가 없으면 최신 페이지로 받는다. */
      return reconcileLatestOutcome();
    }
    return runOutcomeSingleFlight(id, anchorId, async () => {
      let cursor = anchorId;
      let mergedAny = false;
      for (let page = 0; page < MESSENGER_ROOM_AFTER_CATCHUP_MAX_PAGES; page++) {
        try {
          const res = await doFetch(buildCommunityMessengerMessagesAfterPath(id, cursor), {
            cache: "no-store",
            credentials: "include",
          });
          if (res.status === 429) return mergedAny ? "merged" : "rate_limited";
          const json = (await res.json().catch(() => ({}))) as {
            ok?: boolean;
            code?: string;
            messages?: CommunityMessengerMessage[];
            hasMore?: boolean;
          };
          if (res.status === 404 && json.code === "not_found" && page === 0) {
            /**
             * C-9: 앵커가 viewer 기준 숨김/삭제 → 같은 앵커 재시도는 영원히 404.
             * 앵커를 제외 목록에 넣고 최신 창 정합으로 대체(refresh 루프 금지).
             */
            markUnusableAfterAnchor(id, cursor);
            return reconcileLatestOutcome();
          }
          if (!res.ok || !json.ok || !Array.isArray(json.messages)) {
            return mergedAny ? "merged" : "failed";
          }
          if (json.messages.length === 0) break;
          const incoming = json.messages;
          mergeCatchUpRows(id, incoming);
          mergedAny = true;
          const nextCursor = selectNewestConfirmedMessageAnchor(incoming);
          if (!json.hasMore || !nextCursor || nextCursor === cursor) break;
          cursor = nextCursor;
        } catch {
          return mergedAny ? "merged" : "failed";
        }
      }
      return mergedAny ? "merged" : "none";
    });
  };

  const catchUpNewerMessages = async (): Promise<boolean> => (await catchUpNewerMessagesOutcome()) === "merged";

  const tryMergeSingleMessageFromBump = async (
    messageId: string,
    opts?: { maxAttempts?: number }
  ): Promise<"merged" | "rate_limited" | "failed"> => {
    const mid = String(messageId ?? "").trim();
    if (!mid || !isUuidLikeString(mid)) return "failed";
    /**
     * INSERT 직후 단건 GET 이 404/5xx 면 복제·커밋 레이스 가능 — 짧은 간격으로만 재시도.
     * (분당 72회 한도: 404/503 등에만 재시도·상한으로 폭주 방지. 429 는 즉시 중단 → 지연 정합)
     */
    const maxAttempts = opts?.maxAttempts ?? 14;
    const gapMs = 130;
    for (let i = 0; i < maxAttempts; i++) {
      const rid = (snapshotRef.current?.room?.id?.trim() || streamRoomId?.trim() || "").trim();
      if (!rid) return "failed";
      try {
        const res = await doFetch(
          `${communityMessengerRoomResourcePath(rid)}/messages/${encodeURIComponent(mid)}`,
          { cache: "no-store", credentials: "include" }
        );
        if (res.status === 429) {
          lastRateLimitDelayMs = parseRetryAfterMs(res);
          return "rate_limited";
        }
        const json = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          message?: CommunityMessengerMessage;
        };
        if (res.ok && json.ok && json.message) {
          const row = json.message;
          setRoomMessages((prev) => mergeRoomMessages(prev, [row]));
          projectHubTipAfterCatchUpMerge({
            viewerUserId: snapshotRef.current?.viewerUserId,
            roomId: rid,
            message: row,
            roomSummary: snapshotRef.current?.room ?? null,
          });
          return "merged";
        }
        const retryable = res.status === 404 || res.status === 503 || res.status >= 500;
        if (!retryable || i + 1 >= maxAttempts) return "failed";
      } catch {
        if (i + 1 >= maxAttempts) return "failed";
      }
      await sleep(gapMs);
    }
    return "failed";
  };
  /**
   * 429 백오프 — 방당 1개의 지연 정합만 예약(추가 bump 는 hint 만 누적). 지연 실행에서 다시 429 면 중단
   * (bounded: 재예약·refresh 없음). 스냅샷을 이미 병합한 bump 는 예약하지 않는다.
   */
  const scheduleDeferredBumpReconcile = (hint: string, delayMs: number) => {
    const key = roomKeyOf(resolveRoomId() || streamRoomId || "");
    if (!key) return;
    const existing = deferredBumpReconcileByRoom.get(key);
    if (existing) {
      if (hint && existing.hints.size < BUMP_DEFERRED_HINTS_CAP) existing.hints.add(hint);
      return;
    }
    const entry: DeferredBumpReconcile = { hints: new Set(hint ? [hint] : []), timer: null };
    deferredBumpReconcileByRoom.set(key, entry);
    entry.timer = setTimer(() => {
      if (deferredBumpReconcileByRoom.get(key) === entry) deferredBumpReconcileByRoom.delete(key);
      void (async () => {
        let needAfter = entry.hints.size === 0;
        for (const h of entry.hints) {
          const r = await tryMergeSingleMessageFromBump(h, { maxAttempts: 2 });
          if (r === "rate_limited") return;
          if (r !== "merged") needAfter = true;
        }
        if (needAfter) await catchUpNewerMessagesOutcome();
      })();
    }, delayMs);
  };

  /**
   * Remote bump = invalidation signal (not status authority).
   * Always reconcile by message id when hinted — `after=` only finds newer INSERTs, never
   * same-id metadata UPDATEs. Snapshot merge (if any) is acceleration only.
   */
  const catchUpAfterRemoteBump = async (
    hintMessageId?: string | null,
    opts?: { alreadyMergedSnapshot?: boolean }
  ): Promise<void> => {
    const hint = typeof hintMessageId === "string" ? hintMessageId.trim() : "";
    const alreadyMergedSnapshot = opts?.alreadyMergedSnapshot === true;
    const single = hint ? await tryMergeSingleMessageFromBump(hint) : "failed";
    if (single === "merged") {
      const merged = roomMessagesRef.current.find((m) => String(m.id ?? "").trim() === hint);
      const meta =
        merged?.metadata && typeof merged.metadata === "object"
          ? (merged.metadata as { domain?: unknown; orderStatus?: unknown })
          : null;
      if (meta?.domain === "store_order" && meta.orderStatus) {
        void refresh(true, { triggerReason: "store_order_status_bump" });
      }
      return;
    }
    if (single === "rate_limited") {
      /** C-4: 429 는 "실패"가 아니라 백오프 — after= 3회·refresh(true) 폭주 금지. */
      if (!alreadyMergedSnapshot) scheduleDeferredBumpReconcile(hint, lastRateLimitDelayMs);
      return;
    }
    /**
     * CUT-B: when open-room terminal catch-up already owns this burst, skip duplicate
     * after=/silent_delta. messages/{id} above remains the CUT-1 same-id path.
     * Miss/fallback: no pending coalesce → full catch-up below.
     */
    const pendingRoom = (snapshotRef.current?.room?.id?.trim() || streamRoomId?.trim() || roomId?.trim() || "").trim();
    if (pendingRoom && isOpenRoomTerminalCatchUpPendingForRoom(pendingRoom)) {
      return;
    }
    const backoffMs = [14, 32, 72];
    for (let attempt = 0; attempt < 3; attempt++) {
      if (attempt > 0) {
        await sleep(backoffMs[attempt - 1] ?? 72);
      }
      const outcome = await catchUpNewerMessagesOutcome();
      if (outcome === "merged") return;
      /** 스냅샷으로 이미 반영 + after= 가 "새 행 없음" → 정합 완료(성공). */
      if (outcome === "none" && alreadyMergedSnapshot) return;
      if (outcome === "rate_limited") {
        if (!alreadyMergedSnapshot) scheduleDeferredBumpReconcile(hint, MESSENGER_BUMP_RATE_LIMIT_DEFAULT_DELAY_MS);
        return;
      }
    }
    void refresh(true, { triggerReason: "realtime_bump_catchup" });
  };

  return { catchUpNewerMessages, catchUpNewerMessagesOutcome, reconcileLatestMessages, catchUpAfterRemoteBump };
}

/**
 * 탭 복귀·bump 후 증분 동기화: `after=` 페이지 및 단건 GET 재시도.
 * `useMessengerRoomClientPhase1` 의 catch-up 3개 — 함수 식별자는 room 이 바뀔 때만 바뀐다
 * (refresh 식별자 변화로 catch-up·bump 구독이 재실행되지 않게 ref 경유).
 */
export function useMessengerRoomRemoteCatchup({
  roomId,
  streamRoomId,
  refresh,
  snapshotRef,
  roomMessagesRef,
  setRoomMessages,
}: {
  roomId: string;
  streamRoomId: string;
  refresh: MessengerRoomBootstrapRefresh;
  snapshotRef: MutableRefObject<CommunityMessengerRoomSnapshot | null>;
  roomMessagesRef: MutableRefObject<Array<CommunityMessengerMessage & { pending?: boolean }>>;
  setRoomMessages: Dispatch<SetStateAction<Array<CommunityMessengerMessage & { pending?: boolean }>>>;
}): MessengerRoomRemoteCatchupApi {
  const refreshRef = useRef(refresh);
  useEffect(() => {
    refreshRef.current = refresh;
  }, [refresh]);
  return useMemo(
    () =>
      createMessengerRoomRemoteCatchup({
        roomId,
        streamRoomId,
        refresh: (silent, opts) => refreshRef.current(silent, opts),
        snapshotRef,
        roomMessagesRef,
        setRoomMessages,
      }),
    [roomId, streamRoomId, snapshotRef, roomMessagesRef, setRoomMessages]
  );
}
