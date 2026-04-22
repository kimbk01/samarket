"use client";

import {
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { communityMessengerRoomIsGloballyUsable } from "@/lib/community-messenger/types";
import { CM_CLUSTER_GAP_MS } from "@/lib/community-messenger/room/messenger-room-ui-constants";
import { describeManagementEvent } from "@/lib/community-messenger/room/describe-management-event";
import { showMessengerSnackbar } from "@/lib/community-messenger/stores/messenger-snackbar-store";
import { BOTTOM_NAV_STACK_ABOVE_CLASS } from "@/lib/main-menu/bottom-nav-config";
import { useMessengerRoomUiStore } from "@/lib/community-messenger/stores/messenger-room-ui-store";
import { messengerUserIdsEqual } from "@/lib/community-messenger/messenger-user-id";
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
import { CommunityMessengerRoomPhase2OneToOneDotMenu } from "@/components/community-messenger/room/phase2/CommunityMessengerRoomPhase2OneToOneDotMenu";
import { MessengerStickerSheet } from "@/components/community-messenger/stickers/MessengerStickerSheet";
import { Sticker } from "lucide-react";

export function CommunityMessengerRoomPhase2RoomSheets() {
  const vm = useMessengerRoomPhase2View();
  return (
    <>
      {vm.activeSheet ? (
        <div
          className="fixed inset-0 z-[40] flex flex-col justify-end bg-black/30 pb-[calc(3.5rem+env(safe-area-inset-bottom,0px))]"
          onClick={() => {
            if (vm.activeSheet === "attach-confirm") vm.cancelAttachmentConfirm();
            else vm.dismissRoomSheet();
          }}
        >
          <div
            className={`max-h-[85vh] w-full overflow-y-auto shadow-[0_-8px_32px_rgba(0,0,0,0.08)] ${
              vm.activeSheet === "attach" ||
              vm.activeSheet === "attach-confirm" ||
              vm.activeSheet === "stickers"
                ? "rounded-t-[14px] border-t border-[color:var(--cm-room-divider)] bg-[color:var(--cm-room-header-bg)] pb-[max(0.75rem,env(safe-area-inset-bottom))]"
                : `mx-auto max-h-[78vh] w-full max-w-[520px] rounded-t-[12px] border border-[color:var(--cm-room-divider)] bg-[color:var(--cm-room-header-bg)] ${
                    vm.activeSheet === "menu" && !vm.isGroupRoom ? "p-0" : "p-5"
                  }`
            }`}
            onClick={(event) => event.stopPropagation()}
          >
            {vm.activeSheet === "attach" ? (
              <>
                <div className="border-b border-[color:var(--cm-room-divider)] px-4 py-3">
                  <p className="sam-text-body-secondary font-semibold text-[color:var(--cm-room-text)]">첨부</p>
                  <p className="mt-0.5 sam-text-helper text-[color:var(--cm-room-text-muted)]">보낼 항목을 선택하세요</p>
                </div>
                <nav className="flex flex-col" aria-label="첨부">
                  <button
                    type="button"
                    onClick={() => vm.setActiveSheet("stickers")}
                    disabled={
                      vm.roomUnavailable ||
                      vm.busy === "send-sticker" ||
                      vm.busy === "send" ||
                      vm.busy === "send-image" ||
                      vm.busy === "send-file" ||
                      vm.busy === "send-voice" ||
                      vm.busy === "delete-message"
                    }
                    className="flex min-h-[48px] w-full items-center justify-between border-b border-[color:var(--cm-room-divider)] px-4 py-3 text-left sam-text-body font-medium text-[color:var(--cm-room-text)] active:bg-[color:var(--cm-room-primary-soft)] disabled:opacity-40"
                  >
                    <span className="flex items-center gap-2.5">
                      <Sticker className="h-5 w-5 shrink-0 text-[color:var(--cm-room-primary)]" strokeWidth={2} aria-hidden />
                      스티커
                    </span>
                    <span className="text-[color:var(--cm-room-text-muted)]">›</span>
                  </button>
                  <button
                    type="button"
                    onClick={vm.openImagePicker}
                    disabled={vm.roomUnavailable || vm.busy === "send-image" || !vm.canUploadAttachments}
                    className="flex min-h-[48px] w-full items-center justify-between border-b border-[color:var(--cm-room-divider)] px-4 py-3 text-left sam-text-body font-medium text-[color:var(--cm-room-text)] active:bg-[color:var(--cm-room-primary-soft)] disabled:opacity-40"
                  >
                    사진 (갤러리)
                    <span className="text-[color:var(--cm-room-text-muted)]">›</span>
                  </button>
                  <button
                    type="button"
                    onClick={vm.openCameraPicker}
                    disabled={vm.roomUnavailable || vm.busy === "send-image" || !vm.canUploadAttachments}
                    className="flex min-h-[48px] w-full items-center justify-between border-b border-[color:var(--cm-room-divider)] px-4 py-3 text-left sam-text-body font-medium text-[color:var(--cm-room-text)] active:bg-[color:var(--cm-room-primary-soft)] disabled:opacity-40"
                  >
                    카메라
                    <span className="text-[color:var(--cm-room-text-muted)]">›</span>
                  </button>
                  <button
                    type="button"
                    onClick={vm.openFilePicker}
                    disabled={vm.roomUnavailable || vm.busy === "send-file" || !vm.canUploadAttachments}
                    className="flex min-h-[48px] w-full items-center justify-between border-b border-[color:var(--cm-room-divider)] px-4 py-3 text-left sam-text-body font-medium text-[color:var(--cm-room-text)] active:bg-[color:var(--cm-room-primary-soft)] disabled:opacity-40"
                  >
                    파일
                    <span className="text-[color:var(--cm-room-text-muted)]">›</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => void vm.sendLocationMessage()}
                    disabled={vm.roomUnavailable}
                    className="flex min-h-[48px] w-full items-center justify-between border-b border-[color:var(--cm-room-divider)] px-4 py-3 text-left sam-text-body font-medium text-[color:var(--cm-room-text)] active:bg-[color:var(--cm-room-primary-soft)] disabled:opacity-40"
                  >
                    위치
                    <span className="text-[color:var(--cm-room-text-muted)]">›</span>
                  </button>
                </nav>
                <div className="px-4 py-2">
                  <button
                    type="button"
                    onClick={() => vm.setActiveSheet("menu")}
                    className="w-full rounded-[10px] bg-[color:var(--cm-room-chat-bg)] px-3 py-2.5 text-center sam-text-helper font-medium text-[color:var(--cm-room-text-muted)] active:opacity-90"
                  >
                    사진·파일 모아보기 · 채팅방 정보는 서랍에서
                  </button>
                </div>
                <button
                  type="button"
                  onClick={vm.dismissRoomSheet}
                  className="mt-1 w-full border-t border-[color:var(--cm-room-divider)] py-3 sam-text-body font-medium text-[color:var(--cm-room-text-muted)] active:bg-[color:var(--cm-room-primary-soft)]"
                >
                  취소
                </button>
              </>
            ) : null}

            {vm.activeSheet === "attach-confirm" && vm.attachmentConfirmDraft ? (
              <>
                <div className="border-b border-[color:var(--cm-room-divider)] px-4 py-3">
                  <p className="sam-text-body-secondary font-semibold text-[color:var(--cm-room-text)]">보내기 전 확인</p>
                  <p className="mt-0.5 sam-text-helper text-[color:var(--cm-room-text-muted)]">취소하면 전송되지 않습니다</p>
                </div>
                <div className="max-h-[50vh] overflow-y-auto px-4 py-3">
                  {vm.attachmentConfirmDraft.kind === "image" ? (
                    vm.attachmentConfirmDraft.previewUrls.length > 1 ? (
                      <div className="mx-auto grid max-h-[40vh] w-full max-w-full grid-cols-2 gap-1 rounded-ui-rect border border-[color:var(--cm-room-divider)] bg-[color:var(--cm-room-chat-bg)] p-1">
                        {vm.attachmentConfirmDraft.previewUrls.map((src, idx) => (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            key={`${src}-${idx}`}
                            src={src}
                            alt=""
                            className="aspect-square w-full rounded-[6px] object-cover"
                          />
                        ))}
                      </div>
                    ) : (
                      // 로컬 blob 미리보기 — next/image 미지원
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={vm.attachmentConfirmDraft.previewUrls[0]}
                        alt="선택한 이미지 미리보기"
                        className="mx-auto max-h-[40vh] w-auto max-w-full rounded-ui-rect object-contain"
                      />
                    )
                  ) : null}
                  {vm.attachmentConfirmDraft.kind === "file" ? (
                    <div className="rounded-ui-rect border border-[color:var(--cm-room-divider)] bg-[color:var(--cm-room-chat-bg)] px-3 py-3">
                      <p className="flex items-center gap-2 sam-text-body font-semibold text-[color:var(--cm-room-text)]">
                        <FileIcon className="h-5 w-5 shrink-0 text-[color:var(--cm-room-primary)]" />
                        <span className="min-w-0 truncate">{vm.attachmentConfirmDraft.file.name}</span>
                      </p>
                      <p className="mt-1 sam-text-helper text-[color:var(--cm-room-text-muted)]">
                        {formatFileMeta(vm.attachmentConfirmDraft.file.type || "application/octet-stream", vm.attachmentConfirmDraft.file.size)}
                      </p>
                    </div>
                  ) : null}
                  {vm.attachmentConfirmDraft.kind === "location" ? (
                    <pre className="whitespace-pre-wrap break-all rounded-ui-rect border border-[color:var(--cm-room-divider)] bg-[color:var(--cm-room-chat-bg)] p-3 sam-text-body-secondary leading-snug text-[color:var(--cm-room-text)]">
                      {vm.attachmentConfirmDraft.content}
                    </pre>
                  ) : null}
                </div>
                <div className="flex gap-2 border-t border-[color:var(--cm-room-divider)] px-4 py-3">
                  <button
                    type="button"
                    onClick={vm.cancelAttachmentConfirm}
                    className="min-h-[48px] flex-1 rounded-[10px] border border-[color:var(--cm-room-divider)] bg-[color:var(--cm-room-chat-bg)] sam-text-body font-semibold text-[color:var(--cm-room-text)] active:opacity-90"
                  >
                    취소
                  </button>
                  <button
                    type="button"
                    onClick={() => void vm.confirmAttachmentSend()}
                    disabled={
                      vm.roomUnavailable ||
                      vm.busy === "send" ||
                      vm.busy === "send-image" ||
                      vm.busy === "send-file" ||
                      vm.busy === "send-voice" ||
                      vm.busy === "delete-message"
                    }
                    className="min-h-[48px] flex-[1.15] rounded-[10px] bg-[color:var(--cm-room-primary)] sam-text-body font-semibold text-white shadow-sm active:opacity-90 disabled:opacity-40"
                  >
                    보내기
                  </button>
                </div>
              </>
            ) : null}

            {vm.activeSheet === "stickers" ? (
              <MessengerStickerSheet
                open
                onClose={vm.dismissRoomSheet}
                onPick={(url, sid) => void vm.sendSticker(url, sid)}
              />
            ) : null}

            {vm.activeSheet === "menu" && !vm.isGroupRoom ? (
              <CommunityMessengerRoomPhase2OneToOneDotMenu vm={vm} />
            ) : null}
            {vm.activeSheet === "menu" && vm.isGroupRoom ? (
              <>
                <p className="sam-text-body-secondary font-medium text-sam-fg">채팅방 서랍</p>
                <h2 className="mt-1 sam-text-page-title font-semibold text-sam-fg">{vm.snapshot.room.title}</h2>
                <div className="mt-4 space-y-4">
                  <div className="grid grid-cols-2 gap-2">
                    <div className="rounded-ui-rect border border-sam-border bg-sam-app px-4 py-3">
                      <p className="sam-text-xxs font-medium text-sam-muted">참여자</p>
                      <p className="mt-1 sam-text-page-title font-semibold text-sam-fg">{vm.snapshot.room.memberCount}</p>
                      <p className="mt-1 sam-text-helper text-sam-muted">{vm.myRoleLabel}</p>
                    </div>
                    <div className="rounded-ui-rect border border-sam-border bg-sam-app px-4 py-3">
                      <p className="sam-text-xxs font-medium text-sam-muted">공유 항목</p>
                      <p className="mt-1 sam-text-page-title font-semibold text-sam-fg">
                        {vm.photoMessageCount + vm.voiceMessageCount + vm.fileMessageCount + vm.linkMessageCount}
                      </p>
                      <p className="mt-1 sam-text-helper text-sam-muted">
                        사진 {vm.photoMessageCount} · 음성 {vm.voiceMessageCount} · 파일 {vm.fileMessageCount} · 링크 {vm.linkMessageCount}
                      </p>
                    </div>
                  </div>

                  {vm.isGroupRoom ? (
                    <div className="rounded-ui-rect border border-sam-border bg-sam-app px-4 py-3">
                      <p className="sam-text-xxs font-medium text-sam-muted">그룹 통화 상태</p>
                      <p className="mt-1 sam-text-body-lg font-semibold text-sam-fg">{vm.groupCallStatusLabel}</p>
                      <p className="mt-1 sam-text-helper text-sam-muted">
                        {vm.activeGroupCall
                          ? `${vm.activeGroupCall.callKind === "video" ? "영상" : "음성"} · ${vm.activeGroupCall.participants.length}명 참여`
                          : vm.canStartGroupCall
                            ? "지금 시작 가능"
                            : "시작 권한 없음"}
                      </p>
                    </div>
                  ) : null}

                  {vm.roomNotice ? (
                    <button
                      type="button"
                      onClick={() => vm.openInfoSheet("notice")}
                      className="flex w-full items-start justify-between rounded-ui-rect border border-sam-border bg-sam-surface px-4 py-3 text-left"
                    >
                      <div className="min-w-0">
                        <p className="sam-text-helper font-semibold text-sam-fg">공지</p>
                        <p className="mt-1 line-clamp-2 sam-text-body-secondary leading-5 text-sam-fg">{vm.roomNotice}</p>
                      </div>
                      <span className="pl-3 sam-text-page-title text-sam-meta">›</span>
                    </button>
                  ) : null}

                  {vm.managementEventMessages.length ? (
                    <div className="rounded-ui-rect border border-sam-border p-4">
                      <p className="sam-text-body font-semibold text-sam-fg">운영 이력</p>
                      <div className="mt-3 space-y-2">
                        {vm.managementEventMessages.map((event) => {
                          const summary = describeManagementEvent(event.content);
                          return (
                            <button
                              key={event.id}
                              type="button"
                              onClick={() => vm.scrollToRoomMessage(event.id)}
                              className="flex w-full items-start justify-between gap-3 rounded-ui-rect bg-sam-app px-3 py-3 text-left"
                            >
                              <div className="min-w-0 flex-1">
                                <p className="sam-text-helper font-semibold text-sam-fg">{summary.title}</p>
                                <p className="mt-1 line-clamp-2 sam-text-helper leading-5 text-sam-muted">{summary.detail}</p>
                              </div>
                              <span className="shrink-0 sam-text-xxs text-sam-meta">{formatTime(event.createdAt)}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ) : null}

                  <div className="space-y-2">
                    <p className="px-1 sam-text-helper font-semibold text-sam-muted">대화방</p>
                    <button
                      type="button"
                      onClick={() => vm.setActiveSheet("members")}
                      className="flex items-center justify-between rounded-ui-rect border border-sam-border px-4 py-4 text-left"
                    >
                      <div>
                        <p className="sam-text-body font-semibold text-sam-fg">{vm.isGroupRoom ? "참여자 및 초대" : "대화상대 정보"}</p>
                        <p className="mt-1 sam-text-helper text-sam-muted">
                          {vm.isGroupRoom
                            ? `${vm.snapshot.room.memberCount}명 · ${vm.canInviteMembers ? "초대 가능" : "초대 제한"}`
                            : "프로필 · 통화"}
                        </p>
                      </div>
                      <span className="sam-text-page-title text-sam-meta">›</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => vm.openInfoSheet()}
                      className="flex items-center justify-between rounded-ui-rect border border-sam-border px-4 py-4 text-left"
                    >
                      <div>
                        <p className="sam-text-body font-semibold text-sam-fg">채팅방 정보</p>
                        <p className="mt-1 sam-text-helper text-sam-muted">
                          {vm.roomNotice ? "공지 있음" : "공지 없음"}
                          {vm.snapshot.room.ownerLabel ? ` · 방장 ${vm.snapshot.room.ownerLabel}` : ""}
                        </p>
                      </div>
                      <span className="sam-text-page-title text-sam-meta">›</span>
                    </button>
                  </div>

                  <div className="space-y-2">
                    <p className="px-1 sam-text-helper font-semibold text-sam-muted">콘텐츠</p>
                    <button
                      type="button"
                      onClick={() => {
                        vm.setRoomSearchQuery("");
                        vm.setActiveSheet("search");
                      }}
                      className="flex items-center justify-between rounded-ui-rect border border-sam-border px-4 py-4 text-left"
                    >
                      <div>
                        <p className="sam-text-body font-semibold text-sam-fg">대화 내 검색</p>
                        <p className="mt-1 sam-text-helper text-sam-muted">메시지 · 보낸 사람 · 통화 기록</p>
                      </div>
                      <span className="sam-text-page-title text-sam-meta">›</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => vm.setActiveSheet("media")}
                      className="flex items-center justify-between rounded-ui-rect border border-sam-border px-4 py-4 text-left"
                    >
                      <div>
                        <p className="sam-text-body font-semibold text-sam-fg">사진·음성</p>
                        <p className="mt-1 sam-text-helper text-sam-muted">사진 {vm.photoMessageCount}개 · 음성 {vm.voiceMessageCount}개</p>
                      </div>
                      <span className="sam-text-page-title text-sam-meta">›</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => vm.setActiveSheet("files")}
                      className="flex items-center justify-between rounded-ui-rect border border-sam-border px-4 py-4 text-left"
                    >
                      <div>
                        <p className="sam-text-body font-semibold text-sam-fg">파일</p>
                        <p className="mt-1 sam-text-helper text-sam-muted">파일 {vm.fileMessageCount}개</p>
                      </div>
                      <span className="sam-text-page-title text-sam-meta">›</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => vm.setActiveSheet("links")}
                      className="flex items-center justify-between rounded-ui-rect border border-sam-border px-4 py-4 text-left"
                    >
                      <div>
                        <p className="sam-text-body font-semibold text-sam-fg">링크</p>
                        <p className="mt-1 sam-text-helper text-sam-muted">링크 {vm.linkMessageCount}개</p>
                      </div>
                      <span className="sam-text-page-title text-sam-meta">›</span>
                    </button>
                  </div>

                  <div className="space-y-2">
                    <p className="px-1 sam-text-helper font-semibold text-sam-muted">설정</p>
                    <button
                      type="button"
                      onClick={() => void vm.toggleRoomMute()}
                      disabled={vm.busy === "room-mute"}
                      className="flex items-center justify-between rounded-ui-rect border border-sam-border px-4 py-4 text-left disabled:opacity-40"
                    >
                      <div>
                        <p className="sam-text-body font-semibold text-sam-fg">
                          {vm.snapshot.room.isMuted ? "이 채팅방 알림 켜기" : "이 채팅방 알림 끄기"}
                        </p>
                        <p className="mt-1 sam-text-helper text-sam-muted">
                          {vm.snapshot.room.isMuted ? "개별 알림 꺼짐" : "개별 알림 켜짐"}
                        </p>
                      </div>
                      <span
                        className={`rounded-ui-rect px-2 py-1 sam-text-xxs font-semibold ${
                          vm.snapshot.room.isMuted ? "bg-sam-ink text-white" : "bg-sam-surface-muted text-sam-muted"
                        }`}
                      >
                        {vm.busy === "room-mute" ? "저장 중" : vm.snapshot.room.isMuted ? "꺼짐" : "켜짐"}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => void vm.toggleRoomArchive()}
                      disabled={vm.busy === "room-archive" || !communityMessengerRoomIsGloballyUsable(vm.snapshot.room)}
                      className="flex items-center justify-between rounded-ui-rect border border-sam-border px-4 py-4 text-left disabled:opacity-40"
                    >
                      <div>
                        <p className="sam-text-body font-semibold text-sam-fg">
                          {!vm.snapshot.room.isArchivedByViewer ? "이 채팅방 보관" : "이 채팅방 보관 해제"}
                        </p>
                        <p className="mt-1 sam-text-helper text-sam-muted">
                          {!vm.snapshot.room.isArchivedByViewer ? "현재 채팅 목록" : "현재 보관함"}
                        </p>
                      </div>
                      <span
                        className={`rounded-ui-rect px-2 py-1 sam-text-xxs font-semibold ${
                          !vm.snapshot.room.isArchivedByViewer ? "bg-sam-surface-muted text-sam-muted" : "bg-sam-ink text-white"
                        }`}
                      >
                        {vm.busy === "room-archive" ? "저장 중" : !vm.snapshot.room.isArchivedByViewer ? "활성" : "보관됨"}
                      </span>
                    </button>
                  </div>

                  {!vm.isGroupRoom ? (
                    <div className="space-y-2">
                      <p className="px-1 sam-text-helper font-semibold text-sam-muted">통화</p>
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            vm.dismissRoomSheet();
                            void vm.startManagedDirectCall("voice");
                          }}
                          disabled={vm.roomUnavailable || vm.outgoingDialLocked}
                          className="rounded-ui-rect border border-sam-border px-4 py-4 text-left sam-text-body font-semibold text-sam-fg disabled:opacity-40"
                        >
                          음성 통화
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            vm.dismissRoomSheet();
                            void vm.startManagedDirectCall("video");
                          }}
                          disabled={vm.roomUnavailable || vm.outgoingDialLocked}
                          className="rounded-ui-rect border border-sam-border px-4 py-4 text-left sam-text-body font-semibold text-sam-fg disabled:opacity-40"
                        >
                          {vm.t("nav_video_call_label")}
                        </button>
                      </div>
                    </div>
                  ) : vm.isGroupRoom ? (
                    <div className="space-y-2">
                      <p className="px-1 sam-text-helper font-semibold text-sam-muted">통화</p>
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => void vm.startGroupCall("voice")}
                          disabled={!vm.canStartGroupCall || vm.call.busy === "call-start" || vm.call.busy === "device-prepare"}
                          className="rounded-ui-rect border border-sam-border px-4 py-4 text-left sam-text-body font-semibold text-sam-fg disabled:opacity-40"
                        >
                          그룹 음성 통화
                        </button>
                        <button
                          type="button"
                          onClick={() => void vm.startGroupCall("video")}
                          disabled={!vm.canStartGroupCall || vm.call.busy === "call-start" || vm.call.busy === "device-prepare"}
                          className="rounded-ui-rect border border-sam-border px-4 py-4 text-left sam-text-body font-semibold text-sam-fg disabled:opacity-40"
                        >
                          그룹 영상 통화
                        </button>
                      </div>
                      {!vm.canStartGroupCall ? (
                        <p className="px-1 sam-text-helper text-sam-muted">시작 권한 없음</p>
                      ) : null}
                    </div>
                  ) : null}

                  <div className="space-y-2">
                    <p className="px-1 sam-text-helper font-semibold text-sam-muted">기타</p>
                    {vm.isGroupRoom ? (
                      <button
                        type="button"
                        onClick={() => {
                          if (vm.isOwner && vm.isPrivateGroupRoom) {
                            vm.openMembersForOwnerTransfer();
                            return;
                          }
                          void vm.leaveRoom();
                        }}
                        disabled={vm.busy === "leave-room"}
                        className="w-full rounded-ui-rect border border-red-200 bg-sam-surface px-4 py-4 text-left sam-text-body font-semibold text-red-700 disabled:opacity-40"
                      >
                        {vm.busy === "leave-room"
                          ? vm.t("nav_messenger_leaving")
                          : vm.isOwner && vm.isPrivateGroupRoom
                            ? "방장 위임 후 나가기"
                            : vm.t("nav_messenger_leave_group_room")}
                      </button>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => {
                        vm.dismissRoomSheet();
                        void vm.reportTarget({ reportType: "room" });
                      }}
                      className="w-full rounded-ui-rect border border-red-200 bg-sam-surface px-4 py-4 text-left sam-text-body font-semibold text-red-700"
                    >
                      {vm.t("nav_messenger_report")}
                    </button>
                  </div>
                </div>
              </>
            ) : null}

            {vm.activeSheet === "members" ? (
              <>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="sam-text-body-secondary font-medium text-sam-fg">{vm.t("nav_messenger_participants")}</p>
                    <h2 className="mt-1 sam-text-page-title font-semibold text-sam-fg">{vm.t("nav_messenger_participating_members")}</h2>
                  </div>
                  <button
                    type="button"
                    onClick={() => vm.setActiveSheet("menu")}
                    className="rounded-ui-rect border border-sam-border px-3 py-2 sam-text-helper text-sam-fg"
                  >
                    {vm.t("tier1_back")}
                  </button>
                </div>
                <div className="mt-4 grid gap-2">
                  {vm.isGroupRoom ? (
                    <div className="grid grid-cols-3 gap-2">
                      <div className="rounded-ui-rect border border-sam-border bg-sam-surface px-4 py-3">
                        <p className="sam-text-xxs font-medium text-sam-muted">참여자</p>
                        <p className="mt-1 sam-text-body-lg font-semibold text-sam-fg">{vm.snapshot.room.memberCount}명</p>
                        <p className="mt-1 sam-text-helper text-sam-muted">{vm.roomTypeLabel}</p>
                      </div>
                      <div className="rounded-ui-rect border border-sam-border bg-sam-surface px-4 py-3">
                        <p className="sam-text-xxs font-medium text-sam-muted">운영진</p>
                        <p className="mt-1 sam-text-body-lg font-semibold text-sam-fg">방장 1 · 관리자 {vm.groupAdminCount}</p>
                        <p className="mt-1 sam-text-helper text-sam-muted">현재 그룹 운영 가능 인원</p>
                      </div>
                      <div className="rounded-ui-rect border border-sam-border bg-sam-surface px-4 py-3">
                        <p className="sam-text-xxs font-medium text-sam-muted">초대 상태</p>
                        <p className="mt-1 sam-text-body-lg font-semibold text-sam-fg">{vm.canInviteMembers ? "가능" : "제한"}</p>
                        <p className="mt-1 sam-text-helper text-sam-muted">
                          닉네임 프로필 {vm.aliasProfileCount}명
                          {vm.roomMembersDisplay.length < vm.snapshot.room.memberCount ? " · 표시 범위 기준" : ""}
                        </p>
                      </div>
                    </div>
                  ) : null}
                  {vm.isGroupRoom && vm.snapshot.room.memberCount > vm.roomMembersDisplay.length ? (
                    <p className="sam-text-helper leading-5 text-sam-muted">
                      참여자 {vm.snapshot.room.memberCount}명 중 {vm.roomMembersDisplay.length}명 프로필을 불러왔습니다. 나머지는
                      아래에서 더 불러올 수 있습니다.
                    </p>
                  ) : null}
                  {vm.isGroupRoom && vm.membersListNextOffset !== null ? (
                    <button
                      type="button"
                      onClick={() => void vm.loadMoreRoomMembers()}
                      disabled={vm.membersPagingBusy}
                      className="w-full rounded-ui-rect border border-sam-border bg-sam-app px-4 py-3 sam-text-body font-medium text-sam-fg disabled:opacity-50"
                    >
                      {vm.membersPagingBusy ? "불러오는 중…" : "멤버 더 불러오기"}
                    </button>
                  ) : null}
                  {vm.isOwner && vm.isPrivateGroupRoom ? (
                    <div className="rounded-ui-rect border border-sam-border bg-sam-surface px-4 py-3">
                      <p className="sam-text-body-secondary font-semibold text-sam-fg">운영 안내</p>
                      <p className="mt-1 sam-text-helper leading-5 text-sam-muted">
                        멤버를 선택하면 방장 위임, 관리자 지정, 내보내기를 같은 메뉴에서 바로 처리할 수 있습니다.
                      </p>
                    </div>
                  ) : null}
                  {vm.sortedMembers.map((member) => (
                    <button
                      key={member.id}
                      type="button"
                      onClick={() => {
                        if (messengerUserIdsEqual(member.id, vm.snapshot.viewerUserId)) return;
                        vm.setMemberActionTarget(member);
                      }}
                      className="w-full rounded-ui-rect border border-sam-border bg-sam-surface px-4 py-3 text-left"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="sam-text-body font-semibold text-sam-fg">{member.label}</p>
                            {vm.snapshot.room.ownerUserId && messengerUserIdsEqual(member.id, vm.snapshot.room.ownerUserId) ? (
                              <span className="rounded-ui-rect border border-sam-border bg-sam-app px-2 py-0.5 sam-text-xxs font-semibold text-sam-fg">
                                방장
                              </span>
                            ) : null}
                            {member.memberRole === "admin" ? (
                              <span className="rounded-ui-rect border border-sam-border bg-sam-app px-2 py-0.5 sam-text-xxs font-semibold text-sam-fg">관리자</span>
                            ) : null}
                            {messengerUserIdsEqual(member.id, vm.snapshot.viewerUserId) ? (
                              <span className="rounded-ui-rect bg-sam-surface-muted px-2 py-0.5 sam-text-xxs font-semibold text-sam-fg">나</span>
                            ) : null}
                            {member.identityMode === "alias" ? (
                              <span className="rounded-ui-rect border border-sam-border bg-sam-app px-2 py-0.5 sam-text-xxs font-semibold text-sam-fg">닉네임</span>
                            ) : null}
                          </div>
                          <p className="mt-1 sam-text-helper text-sam-muted">
                            {member.subtitle ?? (member.identityMode === "alias" ? vm.t("nav_messenger_member_alias_joined") : vm.t("nav_messenger_member_joined"))}
                          </p>
                          {!messengerUserIdsEqual(member.id, vm.snapshot.viewerUserId) ? (
                            <p className="mt-2 sam-text-xxs text-sam-meta">
                              {vm.isPrivateGroupRoom ? "탭해서 대화, 역할, 내보내기" : "탭해서 대화와 프로필 액션"}
                            </p>
                          ) : null}
                        </div>
                        {!messengerUserIdsEqual(member.id, vm.snapshot.viewerUserId) ? (
                          <span className="pt-1 sam-text-page-title leading-none text-sam-meta">›</span>
                        ) : null}
                      </div>
                    </button>
                  ))}
                </div>
                {vm.isPrivateGroupRoom ? (
                  <div className="mt-4 rounded-ui-rect bg-sam-app p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="sam-text-body font-semibold text-sam-fg">{vm.t("nav_messenger_invite_members")}</p>
                        <p className="mt-1 sam-text-helper text-sam-muted">
                          {vm.canInviteMembers ? vm.t("nav_messenger_invite_members_desc") : "이 방은 현재 멤버 초대가 제한되어 있습니다."}
                        </p>
                      </div>
                      <span className="rounded-ui-rect bg-sam-surface px-2 py-1 sam-text-xxs font-semibold text-sam-muted">
                        {vm.myRoleLabel}
                      </span>
                    </div>
                    {vm.canInviteMembers && vm.inviteCandidates.length ? (
                      <>
                        <div className="mt-3 flex items-center justify-between gap-3">
                          <p className="sam-text-helper text-sam-muted">초대 후보 {vm.filteredInviteCandidates.length}명 · 선택 {vm.inviteIds.length}명</p>
                          {vm.inviteIds.length ? (
                            <button
                              type="button"
                              onClick={() => vm.setInviteIds([])}
                              className="rounded-ui-rect border border-sam-border bg-sam-surface px-2.5 py-1 sam-text-xxs font-medium text-sam-muted"
                            >
                              선택 해제
                            </button>
                          ) : null}
                        </div>
                        <input
                          value={vm.inviteSearchQuery}
                          onChange={(e) => vm.setInviteSearchQuery(e.target.value)}
                          placeholder="친구 검색"
                          className="mt-3 h-10 w-full rounded-ui-rect border border-sam-border bg-sam-surface px-3 sam-text-body-secondary outline-none focus:border-sam-border"
                        />
                        {vm.selectedInviteCandidates.length ? (
                          <div className="mt-3 flex flex-wrap gap-2">
                            {vm.selectedInviteCandidates.map((friend) => (
                              <button
                                key={`invite-selected-${friend.id}`}
                                type="button"
                                onClick={() => vm.setInviteIds((prev) => prev.filter((id) => id !== friend.id))}
                                className="rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-1.5 sam-text-helper font-medium text-sam-fg"
                              >
                                {friend.label} 닫기
                              </button>
                            ))}
                          </div>
                        ) : null}
                      </>
                    ) : null}
                    <div className="mt-3 grid gap-2">
                      {vm.canInviteMembers && vm.filteredInviteCandidates.length ? (
                        vm.filteredInviteCandidates.map((friend) => (
                          <label
                            key={friend.id}
                            className="flex items-center justify-between rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-3"
                          >
                            <div>
                              <p className="sam-text-body-secondary font-semibold text-sam-fg">{friend.label}</p>
                              <p className="sam-text-helper text-sam-muted">{friend.subtitle ?? vm.t("nav_messenger_friend")}</p>
                            </div>
                            <input
                              type="checkbox"
                              checked={vm.inviteIds.includes(friend.id)}
                              onChange={(e) => {
                                vm.setInviteIds((prev) =>
                                  e.target.checked ? [...prev, friend.id] : prev.filter((id) => id !== friend.id)
                                );
                              }}
                              className="h-4 w-4 rounded border-sam-border text-sam-fg focus:ring-sam-border"
                            />
                          </label>
                        ))
                      ) : vm.canInviteMembers && vm.inviteCandidates.length ? (
                        <p className="sam-text-helper text-sam-muted">검색 결과가 없습니다.</p>
                      ) : vm.canInviteMembers ? (
                        <p className="sam-text-helper text-sam-muted">{vm.t("nav_messenger_no_invitable_friends")}</p>
                      ) : (
                        <p className="sam-text-helper text-sam-muted">친구 초대는 방장이 허용한 방에서만 사용할 수 있습니다.</p>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => void vm.inviteMembers()}
                      disabled={!vm.canInviteMembers || vm.inviteIds.length === 0 || vm.busy === "invite"}
                      className="mt-3 rounded-ui-rect bg-sam-ink px-4 py-3 sam-text-body-secondary font-semibold text-white disabled:opacity-40"
                    >
                      {vm.t("nav_messenger_invite_selected_friends")}
                    </button>
                  </div>
                ) : null}
              </>
            ) : null}

            {vm.activeSheet === "info" ? (
              <>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="sam-text-body-secondary font-medium text-sam-fg">{vm.t("nav_messenger_room_info")}</p>
                    <h2 className="mt-1 sam-text-page-title font-semibold text-sam-fg">{vm.t("nav_messenger_room_details")}</h2>
                  </div>
                  <button
                    type="button"
                    onClick={() => vm.setActiveSheet("menu")}
                    className="rounded-ui-rect border border-sam-border px-3 py-2 sam-text-helper text-sam-fg"
                  >
                    {vm.t("tier1_back")}
                  </button>
                </div>

                <div className="mt-4 space-y-3">
                  <div className="grid grid-cols-2 gap-2">
                    <div className="rounded-ui-rect border border-sam-border bg-sam-surface px-4 py-3">
                      <p className="sam-text-xxs font-medium text-sam-muted">참여자</p>
                      <p className="mt-1 sam-text-body-lg font-semibold text-sam-fg">{vm.snapshot.room.memberCount}명</p>
                      <p className="mt-1 sam-text-helper text-sam-muted">{vm.roomTypeLabel}</p>
                    </div>
                    <div className="rounded-ui-rect border border-sam-border bg-sam-surface px-4 py-3">
                      <p className="sam-text-xxs font-medium text-sam-muted">내 상태</p>
                      <p className="mt-1 sam-text-body-lg font-semibold text-sam-fg">{vm.myRoleLabel}</p>
                      <p className="mt-1 sam-text-helper text-sam-muted">{vm.roomIdentityLabel || "기본 프로필"}</p>
                    </div>
                    <div className="rounded-ui-rect border border-sam-border bg-sam-surface px-4 py-3">
                      <p className="sam-text-xxs font-medium text-sam-muted">참여 방식</p>
                      <p className="mt-1 sam-text-body-lg font-semibold text-sam-fg">{vm.roomJoinLabel || "기본 입장"}</p>
                      <p className="mt-1 sam-text-helper text-sam-muted">
                        {vm.isOpenGroupRoom ? (vm.snapshot.room.isDiscoverable ? "검색 노출" : "비공개") : "초대 기반"}
                      </p>
                    </div>
                    <div className="rounded-ui-rect border border-sam-border bg-sam-surface px-4 py-3">
                      <p className="sam-text-xxs font-medium text-sam-muted">공유 항목</p>
                      <p className="mt-1 sam-text-body-lg font-semibold text-sam-fg">
                        {vm.photoMessageCount + vm.voiceMessageCount + vm.fileMessageCount + vm.linkMessageCount}개
                      </p>
                      <p className="mt-1 sam-text-helper text-sam-muted">
                        사진 {vm.photoMessageCount} · 파일 {vm.fileMessageCount}
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    <button
                      type="button"
                      onClick={() => vm.setActiveSheet("members")}
                      className="rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-3 text-left"
                    >
                      <p className="sam-text-xxs text-sam-muted">참여자</p>
                      <p className="mt-1 sam-text-body-secondary font-semibold text-sam-fg">{vm.isGroupRoom ? "멤버 관리" : "상대 정보"}</p>
                    </button>
                    <button
                      type="button"
                      onClick={() => vm.setActiveSheet("media")}
                      className="rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-3 text-left"
                    >
                      <p className="sam-text-xxs text-sam-muted">미디어</p>
                      <p className="mt-1 sam-text-body-secondary font-semibold text-sam-fg">사진·음성</p>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        vm.setRoomSearchQuery("");
                        vm.setActiveSheet("search");
                      }}
                      className="rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-3 text-left"
                    >
                      <p className="sam-text-xxs text-sam-muted">검색</p>
                      <p className="mt-1 sam-text-body-secondary font-semibold text-sam-fg">대화 내 검색</p>
                    </button>
                  </div>

                  <div className="rounded-ui-rect border border-sam-border p-4">
                    <p className="sam-text-body font-semibold text-sam-fg">기본 정보</p>
                    <p className="mt-3 sam-text-body font-semibold text-sam-fg">{vm.snapshot.room.title}</p>
                    <p className="mt-2 sam-text-body-secondary leading-5 text-sam-muted">
                      {vm.roomSummaryHoldsOnlyTradeOrDeliveryMeta
                        ? vm.roomSubtitle || vm.t("nav_messenger_room_no_intro")
                        : vm.snapshot.room.summary?.trim() || vm.roomSubtitle || vm.t("nav_messenger_room_no_intro")}
                    </p>
                    <div className="mt-4 space-y-2 border-t border-sam-border-soft pt-4 sam-text-body-secondary text-sam-fg">
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-sam-muted">채팅방 종류</span>
                        <span className="font-medium text-sam-fg">{vm.roomTypeLabel}</span>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-sam-muted">참여자</span>
                        <span className="font-medium text-sam-fg">{vm.snapshot.room.memberCount}명</span>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-sam-muted">방장</span>
                        <span className="font-medium text-sam-fg">{vm.snapshot.room.ownerLabel || "-"}</span>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-sam-muted">내 역할</span>
                        <span className="font-medium text-sam-fg">{vm.myRoleLabel}</span>
                      </div>
                      {vm.snapshot.room.memberLimit ? (
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-sam-muted">최대 인원</span>
                          <span className="font-medium text-sam-fg">{vm.snapshot.room.memberLimit}명</span>
                        </div>
                      ) : null}
                      {vm.roomJoinLabel ? (
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-sam-muted">참여 방식</span>
                          <span className="font-medium text-sam-fg">{vm.roomJoinLabel}</span>
                        </div>
                      ) : null}
                      {vm.roomIdentityLabel ? (
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-sam-muted">표시 이름</span>
                          <span className="font-medium text-sam-fg">{vm.roomIdentityLabel}</span>
                        </div>
                      ) : null}
                      {vm.isOpenGroupRoom ? (
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-sam-muted">검색 노출</span>
                          <span className="font-medium text-sam-fg">{vm.snapshot.room.isDiscoverable ? "허용" : "비공개"}</span>
                        </div>
                      ) : null}
                      {vm.isOpenGroupRoom ? (
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-sam-muted">비밀번호</span>
                          <span className="font-medium text-sam-fg">{vm.snapshot.room.requiresPassword ? "사용" : "없음"}</span>
                        </div>
                      ) : null}
                      {vm.isPrivateGroupRoom ? (
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-sam-muted">멤버 초대</span>
                          <span className="font-medium text-sam-fg">{vm.snapshot.room.allowMemberInvite ? "허용" : "제한"}</span>
                        </div>
                      ) : null}
                    </div>
                  </div>

                  {vm.isGroupRoom ? (
                    <div className="rounded-ui-rect border border-sam-border p-4">
                      <p className="sam-text-body font-semibold text-sam-fg">통화 상태</p>
                      <div className="mt-3 space-y-2 sam-text-body-secondary text-sam-fg">
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-sam-muted">현재 상태</span>
                          <span className="font-medium text-sam-fg">{vm.groupCallStatusLabel}</span>
                        </div>
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-sam-muted">시작 권한</span>
                          <span className="font-medium text-sam-fg">{vm.canStartGroupCall ? "가능" : "제한"}</span>
                        </div>
                        {vm.activeGroupCall ? (
                          <div className="flex items-center justify-between gap-3">
                            <span className="text-sam-muted">현재 참여자</span>
                            <span className="font-medium text-sam-fg">{vm.activeGroupCall.participants.length}명</span>
                          </div>
                        ) : null}
                      </div>
                    </div>
                  ) : null}

                  <div className="rounded-ui-rect border border-sam-border p-4">
                    <p className="sam-text-body font-semibold text-sam-fg">공유된 항목</p>
                    <div className="mt-3 grid grid-cols-4 gap-2">
                      <button
                        type="button"
                        onClick={() => vm.setActiveSheet("media")}
                        className="rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-3 text-left"
                      >
                        <p className="sam-text-xxs text-sam-muted">사진</p>
                        <p className="mt-1 sam-text-body-lg font-semibold text-sam-fg">{vm.photoMessageCount}</p>
                      </button>
                      <button
                        type="button"
                        onClick={() => vm.setActiveSheet("media")}
                        className="rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-3 text-left"
                      >
                        <p className="sam-text-xxs text-sam-muted">음성</p>
                        <p className="mt-1 sam-text-body-lg font-semibold text-sam-fg">{vm.voiceMessageCount}</p>
                      </button>
                      <button
                        type="button"
                        onClick={() => vm.setActiveSheet("files")}
                        className="rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-3 text-left"
                      >
                        <p className="sam-text-xxs text-sam-muted">파일</p>
                        <p className="mt-1 sam-text-body-lg font-semibold text-sam-fg">{vm.fileMessageCount}</p>
                      </button>
                      <button
                        type="button"
                        onClick={() => vm.setActiveSheet("links")}
                        className="rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-3 text-left"
                      >
                        <p className="sam-text-xxs text-sam-muted">링크</p>
                        <p className="mt-1 sam-text-body-lg font-semibold text-sam-fg">{vm.linkMessageCount}</p>
                      </button>
                    </div>
                  </div>

                  {vm.isPrivateGroupRoom ? (
                    <div className="rounded-ui-rect border border-sam-border p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="sam-text-body font-semibold text-sam-fg">운영</p>
                          <p className="mt-1 sam-text-helper text-sam-muted">
                            방장 {vm.snapshot.room.ownerLabel ? `· ${vm.snapshot.room.ownerLabel}` : ""} · 관리자 {vm.groupAdminCount}명
                          </p>
                        </div>
                        <span className="rounded-ui-rect border border-sam-border bg-sam-surface px-2 py-1 sam-text-xxs font-semibold text-sam-fg">{vm.myRoleLabel}</span>
                      </div>
                      <div className="mt-3 grid grid-cols-3 gap-2">
                        <div className="rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-3">
                          <p className="sam-text-xxs text-sam-muted">공지</p>
                          <p className="mt-1 sam-text-body-secondary font-semibold text-sam-fg">{vm.privateGroupNoticeStatusLabel}</p>
                          <p className="mt-1 sam-text-xxs text-sam-meta">상단 고정 상태</p>
                        </div>
                        <div className="rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-3">
                          <p className="sam-text-xxs text-sam-muted">허용 권한</p>
                          <p className="mt-1 sam-text-body-secondary font-semibold text-sam-fg">{vm.allowedPrivateGroupPermissionCount}/6</p>
                          <p className="mt-1 sam-text-xxs text-sam-meta">운영 설정 반영</p>
                        </div>
                        <div className="rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-3">
                          <p className="sam-text-xxs text-sam-muted">운영 이력</p>
                          <p className="mt-1 sam-text-body-secondary font-semibold text-sam-fg">{vm.managementEventMessages.length}건</p>
                          <p className="mt-1 sam-text-xxs text-sam-meta">역할 변경 기록</p>
                        </div>
                      </div>
                      <div className="mt-3 grid grid-cols-3 gap-2">
                        <button
                          type="button"
                          onClick={() => vm.openInfoSheet("notice")}
                          className="rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-3 text-left"
                        >
                          <p className="sam-text-xxs text-sam-muted">운영</p>
                          <p className="mt-1 sam-text-body-secondary font-semibold text-sam-fg">공지</p>
                          <p className="mt-1 sam-text-xxs text-sam-meta">등록 및 수정</p>
                        </button>
                        <button
                          type="button"
                          onClick={() => vm.openInfoSheet("permissions")}
                          className="rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-3 text-left"
                        >
                          <p className="sam-text-xxs text-sam-muted">운영</p>
                          <p className="mt-1 sam-text-body-secondary font-semibold text-sam-fg">권한</p>
                          <p className="mt-1 sam-text-xxs text-sam-meta">허용 범위 조정</p>
                        </button>
                        <button
                          type="button"
                          onClick={() => vm.openInfoSheet("history")}
                          className="rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-3 text-left"
                        >
                          <p className="sam-text-xxs text-sam-muted">운영</p>
                          <p className="mt-1 sam-text-body-secondary font-semibold text-sam-fg">이력</p>
                          <p className="mt-1 sam-text-xxs text-sam-meta">시스템 기록 보기</p>
                        </button>
                      </div>
                      <div className="mt-3 grid gap-2">
                        <button
                          type="button"
                          onClick={() => vm.setActiveSheet("members")}
                          className="rounded-ui-rect border border-sam-border px-4 py-3 text-left sam-text-body-secondary font-semibold text-sam-fg"
                        >
                          {vm.isOwner ? "멤버 · 위임" : "멤버 · 초대"}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            if (vm.isOwner) {
                              vm.setActiveSheet("members");
                              return;
                            }
                            void vm.leaveRoom();
                          }}
                          disabled={vm.busy === "leave-room"}
                          className="rounded-ui-rect border border-red-200 bg-sam-surface px-4 py-3 text-left sam-text-body-secondary font-semibold text-red-700 disabled:opacity-40"
                        >
                          {vm.busy === "leave-room"
                            ? vm.t("nav_messenger_leaving")
                            : vm.isOwner
                              ? "방장 위임 후 나가기"
                              : vm.t("nav_messenger_leave_group_room")}
                        </button>
                      </div>
                    </div>
                  ) : null}

                  {vm.isPrivateGroupRoom ? (
                    <div ref={vm.groupNoticeSectionRef} className="rounded-ui-rect border border-sam-border p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="sam-text-body font-semibold text-sam-fg">그룹 공지</p>
                          <p className="mt-1 sam-text-helper text-sam-muted">
                            {vm.privateGroupNotice ? "상단과 서랍에 노출 중" : "등록된 공지 없음"}
                          </p>
                        </div>
                        {vm.snapshot.room.noticeUpdatedAt ? (
                          <span className="rounded-ui-rect bg-sam-surface-muted px-2 py-1 sam-text-xxs font-semibold text-sam-fg">
                            {formatTime(vm.snapshot.room.noticeUpdatedAt)}
                          </span>
                        ) : null}
                      </div>
                      <div className="mt-3 grid grid-cols-2 gap-2">
                        <div className="rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-3">
                          <p className="sam-text-xxs text-sam-muted">상태</p>
                          <p className="mt-1 sam-text-body-secondary font-semibold text-sam-fg">{vm.privateGroupNoticeStatusLabel}</p>
                        </div>
                        <div className="rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-3">
                          <p className="sam-text-xxs text-sam-muted">노출</p>
                          <p className="mt-1 sam-text-body-secondary font-semibold text-sam-fg">{vm.privateGroupNotice ? "상단 표시" : "미설정"}</p>
                        </div>
                      </div>
                      {vm.canEditGroupNotice ? (
                        <div className="mt-3 grid gap-3">
                          <textarea
                            value={vm.privateGroupNoticeDraft}
                            onChange={(e) => vm.setPrivateGroupNoticeDraft(e.target.value)}
                            rows={4}
                            placeholder="그룹 공지를 입력하세요"
                            className="w-full rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-3 sam-text-body outline-none focus:border-sam-border"
                          />
                          <button
                            type="button"
                            onClick={() => void vm.savePrivateGroupNotice()}
                            disabled={vm.busy === "group-notice"}
                            className="rounded-ui-rect bg-sam-ink px-4 py-3 sam-text-body-secondary font-semibold text-white disabled:opacity-40"
                          >
                            {vm.busy === "group-notice" ? "저장 중" : "공지 저장"}
                          </button>
                        </div>
                      ) : vm.privateGroupNotice ? (
                        <div className="mt-3 rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-3">
                          <p className="whitespace-pre-wrap sam-text-body-secondary leading-5 text-sam-fg">{vm.privateGroupNotice}</p>
                        </div>
                      ) : (
                        <div className="mt-3 rounded-ui-rect border border-dashed border-sam-border bg-sam-surface px-3 py-4 sam-text-helper text-sam-muted">
                          아직 등록된 그룹 공지가 없습니다.
                        </div>
                      )}
                    </div>
                  ) : null}

                  {vm.isPrivateGroupRoom ? (
                    <div ref={vm.groupPermissionsSectionRef} className="rounded-ui-rect border border-sam-border p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="sam-text-body font-semibold text-sam-fg">권한 설정</p>
                          <p className="mt-1 sam-text-helper text-sam-muted">허용 {vm.allowedPrivateGroupPermissionCount}개 · 제한 {6 - vm.allowedPrivateGroupPermissionCount}개</p>
                        </div>
                        <span className="rounded-ui-rect border border-sam-border bg-sam-surface px-2 py-1 sam-text-xxs font-semibold text-sam-fg">{vm.myRoleLabel}</span>
                      </div>
                      <div className="mt-3 grid grid-cols-2 gap-2">
                        <div className="rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-3">
                          <p className="sam-text-xxs text-sam-muted">허용</p>
                          <p className="mt-1 sam-text-body-secondary font-semibold text-sam-fg">{vm.allowedPrivateGroupPermissionCount}개</p>
                        </div>
                        <div className="rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-3">
                          <p className="sam-text-xxs text-sam-muted">제한</p>
                          <p className="mt-1 sam-text-body-secondary font-semibold text-sam-fg">{6 - vm.allowedPrivateGroupPermissionCount}개</p>
                        </div>
                      </div>
                      <div className="mt-3 rounded-ui-rect border border-sam-border bg-sam-surface p-3">
                        <p className="sam-text-helper font-semibold text-sam-fg">권한 요약</p>
                        <div className="mt-2 space-y-1.5 sam-text-helper text-sam-muted">
                          {vm.privateGroupPermissionRows.map((row) => (
                            <div key={row.label} className="flex items-center justify-between gap-3">
                              <span>{row.label}</span>
                              <span className="font-medium text-sam-fg">{row.value}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                      <div className="mt-3 grid gap-2">
                        <label className="flex items-center justify-between rounded-ui-rect border border-sam-border px-3 py-3">
                          <span className="sam-text-body-secondary font-medium text-sam-fg">일반 멤버 초대 허용</span>
                          <input type="checkbox" checked={vm.groupAllowMemberInvite} onChange={(e) => vm.setGroupAllowMemberInvite(e.target.checked)} disabled={!vm.canManageGroupPermissions} />
                        </label>
                        <label className="flex items-center justify-between rounded-ui-rect border border-sam-border px-3 py-3">
                          <span className="sam-text-body-secondary font-medium text-sam-fg">관리자 초대 허용</span>
                          <input type="checkbox" checked={vm.groupAllowAdminInvite} onChange={(e) => vm.setGroupAllowAdminInvite(e.target.checked)} disabled={!vm.canManageGroupPermissions} />
                        </label>
                        <label className="flex items-center justify-between rounded-ui-rect border border-sam-border px-3 py-3">
                          <span className="sam-text-body-secondary font-medium text-sam-fg">관리자 내보내기 허용</span>
                          <input type="checkbox" checked={vm.groupAllowAdminKick} onChange={(e) => vm.setGroupAllowAdminKick(e.target.checked)} disabled={!vm.canManageGroupPermissions} />
                        </label>
                        <label className="flex items-center justify-between rounded-ui-rect border border-sam-border px-3 py-3">
                          <span className="sam-text-body-secondary font-medium text-sam-fg">관리자 공지 수정 허용</span>
                          <input type="checkbox" checked={vm.groupAllowAdminEditNotice} onChange={(e) => vm.setGroupAllowAdminEditNotice(e.target.checked)} disabled={!vm.canManageGroupPermissions} />
                        </label>
                        <label className="flex items-center justify-between rounded-ui-rect border border-sam-border px-3 py-3">
                          <span className="sam-text-body-secondary font-medium text-sam-fg">일반 멤버 파일 업로드 허용</span>
                          <input type="checkbox" checked={vm.groupAllowMemberUpload} onChange={(e) => vm.setGroupAllowMemberUpload(e.target.checked)} disabled={!vm.canManageGroupPermissions} />
                        </label>
                        <label className="flex items-center justify-between rounded-ui-rect border border-sam-border px-3 py-3">
                          <span className="sam-text-body-secondary font-medium text-sam-fg">일반 멤버 통화 시작 허용</span>
                          <input type="checkbox" checked={vm.groupAllowMemberCall} onChange={(e) => vm.setGroupAllowMemberCall(e.target.checked)} disabled={!vm.canManageGroupPermissions} />
                        </label>
                      </div>
                      {vm.canManageGroupPermissions ? (
                        <button
                          type="button"
                          onClick={() => void vm.savePrivateGroupPermissions()}
                          disabled={vm.busy === "group-permissions"}
                          className="mt-3 rounded-ui-rect bg-sam-ink px-4 py-3 sam-text-body-secondary font-semibold text-white disabled:opacity-40"
                        >
                          {vm.busy === "group-permissions" ? "저장 중" : "권한 저장"}
                        </button>
                      ) : null}
                    </div>
                  ) : null}

                  {vm.managementEventMessages.length ? (
                    <div ref={vm.groupHistorySectionRef} className="rounded-ui-rect border border-sam-border p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="sam-text-body font-semibold text-sam-fg">운영 이력</p>
                          <p className="mt-1 sam-text-helper text-sam-muted">방장 위임, 관리자 지정, 공지 수정 기록을 확인합니다.</p>
                        </div>
                        <span className="rounded-ui-rect border border-sam-border bg-sam-surface px-2 py-1 sam-text-xxs font-semibold text-sam-fg">
                          {vm.managementEventMessages.length}건
                        </span>
                      </div>
                      <div className="mt-3 space-y-2">
                        {vm.managementEventMessages.map((event) => {
                          const summary = describeManagementEvent(event.content);
                          return (
                            <button
                              key={`info:${event.id}`}
                              type="button"
                              onClick={() => vm.scrollToRoomMessage(event.id)}
                              className="flex w-full items-start justify-between gap-3 rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-3 text-left"
                            >
                              <div className="min-w-0 flex-1">
                                <p className="sam-text-helper font-semibold text-sam-fg">{summary.title}</p>
                                <p className="mt-1 line-clamp-2 sam-text-helper leading-5 text-sam-muted">{summary.detail}</p>
                              </div>
                              <span className="shrink-0 sam-text-xxs text-sam-meta">{formatTime(event.createdAt)}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ) : null}

                  {vm.isOpenGroupRoom ? (
                    <div className="rounded-ui-rect bg-sam-app p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="sam-text-body font-semibold text-sam-fg">{vm.t("nav_messenger_open_group_settings")}</p>
                          <p className="mt-1 sam-text-helper text-sam-muted">
                            {vm.isOwner ? vm.t("nav_messenger_open_group_owner_desc") : vm.t("nav_messenger_open_group_view_desc")}
                          </p>
                        </div>
                        <span className="rounded-ui-rect bg-sam-surface px-2 py-1 sam-text-xxs font-semibold text-sam-muted">
                          {vm.isOwner ? vm.t("nav_messenger_owner_label") : vm.t("nav_messenger_my_role_label", { role: vm.snapshot.myRole })}
                        </span>
                      </div>

                      {vm.isOwner ? (
                        <div className="mt-3 grid gap-3">
                          <input
                            value={vm.openGroupTitle}
                            onChange={(e) => vm.setOpenGroupTitle(e.target.value)}
                            placeholder={vm.t("nav_messenger_room_title_placeholder")}
                            className="h-11 w-full rounded-ui-rect border border-sam-border bg-sam-surface px-3 sam-text-body outline-none focus:border-sam-border"
                          />
                          <textarea
                            value={vm.openGroupSummary}
                            onChange={(e) => vm.setOpenGroupSummary(e.target.value)}
                            rows={3}
                            placeholder={vm.t("nav_messenger_room_intro_placeholder")}
                            className="w-full rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-3 sam-text-body outline-none focus:border-sam-border"
                          />
                          <div className="grid gap-3 md:grid-cols-2">
                            <div className="grid grid-cols-2 gap-2 rounded-ui-rect border border-sam-border bg-sam-surface p-2">
                              <button
                                type="button"
                                onClick={() => vm.setOpenGroupJoinPolicy("password")}
                                className={`rounded-ui-rect px-3 py-2 sam-text-helper font-semibold ${vm.openGroupJoinPolicy === "password" ? "bg-[#111827] text-white" : "bg-sam-surface-muted text-sam-fg"}`}
                              >
                                {vm.t("nav_messenger_password_short")}
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  vm.setOpenGroupJoinPolicy("free");
                                  vm.setOpenGroupPassword("");
                                }}
                                className={`rounded-ui-rect px-3 py-2 sam-text-helper font-semibold ${vm.openGroupJoinPolicy === "free" ? "bg-[#111827] text-white" : "bg-sam-surface-muted text-sam-fg"}`}
                              >
                                {vm.t("nav_messenger_join_free")}
                              </button>
                            </div>
                            <input
                              value={vm.openGroupMemberLimit}
                              onChange={(e) => vm.setOpenGroupMemberLimit(e.target.value.replace(/[^0-9]/g, ""))}
                              placeholder={vm.t("nav_messenger_member_limit_placeholder")}
                              className="h-11 w-full rounded-ui-rect border border-sam-border bg-sam-surface px-3 sam-text-body outline-none focus:border-sam-border"
                            />
                          </div>
                          {vm.openGroupJoinPolicy === "password" ? (
                            <input
                              value={vm.openGroupPassword}
                              onChange={(e) => vm.setOpenGroupPassword(e.target.value)}
                              placeholder={vm.t("nav_messenger_new_password_placeholder")}
                              className="h-11 w-full rounded-ui-rect border border-sam-border bg-sam-surface px-3 sam-text-body outline-none focus:border-sam-border"
                            />
                          ) : null}
                          <div className="grid grid-cols-2 gap-2 rounded-ui-rect border border-sam-border bg-sam-surface p-2">
                            <button
                              type="button"
                              onClick={() => vm.setOpenGroupIdentityPolicy("real_name")}
                              className={`rounded-ui-rect px-3 py-2 sam-text-helper font-semibold ${vm.openGroupIdentityPolicy === "real_name" ? "bg-sam-ink text-white" : "bg-sam-surface-muted text-sam-fg"}`}
                            >
                              {vm.t("nav_messenger_identity_real")}
                            </button>
                            <button
                              type="button"
                              onClick={() => vm.setOpenGroupIdentityPolicy("alias_allowed")}
                              className={`rounded-ui-rect px-3 py-2 sam-text-helper font-semibold ${vm.openGroupIdentityPolicy === "alias_allowed" ? "bg-sam-ink text-white" : "bg-sam-surface-muted text-sam-fg"}`}
                            >
                              {vm.t("nav_messenger_identity_alias")}
                            </button>
                          </div>
                          <label className="flex items-center justify-between rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-3">
                            <div>
                              <p className="sam-text-body-secondary font-semibold text-sam-fg">{vm.t("nav_messenger_discoverable_label")}</p>
                              <p className="mt-1 sam-text-helper text-sam-muted">{vm.t("nav_messenger_discoverable_desc")}</p>
                            </div>
                            <input
                              type="checkbox"
                              checked={vm.openGroupDiscoverable}
                              onChange={(e) => vm.setOpenGroupDiscoverable(e.target.checked)}
                              className="h-4 w-4 rounded border-sam-border text-sam-fg focus:ring-sam-border"
                            />
                          </label>
                          <button
                            type="button"
                            onClick={() => void vm.saveOpenGroupSettings()}
                            disabled={vm.busy === "open-group-settings" || !vm.openGroupTitle.trim()}
                            className="rounded-ui-rect bg-[#111827] px-4 py-3 sam-text-body-secondary font-semibold text-white disabled:opacity-40"
                          >
                            {vm.busy === "open-group-settings" ? vm.t("nav_messenger_saving_settings") : vm.t("nav_messenger_save_room_settings")}
                          </button>
                        </div>
                      ) : (
                        <div className="mt-3 flex justify-end">
                          <button
                            type="button"
                            onClick={() => void vm.leaveRoom()}
                            disabled={vm.busy === "leave-room"}
                            className="rounded-ui-rect border border-red-200 bg-sam-surface px-4 py-3 sam-text-body-secondary font-semibold text-red-700 disabled:opacity-40"
                          >
                            {vm.busy === "leave-room" ? vm.t("nav_messenger_leaving") : vm.t("nav_messenger_leave_group_room")}
                          </button>
                        </div>
                      )}
                    </div>
                  ) : null}
                </div>
              </>
            ) : null}

            {vm.activeSheet === "search" ? (
              <>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="sam-text-body-secondary font-medium text-sam-fg">이 방에서 검색</p>
                    <h2 className="mt-1 sam-text-page-title font-semibold text-sam-fg">대화 내 검색</h2>
                  </div>
                  <button
                    type="button"
                    onClick={() => vm.setActiveSheet("menu")}
                    className="rounded-ui-rect border border-sam-border px-3 py-2 sam-text-helper text-sam-fg"
                  >
                    {vm.t("tier1_back")}
                  </button>
                </div>
                <input
                  value={vm.roomSearchQuery}
                  onChange={(e) => vm.setRoomSearchQuery(e.target.value)}
                  placeholder="키워드 (보낸 사람·내용)"
                  className="mt-4 h-11 w-full rounded-ui-rect border border-sam-border px-3 sam-text-body outline-none focus:border-sam-border"
                  autoFocus
                />
                <div className="mt-3 max-h-[50vh] space-y-2 overflow-y-auto">
                  {vm.messageSearchResults.length ? (
                    vm.messageSearchResults.map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => vm.scrollToRoomMessage(m.id)}
                        className="w-full rounded-ui-rect border border-sam-border-soft bg-sam-app px-3 py-3 text-left"
                      >
                        <p className="sam-text-helper font-medium text-sam-muted">{vm.tt(m.senderLabel)} · {formatTime(m.createdAt)}</p>
                        <p className="mt-1 line-clamp-2 sam-text-body text-sam-fg">{communityMessengerMessageSearchText(m)}</p>
                      </button>
                    ))
                  ) : (
                    <p className="py-6 text-center sam-text-body-secondary text-sam-muted">검색 결과가 없습니다.</p>
                  )}
                </div>
              </>
            ) : null}

            {vm.activeSheet === "media" ? (
              <>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="sam-text-body-secondary font-medium text-sam-fg">이 방 미디어</p>
                    <h2 className="mt-1 sam-text-page-title font-semibold text-sam-fg">사진·음성</h2>
                  </div>
                  <button
                    type="button"
                    onClick={() => vm.setActiveSheet("menu")}
                    className="rounded-ui-rect border border-sam-border px-3 py-2 sam-text-helper text-sam-fg"
                  >
                    {vm.t("tier1_back")}
                  </button>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-2">
                  <div className="rounded-ui-rect border border-sam-border bg-sam-surface px-4 py-3">
                    <p className="sam-text-xxs font-medium text-sam-muted">사진</p>
                    <p className="mt-1 sam-text-body-lg font-semibold text-sam-fg">{vm.photoMessageCount}</p>
                    <p className="mt-1 sam-text-helper text-sam-muted">이미지와 사진 링크</p>
                  </div>
                  <div className="rounded-ui-rect border border-sam-border bg-sam-surface px-4 py-3">
                    <p className="sam-text-xxs font-medium text-sam-muted">음성</p>
                    <p className="mt-1 sam-text-body-lg font-semibold text-sam-fg">{vm.voiceMessageCount}</p>
                    <p className="mt-1 sam-text-helper text-sam-muted">보이스 메시지 기록</p>
                  </div>
                </div>
                <div className="mt-4 max-h-[55vh] space-y-3 overflow-y-auto">
                  {vm.mediaGalleryMessages.length ? (
                    vm.mediaGalleryMessages.map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => vm.scrollToRoomMessage(m.id)}
                        className="flex w-full gap-3 rounded-ui-rect border border-sam-border bg-sam-surface p-3 text-left"
                      >
                        <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-ui-rect bg-sam-border-soft sam-text-xxs font-semibold text-sam-muted">
                          {m.messageType === "voice" ? (
                            "음성"
                          ) : m.messageType === "image" || looksLikeDirectImageUrl(m.content) ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={(m.imageAlbumUrls?.[0] ?? m.content).trim()}
                              alt=""
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            "미디어"
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="sam-text-helper text-sam-muted">{formatTime(m.createdAt)}</p>
                          <p className="mt-0.5 truncate sam-text-body text-sam-fg">
                            {m.messageType === "voice"
                              ? `음성${m.voiceDurationSeconds ? ` · ${m.voiceDurationSeconds}초` : ""}`
                              : m.imageAlbumUrls && m.imageAlbumUrls.length > 1
                                ? `사진 ${m.imageAlbumUrls.length}장`
                                : "사진"}
                          </p>
                        </div>
                      </button>
                    ))
                  ) : (
                    <p className="py-8 text-center sam-text-body-secondary text-sam-muted">미디어 없음</p>
                  )}
                </div>
              </>
            ) : null}

            {vm.activeSheet === "files" ? (
              <>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="sam-text-body-secondary font-medium text-sam-fg">이 방 파일</p>
                    <h2 className="mt-1 sam-text-page-title font-semibold text-sam-fg">파일 모아보기</h2>
                  </div>
                  <button
                    type="button"
                    onClick={() => vm.setActiveSheet("menu")}
                    className="rounded-ui-rect border border-sam-border px-3 py-2 sam-text-helper text-sam-fg"
                  >
                    {vm.t("tier1_back")}
                  </button>
                </div>
                <div className="mt-4 rounded-ui-rect border border-sam-border bg-sam-surface px-4 py-3">
                  <p className="sam-text-xxs font-medium text-sam-muted">첨부 파일</p>
                  <p className="mt-1 sam-text-body-lg font-semibold text-sam-fg">{vm.fileMessageCount}개</p>
                  <p className="mt-1 sam-text-helper text-sam-muted">문서, 압축 파일, 일반 첨부를 한곳에서 확인합니다.</p>
                </div>
                <div className="mt-4 max-h-[55vh] space-y-3 overflow-y-auto">
                  {vm.fileMessages.length ? (
                    vm.fileMessages.map((m) => (
                      <div key={m.id} className="rounded-ui-rect border border-sam-border bg-sam-surface p-3">
                        <button type="button" onClick={() => vm.scrollToRoomMessage(m.id)} className="w-full text-left">
                          <p className="sam-text-helper text-sam-muted">{vm.tt(m.senderLabel)} · {formatTime(m.createdAt)}</p>
                          <p className="mt-1 truncate sam-text-body font-semibold text-sam-fg">{m.fileName?.trim() || "첨부 파일"}</p>
                          <p className="mt-1 sam-text-helper text-sam-muted">{formatFileMeta(m.fileMimeType, m.fileSizeBytes)}</p>
                        </button>
                        {!m.pending && m.content.trim() ? (
                          <a
                            href={m.content.trim()}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="mt-3 inline-flex rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2 sam-text-helper font-semibold text-sam-fg"
                          >
                            파일 열기
                          </a>
                        ) : (
                          <p className="mt-3 sam-text-helper text-sam-muted">업로드 중…</p>
                        )}
                      </div>
                    ))
                  ) : (
                    <p className="py-8 text-center sam-text-body-secondary text-sam-muted">파일 없음</p>
                  )}
                </div>
              </>
            ) : null}

            {vm.activeSheet === "links" ? (
              <>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="sam-text-body-secondary font-medium text-sam-fg">이 방 링크</p>
                    <h2 className="mt-1 sam-text-page-title font-semibold text-sam-fg">링크 모아보기</h2>
                  </div>
                  <button
                    type="button"
                    onClick={() => vm.setActiveSheet("menu")}
                    className="rounded-ui-rect border border-sam-border px-3 py-2 sam-text-helper text-sam-fg"
                  >
                    {vm.t("tier1_back")}
                  </button>
                </div>
                <div className="mt-4 rounded-ui-rect border border-sam-border bg-sam-surface px-4 py-3">
                  <p className="sam-text-xxs font-medium text-sam-muted">공유 링크</p>
                  <p className="mt-1 sam-text-body-lg font-semibold text-sam-fg">{vm.linkMessageCount}개</p>
                  <p className="mt-1 sam-text-helper text-sam-muted">메시지에 포함된 URL을 모아 다시 열 수 있습니다.</p>
                </div>
                <div className="mt-4 max-h-[55vh] space-y-3 overflow-y-auto">
                  {vm.linkThreadMessages.length ? (
                    vm.linkThreadMessages.map((m) => {
                      const urls = extractHttpUrls(m.content);
                      return (
                        <div key={m.id} className="rounded-ui-rect border border-sam-border bg-sam-surface p-3">
                          <button type="button" onClick={() => vm.scrollToRoomMessage(m.id)} className="w-full text-left">
                            <p className="sam-text-helper text-sam-muted">{vm.tt(m.senderLabel)} · {formatTime(m.createdAt)}</p>
                            <p className="mt-1 line-clamp-2 sam-text-body-secondary text-sam-fg">{m.content}</p>
                          </button>
                          <div className="mt-2 flex flex-col gap-1.5">
                            {urls.map((url) => (
                              <a
                                key={`${m.id}:${url}`}
                                href={url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="truncate sam-text-body-secondary font-medium text-sam-fg underline decoration-sam-meta"
                              >
                                {url}
                              </a>
                            ))}
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <p className="py-8 text-center sam-text-body-secondary text-sam-muted">링크 없음</p>
                  )}
                </div>
              </>
            ) : null}
          </div>
        </div>
      ) : null}
    </>
  );
}
