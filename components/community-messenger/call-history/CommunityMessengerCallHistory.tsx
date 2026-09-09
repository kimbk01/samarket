"use client";

import { useEffect } from "react";
import { useSyncExternalStore } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { CommunityMessengerCallRow } from "@/components/community-messenger/call-history/CommunityMessengerCallRow";
import {
  communityMessengerCallLogSwipeItemId,
  shouldCloseCallLogSwipeOnOutsidePointerDown,
} from "@/lib/community-messenger/call-history/call-log-swipe";
import { mergeCallHistoryForHomeList } from "@/lib/community-messenger/call-history/call-history-merge";
import { sortCallHistoryEntries } from "@/lib/community-messenger/call-history/call-history-sorter";
import {
  isOutgoingCallStartBlocked,
  subscribeCallActionLock,
} from "@/lib/call/call-action-lock";
import { logCallButtonState } from "@/lib/community-messenger/call-engine/call-engine-audit-log";
import {
  getActiveCallSessionCallId,
  subscribeActiveCallSession,
} from "@/lib/call/active-call-session";
import type { CommunityMessengerCallLog } from "@/lib/community-messenger/types";

type Props = {
  calls: CommunityMessengerCallLog[];
  loading?: boolean;
  error?: string | null;
  onNavigate: (call: CommunityMessengerCallLog) => void;
  onRequestOutgoingConfirm: (call: CommunityMessengerCallLog, kind: "voice" | "video") => void;
  onDeleteRequest: (call: CommunityMessengerCallLog) => void;
  openedSwipeItemId: string | null;
  onOpenSwipeItem: (id: string | null) => void;
  onListScrollStart?: () => void;
  /** CUT-2B keyset Load more */
  hasMore?: boolean;
  loadingMore?: boolean;
  loadMoreError?: string | null;
  onLoadMore?: () => void;
};

function useCallHistoryRedialBlocked(): boolean {
  useSyncExternalStore(subscribeActiveCallSession, () => isOutgoingCallStartBlocked(), () => false);
  useSyncExternalStore(subscribeCallActionLock, () => isOutgoingCallStartBlocked(), () => false);
  const blocked = isOutgoingCallStartBlocked();
  if (blocked) {
    logCallButtonState({ location: "call_history_redial" });
  }
  return blocked;
}

export function CommunityMessengerCallHistory({
  calls,
  loading = false,
  error = null,
  onNavigate,
  onRequestOutgoingConfirm,
  onDeleteRequest,
  openedSwipeItemId,
  onOpenSwipeItem,
  onListScrollStart,
  hasMore = false,
  loadingMore = false,
  loadMoreError = null,
  onLoadMore,
}: Props) {
  const { t, safeT } = useI18n();
  const globalRedialBlocked = useCallHistoryRedialBlocked();
  useSyncExternalStore(subscribeActiveCallSession, getActiveCallSessionCallId, () => null);

  const merged = mergeCallHistoryForHomeList(sortCallHistoryEntries(calls));

  useEffect(() => {
    if (!openedSwipeItemId) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!shouldCloseCallLogSwipeOnOutsidePointerDown(event.target)) return;
      onOpenSwipeItem(null);
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => document.removeEventListener("pointerdown", onPointerDown, true);
  }, [onOpenSwipeItem, openedSwipeItemId]);

  if (loading && !merged.length) {
    return <p className="px-4 py-8 text-center sam-text-body text-sam-fg-muted">{t("cm_ui_loading_conversation")}</p>;
  }
  if (error && !merged.length) {
    return <p className="px-4 py-8 text-center sam-text-body text-red-600">{error}</p>;
  }
  if (!merged.length) {
    return <p className="px-4 py-8 text-center sam-text-body text-sam-fg-muted">{t("cm_ui_call_logs_empty")}</p>;
  }

  return (
    <div>
      <ul
        onScrollCapture={() => {
          if (!openedSwipeItemId) return;
          onListScrollStart?.();
        }}
      >
        {merged.map((call) => (
          <CommunityMessengerCallRow
            key={call.id}
            call={call}
            onNavigate={onNavigate}
            onRequestOutgoingConfirm={onRequestOutgoingConfirm}
            onDeleteRequest={onDeleteRequest}
            globalRedialBlocked={globalRedialBlocked}
            openedSwipeItemId={openedSwipeItemId}
            onOpenSwipeItem={onOpenSwipeItem}
            swipeSurfaceDataAttr={
              openedSwipeItemId === communityMessengerCallLogSwipeItemId(call.id) ? "open" : undefined
            }
          />
        ))}
      </ul>
      {hasMore ? (
        <div className="border-t border-sam-border px-4 py-3 pb-[max(12px,env(safe-area-inset-bottom))]">
          {loadMoreError ? (
            <p className="mb-2 text-center sam-text-helper text-red-600">{loadMoreError}</p>
          ) : null}
          <button
            type="button"
            disabled={loadingMore}
            onClick={() => onLoadMore?.()}
            className="w-full rounded-ui-rect bg-sam-brand py-3 sam-text-body font-medium text-white active:opacity-90 disabled:opacity-60"
          >
            {loadingMore
              ? t("cm_ui_loading_conversation")
              : safeT("cm_ui_call_peer_history_more", {
                  fallbackKo: "통화 이력 더보기",
                  fallbackEn: "See more call history",
                })}
          </button>
        </div>
      ) : (
        <div className="pb-[max(12px,env(safe-area-inset-bottom))]" />
      )}
    </div>
  );
}
