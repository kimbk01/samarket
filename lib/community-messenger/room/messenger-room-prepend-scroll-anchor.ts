import type { CommunityMessengerMessage } from "@/lib/community-messenger/types";
import { estimateMessengerRoomTimelineTotalHeight } from "@/lib/community-messenger/room/messenger-room-timeline-paint-model";

type PrependVirtualizerLike = {
  scrollOffset?: number;
  scrollToOffset?: (offset: number, options?: { align?: "start" | "center" | "end" | "auto" }) => void;
};

export type RestoreMessengerRoomPrependScrollAnchorInput = {
  viewport: HTMLElement;
  virtualizer?: PrependVirtualizerLike | null;
  prevScrollTop: number;
  prevScrollHeight: number;
  prependedMessages: ReadonlyArray<
    Pick<CommunityMessengerMessage, "messageType" | "content" | "metadata">
  >;
};

export type RestoreMessengerRoomPrependScrollAnchorResult = {
  heightDelta: number;
  anchorErrorPx: number;
  targetScrollTop: number;
};

/**
 * 과거 메시지 prepend 후 scrollTop·virtualizer offset 동시 보정.
 * native scrollHeight 와 virtualizer totalSize 갱신 타이밍 차이로 상단 빈 공간이 생기는 것을 줄인다.
 */
export function restoreMessengerRoomPrependScrollAnchor(
  input: RestoreMessengerRoomPrependScrollAnchorInput
): RestoreMessengerRoomPrependScrollAnchorResult {
  const { viewport, virtualizer, prevScrollTop, prevScrollHeight, prependedMessages } = input;
  const estimatedPrependPx =
    prependedMessages.length > 0 ? estimateMessengerRoomTimelineTotalHeight(prependedMessages) : 0;
  const nativeHeightDelta = Math.max(0, viewport.scrollHeight - prevScrollHeight);
  const heightDelta = Math.max(nativeHeightDelta, estimatedPrependPx);
  const targetScrollTop = prevScrollTop + heightDelta;

  if (virtualizer?.scrollToOffset) {
    try {
      const prevVirtualOffset = virtualizer.scrollOffset ?? prevScrollTop;
      virtualizer.scrollToOffset(prevVirtualOffset + heightDelta, { align: "start" });
    } catch {
      /* virtualizer not ready */
    }
  }

  viewport.scrollTop = targetScrollTop;

  return {
    heightDelta,
    anchorErrorPx: Math.round(Math.abs(viewport.scrollTop - targetScrollTop)),
    targetScrollTop,
  };
}
