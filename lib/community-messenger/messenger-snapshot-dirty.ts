/**
 * 2026-11-21 메시지 보내기 2단계 — 사본 「바뀜 표시」 묶음 쓰기.
 * 설계: docs/audit/supabase-request-surge-2026-11-18/message-send-fanout-stage2-design-2026-11-21.md
 *
 * 받는 사람마다 홈 목록 사본·허브 배지 사본을 즉시 다시 만들던 것(사람당 RPC+저장 2번씩)을,
 * 같은 순간(마이크로태스크)에 모인 사람 전원에 대해 `mark_messenger_snapshots_dirty` **1번**으로 바꾼다.
 * 읽는 쪽은 바뀜 표시(invalidated_at > updated_at)를 보면 즉시 다시 만든다(오래된 값 응답 안 함).
 * 함수가 없거나 실패하면 그 사람들만 기존처럼 즉시 재생성한다.
 */
import { scheduleOwnerHubBadgeSnapshotRefresh } from "@/lib/chats/hub-badge-snapshot-refresh";
import { scheduleHomeSyncSnapshotRefresh } from "@/lib/community-messenger/home-sync-snapshot-refresh";
import { keepAliveAfterResponse } from "@/lib/push/keep-alive-after-response";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";

export const MARK_MESSENGER_SNAPSHOTS_DIRTY_RPC = "mark_messenger_snapshots_dirty";

const pendingHome = new Set<string>();
const pendingHub = new Set<string>();
let flushScheduled = false;

export type MessengerSnapshotKind = "home" | "hub";

export function enqueueMessengerSnapshotDirty(userId: string, kind: MessengerSnapshotKind): void {
  const uid = userId.trim();
  if (!uid) return;
  (kind === "home" ? pendingHome : pendingHub).add(uid);
  if (flushScheduled) return;
  flushScheduled = true;
  queueMicrotask(() => {
    flushScheduled = false;
    keepAliveAfterResponse(flushMessengerSnapshotDirty().catch(() => undefined));
  });
}

function fallbackEager(home: string[], hub: string[]): void {
  for (const uid of home) scheduleHomeSyncSnapshotRefresh(uid);
  for (const uid of hub) scheduleOwnerHubBadgeSnapshotRefresh(uid);
}

export async function flushMessengerSnapshotDirty(): Promise<void> {
  const home = [...pendingHome];
  const hub = [...pendingHub];
  pendingHome.clear();
  pendingHub.clear();
  if (home.length === 0 && hub.length === 0) return;
  const sb = tryCreateSupabaseServiceClient();
  if (!sb) {
    fallbackEager(home, hub);
    return;
  }
  try {
    const { data, error } = await sb.rpc(MARK_MESSENGER_SNAPSHOTS_DIRTY_RPC, {
      p_home_user_ids: home,
      p_hub_user_ids: hub,
    });
    const ok = !error && data && typeof data === "object" && (data as { ok?: unknown }).ok === true;
    if (!ok) fallbackEager(home, hub);
  } catch {
    fallbackEager(home, hub);
  }
}

/** 테스트 전용 */
export function peekPendingMessengerSnapshotDirtyForTests(): { home: string[]; hub: string[] } {
  return { home: [...pendingHome], hub: [...pendingHub] };
}

export {
  isMessengerSnapshotInvalidated,
  messengerSnapshotInvalidatedColumnAvailable,
  noteMessengerSnapshotInvalidatedColumnError,
} from "@/lib/community-messenger/messenger-snapshot-invalidated";
