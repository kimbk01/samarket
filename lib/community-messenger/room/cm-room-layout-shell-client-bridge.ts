import { noteBn14DirectColdMark } from "@/lib/community-messenger/room/cm-room-bn14-direct-cold-probe";
import {
  beginCmRoomEntryShellFirstPass,
  noteCmRoomEntryShellFirstPaint,
  noteCmRoomStableShellPainted,
} from "@/lib/community-messenger/room/cm-room-entry-shell-first-pass";
import {
  noteR2M11SegmentLoadingFallbackVisible,
  noteR2M11SuspenseRelease,
} from "@/lib/community-messenger/room/cm-room-r2-m11-suspense-release";
import { noteR2M11BSuspenseRelease } from "@/lib/community-messenger/room/cm-room-r2-m11b-breakdown";
import { noteR2M11DRoomSuspenseRelease } from "@/lib/community-messenger/room/cm-room-r2-m11d-prefetch-flight";

let layoutShellBridgeRanForRoom: string | null = null;

/** BN14-2 — RSC inline shell 이후 hydrate milestone bridge (시각 shell 없음). */
export function runCmRoomLayoutShellClientBridge(roomId: string): void {
  const rid = roomId.trim();
  if (!rid || layoutShellBridgeRanForRoom === rid) return;
  layoutShellBridgeRanForRoom = rid;

  noteBn14DirectColdMark("segment_layout_mount");
  noteBn14DirectColdMark("layout_inline_shell_hydrate");
  beginCmRoomEntryShellFirstPass(rid);
  noteR2M11SegmentLoadingFallbackVisible();
  noteCmRoomEntryShellFirstPaint(rid);
  noteCmRoomStableShellPainted(rid);
  noteR2M11SuspenseRelease(rid);
  noteR2M11BSuspenseRelease(rid);
  noteR2M11DRoomSuspenseRelease(rid);
  if (document.querySelector("[data-cm-room-segment-shell-host]")) {
    noteBn14DirectColdMark("segment_shell_host_dom");
  }
  if (document.querySelector("[data-cm-room-route-entry-shell]")) {
    noteBn14DirectColdMark("route_entry_shell_dom");
  }
}
