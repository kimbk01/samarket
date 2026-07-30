"use client";

import {
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  useEffect,
  useState,
} from "react";
import { communityMessengerRoomIsGloballyUsable } from "@/lib/community-messenger/types";
import { CM_CLUSTER_GAP_MS } from "@/lib/community-messenger/room/messenger-room-ui-constants";
import { describeManagementEvent } from "@/lib/community-messenger/room/describe-management-event";
import { showMessengerSnackbar } from "@/lib/community-messenger/stores/messenger-snackbar-store";
import { BOTTOM_NAV_STACK_ABOVE_CLASS } from "@/lib/main-menu/bottom-nav-config";
import { useMessengerRoomUiStore } from "@/lib/community-messenger/stores/messenger-room-ui-store";
import { messengerUserIdsEqual } from "@/lib/community-messenger/messenger-user-id";
import { MessengerOutgoingCallConfirmDialog } from "@/components/community-messenger/MessengerOutgoingCallConfirmDialog";
import {
  BackIcon,
  communityMessengerMemberAvatar,
  communityMessengerMessageSearchText,
  communityMessengerVoiceAudioSrc,
  extractHttpUrls,
  FileIcon,
  formatDuration,
  formatFileMeta,
  formatParticipantStatus,
  formatRoomCallStatus,
  formatTime,
  formatVoiceRecordTenThousandths,
  getLatestCallStubForSession,
  looksLikeDirectImageUrl,
  mergeRoomMessages,
  MicHoldIcon,
  MoreIcon,
  PlusIcon,
  SendPlaneIcon,
  SendVoiceArrowIcon,
  TrashVoiceIcon,
  VideoCallIcon,
  VoiceCallIcon,
  VoiceRecordingLiveWaveform,
  ViberChatBubble,
} from "@/components/community-messenger/room/community-messenger-room-helpers";
import {
  CommunityMessengerTradeProcessSection,
  GroupRoomCallOverlay,
  MessengerTradeChatRoomDetailPrefetch,
  SeedTradeChatDetailMemoryFromSnapshot,
  VoiceMessageBubble,
} from "@/components/community-messenger/room/community-messenger-room-phase2-lazy";
import { useMessengerRoomPhase2View } from "@/components/community-messenger/room/phase2/messenger-room-phase2-view-context";

export function CommunityMessengerRoomPhase2MemberActionModal() {
  const vm = useMessengerRoomPhase2View();
  const memberActionTarget = vm.memberActionTarget;
  const [outCallKind, setOutCallKind] = useState<null | "voice" | "video">(null);
  useEffect(() => {
    if (!memberActionTarget) setOutCallKind((prev) => (prev === null ? prev : null));
  }, [memberActionTarget]);
  return (
    <>
      {memberActionTarget && outCallKind ? (
        <MessengerOutgoingCallConfirmDialog
          open
          peerLabel={memberActionTarget.label}
          kind={outCallKind}
          busy={vm.outgoingDialLocked}
          onCancel={() => setOutCallKind((prev) => (prev === null ? prev : null))}
          onConfirm={() => {
            const id = memberActionTarget.id;
            const kind = outCallKind;
            if (!vm.startDirectCallWithMember(id, kind, memberActionTarget.label)) return;
            setOutCallKind((prev) => (prev === null ? prev : null));
            vm.setMemberActionTarget(null);
          }}
        />
      ) : null}
      {memberActionTarget ? (
        <div className="fixed inset-0 z-[25] flex items-end justify-center bg-black/30 px-4 pb-6" onClick={() => vm.setMemberActionTarget(null)}>
          <div
            className="w-full max-w-[520px] overflow-hidden rounded-ui-rect border border-sam-border bg-sam-surface p-5 shadow-[0_10px_30px_rgba(17,24,39,0.08)]"
            onClick={(event) => event.stopPropagation()}
          >
            <p className="sam-text-body-secondary font-medium text-sam-fg">{vm.t("cm_ui_member_actions")}</p>
            <h2 className="mt-1 sam-text-page-title font-semibold text-sam-fg">{memberActionTarget.label}</h2>
            <p className="mt-1 sam-text-helper text-sam-muted">
              {memberActionTarget.memberRole === "admin"
                ? vm.t("nav_messenger_admin")
                : vm.snapshot?.room.ownerUserId && messengerUserIdsEqual(memberActionTarget.id, vm.snapshot.room.ownerUserId)
                  ? vm.t("nav_messenger_owner")
                  : vm.t("nav_messenger_member")}
              {memberActionTarget.identityMode === "alias" ? ` · ${vm.t("cm_ui_nickname_profile")}` : ""}
            </p>
            {vm.isPrivateGroupRoom ? (
              <div className="mt-3 grid grid-cols-3 gap-2">
                <div className="rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2">
                  <p className="sam-text-xxs text-sam-muted">{vm.t("cm_ui_change_role")}</p>
                  <p className="mt-1 sam-text-helper font-semibold text-sam-fg">{vm.canManageMemberRoles ? vm.t("cm_ui_possible") : vm.t("cm_ui_limited")}</p>
                </div>
                <div className="rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2">
                  <p className="sam-text-xxs text-sam-muted">{vm.t("cm_ui_remove")}</p>
                  <p className="mt-1 sam-text-helper font-semibold text-sam-fg">{vm.canKickGroupMembers ? vm.t("cm_ui_possible") : vm.t("cm_ui_limited")}</p>
                </div>
                <div className="rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2">
                  <p className="sam-text-xxs text-sam-muted">{vm.t("cm_ui_delegate_owner")}</p>
                  <p className="mt-1 sam-text-helper font-semibold text-sam-fg">{vm.isOwner ? vm.t("cm_ui_possible") : vm.t("cm_ui_not_possible")}</p>
                </div>
              </div>
            ) : null}
            <div className="mt-4 grid gap-2">
              <div className="border-b border-sam-border-soft pb-1 sam-text-xxs font-semibold text-sam-meta">{vm.t("cm_ui_conversation")}</div>
              <button
                type="button"
                onClick={() => void vm.startDirectChatWithMember(memberActionTarget.id)}
                disabled={vm.busy === `member-chat:${memberActionTarget.id}`}
                className="flex items-center justify-between rounded-ui-rect border border-sam-border px-4 py-4 text-left disabled:opacity-40"
              >
                <div>
                  <p className="sam-text-body font-semibold text-sam-fg">{vm.t("cm_ui_start_direct_chat")}</p>
                  <p className="mt-1 sam-text-helper text-sam-muted">{vm.t("cm_ui_open_separate_chat_with_member")}</p>
                </div>
                <span className="sam-text-page-title text-sam-meta">›</span>
              </button>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setOutCallKind("voice")}
                  disabled={vm.outgoingDialLocked}
                  className="rounded-ui-rect border border-sam-border px-4 py-4 text-left sam-text-body font-semibold text-sam-fg disabled:opacity-40"
                >
                  {vm.t("cm_ui_voice_call")}
                </button>
                <button
                  type="button"
                  onClick={() => setOutCallKind("video")}
                  disabled={vm.outgoingDialLocked}
                  className="rounded-ui-rect border border-sam-border px-4 py-4 text-left sam-text-body font-semibold text-sam-fg disabled:opacity-40"
                >
                  {vm.t("cm_ui_video_call")}
                </button>
              </div>
              {((vm.canManageMemberRoles &&
                vm.snapshot?.room.ownerUserId &&
                !messengerUserIdsEqual(memberActionTarget.id, vm.snapshot.room.ownerUserId)) ||
                (vm.canKickGroupMembers &&
                  vm.snapshot?.room.ownerUserId &&
                  !messengerUserIdsEqual(memberActionTarget.id, vm.snapshot.room.ownerUserId) &&
                  !(vm.snapshot.myRole !== "owner" && memberActionTarget.memberRole === "admin"))) ? (
                <div className="border-b border-sam-border-soft pb-1 pt-2 sam-text-xxs font-semibold text-sam-meta">{vm.t("cm_ui_operations")}</div>
              ) : null}
              {vm.canManageMemberRoles &&
              vm.snapshot?.room.ownerUserId &&
              !messengerUserIdsEqual(memberActionTarget.id, vm.snapshot.room.ownerUserId) ? (
                <>
                  {vm.isOwner ? (
                    <button
                      type="button"
                      onClick={() => void vm.transferGroupOwner(memberActionTarget.id, memberActionTarget.label)}
                      disabled={vm.busy === `group-owner:${memberActionTarget.id}`}
                      className="flex items-center justify-between rounded-ui-rect border border-sam-border bg-sam-surface px-4 py-4 text-left disabled:opacity-40"
                    >
                      <div>
                        <p className="sam-text-body font-semibold text-sam-fg">{vm.t("cm_ui_delegate_owner")}</p>
                        <p className="mt-1 sam-text-helper text-sam-muted">{vm.t("cm_ui_change_member_to_new_owner")}</p>
                      </div>
                      <span className="sam-text-page-title text-sam-meta">›</span>
                    </button>
                  ) : null}
                </>
              ) : null}
              {vm.canManageMemberRoles &&
              vm.snapshot?.room.ownerUserId &&
              !messengerUserIdsEqual(memberActionTarget.id, vm.snapshot.room.ownerUserId) ? (
                <button
                  type="button"
                  onClick={() => void vm.updateGroupMemberRole(memberActionTarget.id, memberActionTarget.memberRole === "admin" ? "member" : "admin")}
                  disabled={vm.busy === `group-role:${memberActionTarget.id}`}
                  className="flex items-center justify-between rounded-ui-rect border border-sam-border px-4 py-4 text-left disabled:opacity-40"
                >
                  <div>
                    <p className="sam-text-body font-semibold text-sam-fg">
                      {memberActionTarget.memberRole === "admin" ? vm.t("cm_ui_remove_admin") : vm.t("cm_ui_assign_admin")}
                    </p>
                    <p className="mt-1 sam-text-helper text-sam-muted">{vm.t("cm_ui_adjust_staff_permissions")}</p>
                  </div>
                  <span className="sam-text-page-title text-sam-meta">›</span>
                </button>
              ) : null}
              {vm.canKickGroupMembers &&
              vm.snapshot?.room.ownerUserId &&
              !messengerUserIdsEqual(memberActionTarget.id, vm.snapshot.room.ownerUserId) &&
              !(vm.snapshot.myRole !== "owner" && memberActionTarget.memberRole === "admin") ? (
                <>
                  <button
                    type="button"
                    onClick={() => void vm.removeGroupMember(memberActionTarget.id, memberActionTarget.label)}
                    disabled={vm.busy === `group-remove:${memberActionTarget.id}`}
                    className="flex items-center justify-between rounded-ui-rect border border-red-200 bg-sam-surface px-4 py-4 text-left disabled:opacity-40"
                  >
                    <div>
                      <p className="sam-text-body font-semibold text-red-700">{vm.t("cm_ui_remove_from_group")}</p>
                      <p className="mt-1 sam-text-helper text-red-600/80">{vm.t("cm_ui_end_current_group_participation")}</p>
                    </div>
                    <span className="sam-text-page-title text-red-300">›</span>
                  </button>
                  {vm.isPrivateGroupRoom ? (
                    <button
                      type="button"
                      onClick={() => void vm.banGroupMember(memberActionTarget.id, memberActionTarget.label)}
                      disabled={vm.busy === `group-ban:${memberActionTarget.id}`}
                      className="flex items-center justify-between rounded-ui-rect border border-red-200 bg-sam-surface px-4 py-4 text-left disabled:opacity-40"
                    >
                      <div>
                        <p className="sam-text-body font-semibold text-red-700">
                          {vm.t("cm_ui_ban_from_group")}
                        </p>
                        <p className="mt-1 sam-text-helper text-red-600/80">
                          {vm.t("cm_ui_ban_from_group_desc")}
                        </p>
                      </div>
                      <span className="sam-text-page-title text-red-300">›</span>
                    </button>
                  ) : null}
                </>
              ) : null}
              <div className="border-b border-sam-border-soft pb-1 pt-2 sam-text-xxs font-semibold text-sam-meta">{vm.t("cm_ui_protection")}</div>
              <button
                type="button"
                onClick={() =>
                  void vm.reportTarget({
                    reportType: "user",
                    reportedUserId: memberActionTarget.id,
                  })
                }
                className="flex items-center justify-between rounded-ui-rect border border-red-200 bg-sam-surface px-4 py-4 text-left"
              >
                <div>
                  <p className="sam-text-body font-semibold text-red-700">{vm.t("cm_ui_report_user")}</p>
                  <p className="mt-1 sam-text-helper text-red-600/80">{vm.t("cm_ui_report_problematic_user")}</p>
                </div>
                <span className="sam-text-page-title text-red-300">›</span>
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
