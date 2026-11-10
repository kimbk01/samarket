"use client";

import { memo, useLayoutEffect, useRef, type MutableRefObject, type RefObject } from "react";
import {
  useMessengerRoomPhase1TimelineHeavy,
  type MessengerRoomTimelineVirtualizer,
} from "@/lib/community-messenger/room/use-messenger-room-phase1-timeline-heavy";
import type { CommunityMessengerMessage } from "@/lib/community-messenger/types";
import { bumpCmRoomPhase2DeferredEffect } from "@/lib/community-messenger/room/cm-room-phase2-entry-perf";

type RoomMsg = CommunityMessengerMessage & { pending?: boolean };

type Props = {
  roomId: string;
  displayRoomMessages: RoomMsg[];
  messagesViewportRef: RefObject<HTMLDivElement | null>;
  tradeDockScrollAnchorEnabled: boolean;
  storeOrderDockScrollAnchorEnabled: boolean;
  messageEndRef: RefObject<HTMLDivElement | null>;
  stickToBottomRef: MutableRefObject<boolean>;
  scrollMessengerToBottomRef: MutableRefObject<
    (req?: { reason?: string; force?: boolean }) => void
  >;
  onReady: (virtualizer: MessengerRoomTimelineVirtualizer) => void;
};

/**
 * R2-M8: virtualizer 는 composer 선커밋 이후 idle 마운트.
 * 채팅 P0-1: 부모에 알리는 것은 virtualizer 인스턴스(방마다 1개 고정) — 메시지 변경마다 부모 state 를 다시 쓰지 않는다.
 */
export const MessengerRoomPhase1TimelineHeavyHost = memo(function MessengerRoomPhase1TimelineHeavyHost(
  props: Props
) {
  const virtualizer = useMessengerRoomPhase1TimelineHeavy(props);
  const onReadyRef = useRef(props.onReady);
  onReadyRef.current = props.onReady;

  useLayoutEffect(() => {
    bumpCmRoomPhase2DeferredEffect();
    onReadyRef.current(virtualizer);
  }, [virtualizer]);

  return null;
});
