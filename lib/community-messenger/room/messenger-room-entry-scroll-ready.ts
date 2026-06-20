import type { CmScrollOwnerReason } from "@/lib/community-messenger/room/messenger-room-entry-scroll-owner";
import {
  isMessengerEntryBottomLoadReason,
  isMessengerEntryTailSettleReason,
} from "@/lib/community-messenger/room/messenger-room-entry-intent";

type VirtualizerSizeLike = { getTotalSize?: () => number };

export type MessengerRoomEntryScrollPaintReadyInput = {
  viewport: HTMLElement | null;
  virtualizer?: VirtualizerSizeLike;
  messageCount: number;
  /** shell `--chat-composer-height` 실측 완료 여부 (tail settle·entry bottom) */
  composerHeightSynced?: boolean;
};

export type MessengerRoomTimelineViewportProbe = {
  timelineClientHeight: number;
  timelineScrollHeight: number;
  timelineRowCount: number;
  offsetParentNull: boolean;
  parentHidden: boolean;
  virtualizerTotalSize: number;
  scrollTop: number;
  composerHeightPx: string;
};

export function isMessengerRoomEntryBottomScrollReason(reason: CmScrollOwnerReason): boolean {
  return (
    isMessengerEntryBottomLoadReason(reason) ||
    isMessengerEntryTailSettleReason(reason) ||
    reason === "room_entry_initial"
  );
}

export function isMessengerRoomEntryBottomRestoreReason(reason: CmScrollOwnerReason): boolean {
  return reason === "room_entry_restore";
}

export function readCmRoomShellComposerHeightPx(viewport: HTMLElement | null): string {
  const shell = viewport?.closest("[data-cm-room-id]") as HTMLElement | null;
  return shell?.style.getPropertyValue("--chat-composer-height")?.trim() ?? "";
}

export function isMessengerRoomComposerHeightSynced(viewport: HTMLElement | null): boolean {
  const px = readCmRoomShellComposerHeightPx(viewport);
  return px.length > 0 && px !== "0px";
}

/**
 * entry bottom / tail settle — viewport·row·virtualizer·(tail 시 composer) 준비 후 scrollTop 이동.
 */
export function resolveMessengerRoomEntryScrollPaintReady(
  input: MessengerRoomEntryScrollPaintReadyInput
): boolean {
  const vp = input.viewport;
  if (!vp || vp.clientHeight <= 0) return false;
  if (input.messageCount <= 0) return true;

  const rowCount = vp.querySelectorAll("[data-cm-timeline-message-row]").length;
  const totalSize = input.virtualizer?.getTotalSize?.() ?? 0;
  const rowsOrVirtualReady = rowCount > 0 || totalSize > 0;
  if (!rowsOrVirtualReady) return false;

  if (input.composerHeightSynced === true) {
    return isMessengerRoomComposerHeightSynced(vp);
  }

  return true;
}

export function snapshotMessengerRoomTimelineViewportProbe(
  viewport: HTMLElement | null,
  virtualizer?: VirtualizerSizeLike
): MessengerRoomTimelineViewportProbe {
  if (!viewport) {
    return {
      timelineClientHeight: 0,
      timelineScrollHeight: 0,
      timelineRowCount: 0,
      offsetParentNull: true,
      parentHidden: true,
      virtualizerTotalSize: virtualizer?.getTotalSize?.() ?? 0,
      scrollTop: 0,
      composerHeightPx: "",
    };
  }
  return {
    timelineClientHeight: viewport.clientHeight,
    timelineScrollHeight: viewport.scrollHeight,
    timelineRowCount: viewport.querySelectorAll("[data-cm-timeline-message-row]").length,
    offsetParentNull: viewport.offsetParent === null,
    parentHidden: viewport.offsetParent === null,
    virtualizerTotalSize: virtualizer?.getTotalSize?.() ?? 0,
    scrollTop: viewport.scrollTop,
    composerHeightPx: readCmRoomShellComposerHeightPx(viewport),
  };
}
