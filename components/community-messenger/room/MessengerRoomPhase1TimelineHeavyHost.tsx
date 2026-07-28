"use client";

import { memo, useLayoutEffect, useRef, type RefObject } from "react";
import {
  useMessengerRoomPhase1TimelineHeavy,
  type MessengerRoomPhase1TimelineHeavyBundle,
} from "@/lib/community-messenger/room/use-messenger-room-phase1-timeline-heavy";
import type { CommunityMessengerMessage } from "@/lib/community-messenger/types";
import { bumpCmRoomPhase2DeferredEffect } from "@/lib/community-messenger/room/cm-room-phase2-entry-perf";

type RoomMsg = CommunityMessengerMessage & { pending?: boolean };

type Props = {
  roomId: string;
  roomMessages: RoomMsg[];
  hiddenCallStubIds: Set<string>;
  roomSearchQuery: string;
  messagesViewportRef: RefObject<HTMLDivElement | null>;
  onReady: (bundle: MessengerRoomPhase1TimelineHeavyBundle) => void;
};

/** R2-M8: virtualizer·파생 목록은 composer 선커밋 이후 idle 마운트. */
export const MessengerRoomPhase1TimelineHeavyHost = memo(function MessengerRoomPhase1TimelineHeavyHost(
  props: Props
) {
  const bundle = useMessengerRoomPhase1TimelineHeavy({
    roomId: props.roomId,
    roomMessages: props.roomMessages,
    hiddenCallStubIds: props.hiddenCallStubIds,
    roomSearchQuery: props.roomSearchQuery,
    messagesViewportRef: props.messagesViewportRef,
  });
  const onReadyRef = useRef(props.onReady);
  onReadyRef.current = props.onReady;

  useLayoutEffect(() => {
    bumpCmRoomPhase2DeferredEffect();
    onReadyRef.current(bundle);
  }, [bundle]);

  return null;
});
