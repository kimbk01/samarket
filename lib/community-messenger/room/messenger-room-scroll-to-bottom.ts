"use client";

import type { MutableRefObject, RefObject } from "react";
import type { Virtualizer } from "@tanstack/react-virtual";
import { MESSENGER_STICK_TO_BOTTOM_THRESHOLD_PX } from "@/lib/ui/messenger-chat-viewport-tuning";
import { isMessengerRoomNearBottomFromMetrics } from "@/lib/community-messenger/room/messenger-room-timeline-ssot";

type VirtualizerLike = Pick<Virtualizer<HTMLDivElement, Element>, "scrollToIndex">;

function isNearBottomViewport(vp: HTMLElement | null | undefined): boolean {
  if (!vp) return false;
  return isMessengerRoomNearBottomFromMetrics(
    { scrollHeight: vp.scrollHeight, scrollTop: vp.scrollTop, clientHeight: vp.clientHeight },
    MESSENGER_STICK_TO_BOTTOM_THRESHOLD_PX
  );
}

/**
 * 가상 타임라인 + scrollTop + messageEnd 앵커를 한 번에 맞춘다.
 * 거래 도크 펼침 등 레이아웃이 늦게 잡힐 때 이중 rAF로 커밋 후 실행한다.
 */
export function runMessengerRoomScrollToBottom(opts: {
  messagesViewportRef: RefObject<HTMLDivElement | null>;
  messageEndRef: RefObject<HTMLDivElement | null>;
  virtualizer?: VirtualizerLike;
  messageCount: number;
  stickToBottomRef?: MutableRefObject<boolean>;
}): void {
  const run = () => {
    const vp = opts.messagesViewportRef.current;
    const nearBottom = isNearBottomViewport(vp);
    if (opts.stickToBottomRef) {
      opts.stickToBottomRef.current = nearBottom;
    }
    if (!nearBottom) return;
    const count = opts.messageCount;
    if (count > 0 && opts.virtualizer) {
      try {
        opts.virtualizer.scrollToIndex(count - 1, { align: "end" });
      } catch {
        /* ignore — virtualizer not ready */
      }
    }
    if (vp) {
      vp.scrollTop = vp.scrollHeight;
    }
    opts.messageEndRef.current?.scrollIntoView({ block: "end", behavior: "auto" });
    if (opts.stickToBottomRef) {
      opts.stickToBottomRef.current = true;
    }
  };

  if (typeof requestAnimationFrame !== "function") {
    run();
    return;
  }
  requestAnimationFrame(() => {
    requestAnimationFrame(run);
  });
}
