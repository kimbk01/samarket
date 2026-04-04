import { philifeAppPaths } from "@/lib/philife/paths";
import type { PhilifeMeetingHubData } from "@/lib/neighborhood/philife-meeting-hub-load";

export type FeedMeetupOpenChatNavPlan =
  | { action: "navigate"; path: string }
  | {
      action: "room_password_modal";
      meetingId: string;
      defaultRoomId: string;
      openChatRoomHasPassword: boolean;
      openChatRoomNeedsApprovalIntro: boolean;
    }
  | {
      action: "unified_cred_modal";
      meetingId: string;
      defaultRoomId: string;
      openChatRoomHasPassword: boolean;
      openChatRoomNeedsApprovalIntro: boolean;
    };

/**
 * `/philife` 피드 모임 카드 클릭 시 — 허브 대신 팝업/직접 방 진입 분기 (MeetingJoinButton 과 동일 조건).
 */
export function resolveFeedMeetupOpenChatNavPlan(hub: PhilifeMeetingHubData): FeedMeetupOpenChatNavPlan {
  const meetingId = hub.meeting.id;
  const rid = hub.defaultOpenChatRoomId?.trim() ?? "";
  const hubPath = philifeAppPaths.meetingGroupChat(meetingId);
  const roomPath = rid ? philifeAppPaths.meetingGroupChatRoom(meetingId, rid) : hubPath;

  if (hub.isPending || hub.isRestricted) {
    return { action: "navigate", path: hubPath };
  }

  if (hub.isJoined && rid && hub.viewerIsDefaultOpenChatMember) {
    return { action: "navigate", path: roomPath };
  }

  const entryNorm: "open" | "approve" | "password" | "invite_only" =
    hub.meeting.entry_policy === "approve" ||
    hub.meeting.entry_policy === "invite_only" ||
    hub.meeting.entry_policy === "password"
      ? hub.meeting.entry_policy
      : "open";

  const meetingPasswordRequired = entryNorm === "password" || hub.meeting.has_password;
  const requiresApproval = hub.meeting.requires_approval;
  const isJoined = false;
  const effectiveStatus = hub.viewerStatus;

  const useModalForJoinRequest =
    !isJoined &&
    effectiveStatus !== "pending" &&
    !(meetingPasswordRequired && !requiresApproval) &&
    (entryNorm === "approve" || entryNorm === "invite_only" || requiresApproval === true);

  const passwordOnlyOpenJoin =
    !isJoined &&
    effectiveStatus !== "pending" &&
    !requiresApproval &&
    entryNorm !== "approve" &&
    entryNorm !== "invite_only" &&
    meetingPasswordRequired;

  const defaultRoomId = rid;
  const needsOpenChatCredentialsFirst =
    Boolean(defaultRoomId) &&
    (hub.openChatRoomHasPassword || hub.openChatRoomNeedsApprovalIntro) &&
    entryNorm === "open" &&
    !requiresApproval &&
    !passwordOnlyOpenJoin &&
    !useModalForJoinRequest &&
    effectiveStatus !== "pending";

  const needsRoomPasswordOnlyModal =
    needsOpenChatCredentialsFirst && hub.openChatRoomHasPassword && !hub.openChatRoomNeedsApprovalIntro;

  const needsUnifiedCredModal = needsOpenChatCredentialsFirst && !needsRoomPasswordOnlyModal;

  if (useModalForJoinRequest || passwordOnlyOpenJoin) {
    return { action: "navigate", path: hubPath };
  }
  if (needsRoomPasswordOnlyModal && defaultRoomId) {
    return {
      action: "room_password_modal",
      meetingId,
      defaultRoomId,
      openChatRoomHasPassword: hub.openChatRoomHasPassword,
      openChatRoomNeedsApprovalIntro: hub.openChatRoomNeedsApprovalIntro,
    };
  }
  if (needsUnifiedCredModal && defaultRoomId) {
    return {
      action: "unified_cred_modal",
      meetingId,
      defaultRoomId,
      openChatRoomHasPassword: hub.openChatRoomHasPassword,
      openChatRoomNeedsApprovalIntro: hub.openChatRoomNeedsApprovalIntro,
    };
  }
  return { action: "navigate", path: hubPath };
}
