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
  CommunityMessengerMessageActionSheet,
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
    if (!memberActionTarget) setOutCallKind(null);
  }, [memberActionTarget]);
  return (
    <>
      {memberActionTarget && outCallKind ? (
        <MessengerOutgoingCallConfirmDialog
          open
          peerLabel={memberActionTarget.label}
          kind={outCallKind}
          busy={vm.outgoingDialLocked}
          onCancel={() => setOutCallKind(null)}
          onConfirm={() => {
            const id = memberActionTarget.id;
            const kind = outCallKind;
            if (!vm.startDirectCallWithMember(id, kind, memberActionTarget.label)) return;
            setOutCallKind(null);
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
            <p className="sam-text-body-secondary font-medium text-sam-fg">멤버 액션</p>
            <h2 className="mt-1 sam-text-page-title font-semibold text-sam-fg">{memberActionTarget.label}</h2>
            <p className="mt-1 sam-text-helper text-sam-muted">
              {memberActionTarget.memberRole === "admin"
                ? "관리자"
                : vm.snapshot?.room.ownerUserId && messengerUserIdsEqual(memberActionTarget.id, vm.snapshot.room.ownerUserId)
                  ? "방장"
                  : "멤버"}
              {memberActionTarget.identityMode === "alias" ? " · 닉네임 프로필" : ""}
            </p>
            {vm.isPrivateGroupRoom ? (
              <div className="mt-3 grid grid-cols-3 gap-2">
                <div className="rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2">
                  <p className="sam-text-xxs text-sam-muted">역할 변경</p>
                  <p className="mt-1 sam-text-helper font-semibold text-sam-fg">{vm.canManageMemberRoles ? "가능" : "제한"}</p>
                </div>
                <div className="rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2">
                  <p className="sam-text-xxs text-sam-muted">내보내기</p>
                  <p className="mt-1 sam-text-helper font-semibold text-sam-fg">{vm.canKickGroupMembers ? "가능" : "제한"}</p>
                </div>
                <div className="rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2">
                  <p className="sam-text-xxs text-sam-muted">방장 위임</p>
                  <p className="mt-1 sam-text-helper font-semibold text-sam-fg">{vm.isOwner ? "가능" : "불가"}</p>
                </div>
              </div>
            ) : null}
            <div className="mt-4 grid gap-2">
              <div className="border-b border-sam-border-soft pb-1 sam-text-xxs font-semibold text-sam-meta">대화</div>
              <button
                type="button"
                onClick={() => void vm.startDirectChatWithMember(memberActionTarget.id)}
                disabled={vm.busy === `member-chat:${memberActionTarget.id}`}
                className="flex items-center justify-between rounded-ui-rect border border-sam-border px-4 py-4 text-left disabled:opacity-40"
              >
                <div>
                  <p className="sam-text-body font-semibold text-sam-fg">1:1 대화 시작</p>
                  <p className="mt-1 sam-text-helper text-sam-muted">이 멤버와 별도 대화방을 엽니다.</p>
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
                  음성 통화
                </button>
                <button
                  type="button"
                  onClick={() => setOutCallKind("video")}
                  disabled={vm.outgoingDialLocked}
                  className="rounded-ui-rect border border-sam-border px-4 py-4 text-left sam-text-body font-semibold text-sam-fg disabled:opacity-40"
                >
                  영상 통화
                </button>
              </div>
              {((vm.canManageMemberRoles &&
                vm.snapshot?.room.ownerUserId &&
                !messengerUserIdsEqual(memberActionTarget.id, vm.snapshot.room.ownerUserId)) ||
                (vm.canKickGroupMembers &&
                  vm.snapshot?.room.ownerUserId &&
                  !messengerUserIdsEqual(memberActionTarget.id, vm.snapshot.room.ownerUserId) &&
                  !(vm.snapshot.myRole !== "owner" && memberActionTarget.memberRole === "admin"))) ? (
                <div className="border-b border-sam-border-soft pb-1 pt-2 sam-text-xxs font-semibold text-sam-meta">운영</div>
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
                        <p className="sam-text-body font-semibold text-sam-fg">방장 위임</p>
                        <p className="mt-1 sam-text-helper text-sam-muted">이 멤버를 새 방장으로 변경합니다.</p>
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
                      {memberActionTarget.memberRole === "admin" ? "관리자 해제" : "관리자 지정"}
                    </p>
                    <p className="mt-1 sam-text-helper text-sam-muted">운영진 권한을 조정합니다.</p>
                  </div>
                  <span className="sam-text-page-title text-sam-meta">›</span>
                </button>
              ) : null}
              {vm.canKickGroupMembers &&
              vm.snapshot?.room.ownerUserId &&
              !messengerUserIdsEqual(memberActionTarget.id, vm.snapshot.room.ownerUserId) &&
              !(vm.snapshot.myRole !== "owner" && memberActionTarget.memberRole === "admin") ? (
                <button
                  type="button"
                  onClick={() => void vm.removeGroupMember(memberActionTarget.id, memberActionTarget.label)}
                  disabled={vm.busy === `group-remove:${memberActionTarget.id}`}
                  className="flex items-center justify-between rounded-ui-rect border border-red-200 bg-sam-surface px-4 py-4 text-left disabled:opacity-40"
                >
                  <div>
                    <p className="sam-text-body font-semibold text-red-700">그룹에서 내보내기</p>
                    <p className="mt-1 sam-text-helper text-red-600/80">현재 그룹 참여를 종료합니다.</p>
                  </div>
                  <span className="sam-text-page-title text-red-300">›</span>
                </button>
              ) : null}
              <div className="border-b border-sam-border-soft pb-1 pt-2 sam-text-xxs font-semibold text-sam-meta">보호</div>
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
                  <p className="sam-text-body font-semibold text-red-700">사용자 신고</p>
                  <p className="mt-1 sam-text-helper text-red-600/80">문제가 있는 사용자를 신고합니다.</p>
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
