/**
 * Phase I/J — REMOVE prep for room chrome shells.
 * Deleted in Phase J (callers=0): R10, R8b — see PHASE_J_DELETED_CHROME.
 * Remaining must stay until entry chrome cutover + call-site 0.
 */

export const PHASE_J_DELETED_CHROME = [
  {
    id: "R10",
    path: "components/community-messenger/room/CommunityMessengerRoomSegmentShellLayout.tsx",
  },
  {
    id: "R8b",
    path: "components/community-messenger/room/CommunityMessengerRoomStableEntryShellLight.tsx",
  },
] as const;

/** Still present — product callers remain. Delete only after quarantine proof. */
export const PHASE_I_ROOM_CHROME_REMOVE_CANDIDATES = [
  {
    id: "R5",
    path: "components/community-messenger/room/CommunityMessengerRoomRouteEntryShell.tsx",
  },
  {
    id: "R6",
    path: "components/community-messenger/room/CommunityMessengerRoomPass0Shell.tsx",
  },
  {
    id: "R7a",
    path: "components/community-messenger/room/CommunityMessengerRoomPass1StableShell.tsx",
  },
  {
    id: "R7b",
    path: "components/community-messenger/room/CommunityMessengerRoomPass1ComposerShell.tsx",
  },
  {
    id: "R8",
    path: "components/community-messenger/room/CommunityMessengerRoomStableEntryShell.tsx",
  },
] as const;

export const PHASE_I_TARGET_SINGLE_CHROME =
  "lib/chat-domain/room-chrome/domain-room-chrome.ts" as const;
