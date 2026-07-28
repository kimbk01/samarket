"use client";

/**
 * CM roomMessages mutation bus — every setRoomMessages path must declare a kind.
 * prepend → scroll bridge notifyPrependComplete (Telegram/Kakao / legacy ChatDetailView).
 * append/replace/clear → state only; append follow is useChatThreadScroll messageCount effect.
 *
 * @see docs/cm-room-telegram-kakao-parity-redesign.md
 */

import type { Dispatch, SetStateAction } from "react";
import type { CommunityMessengerMessage } from "@/lib/community-messenger/types";
import type { NotifyPrependCompleteInput } from "@/lib/chat-thread-scroll/engine";

export type RoomMessagesMutationKind = "replace" | "append" | "prepend" | "clear";

export type RoomMessageRow = CommunityMessengerMessage & { pending?: boolean };

export type MessengerRoomScrollBridge = {
  getViewport: () => HTMLElement | null;
  notifyPrependInFlight: (inFlight: boolean) => void;
  notifyPrependComplete: (input: NotifyPrependCompleteInput) => void;
};

let scrollBridge: MessengerRoomScrollBridge | null = null;

export function registerMessengerRoomScrollBridge(bridge: MessengerRoomScrollBridge | null): void {
  scrollBridge = bridge;
}

export function getMessengerRoomScrollBridge(): MessengerRoomScrollBridge | null {
  return scrollBridge;
}

type Updater = SetStateAction<RoomMessageRow[]>;

function runUpdater(prev: RoomMessageRow[], updater: Updater): RoomMessageRow[] {
  return typeof updater === "function" ? updater(prev) : updater;
}

/**
 * Apply roomMessages change with required kind. Prefer this over raw setRoomMessages.
 */
export function applyRoomMessagesMutation(
  setRoomMessages: Dispatch<SetStateAction<RoomMessageRow[]>>,
  kind: RoomMessagesMutationKind,
  updater: Updater
): void {
  if (kind === "clear") {
    setRoomMessages([]);
    return;
  }

  if (kind === "prepend") {
    const bridge = scrollBridge;
    const vp = bridge?.getViewport() ?? null;
    const prevScrollTop = vp?.scrollTop ?? 0;
    const prevScrollHeight = vp?.scrollHeight ?? 0;
    bridge?.notifyPrependInFlight(true);
    setRoomMessages((prev) => runUpdater(prev, updater));
    const finish = () => {
      if (bridge && prevScrollHeight > 0) {
        bridge.notifyPrependComplete({ prevScrollTop, prevScrollHeight });
      }
      bridge?.notifyPrependInFlight(false);
    };
    if (typeof requestAnimationFrame === "function") {
      requestAnimationFrame(() => requestAnimationFrame(finish));
    } else {
      queueMicrotask(finish);
    }
    return;
  }

  // replace | append
  setRoomMessages((prev) => runUpdater(prev, updater));
}
