"use client";

import {
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  useState,
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
import { MessengerOutgoingCallConfirmDialog } from "@/components/community-messenger/MessengerOutgoingCallConfirmDialog";
import { MessengerStickerSheet } from "@/components/community-messenger/stickers/MessengerStickerSheet";
import { ChatEmojiPicker } from "@/components/chat-ui/ChatEmojiPicker";
import { SamarketThumbnail } from "@/components/common/SamarketThumbnail";
import { isMessengerComposerOutboundBusy } from "@/lib/community-messenger/room/messenger-composer-outbound-busy";
import { Crown, Image as ImageIcon, Link2, Megaphone, Search, Smile, Sticker } from "lucide-react";
import { GroupInviteLinkSection } from "@/components/community-messenger/group/GroupInviteLinkSection";
import { GroupMemberRoleBadge } from "@/components/community-messenger/group/GroupMemberRoleBadge";
import { GroupRoomMediaAlbumTabs } from "@/components/community-messenger/group/GroupRoomMediaAlbumPanel";

export function CommunityMessengerRoomPhase2RoomSheets() {
  const vm = useMessengerRoomPhase2View();
  const [groupOutgoingConfirmKind, setGroupOutgoingConfirmKind] = useState<null | "voice" | "video">(null);
  const composerOutboundBusy = isMessengerComposerOutboundBusy(vm.busy);
  const isGroupMenuDrawer = vm.activeSheet === "menu" && vm.isGroupRoom;
  const isAttachMenuSheet = vm.activeSheet === "attach";
  return (
    <>
      {vm.activeSheet ? (
        <div
          className={
            isGroupMenuDrawer
              ? "fixed inset-0 z-[40] flex justify-end bg-black/30"
              : isAttachMenuSheet
                ? "fixed inset-0 z-[40] flex items-center justify-center bg-transparent px-4 py-[max(1rem,var(--safe-top))]"
                : "fixed inset-0 z-[40] flex flex-col justify-end bg-black/30 pb-[calc(3.5rem+var(--safe-bottom))]"
          }
          onClick={() => {
            if (vm.activeSheet === "attach-confirm") vm.cancelAttachmentConfirm();
            else vm.dismissRoomSheet();
          }}
        >
          <div
            className={
              isGroupMenuDrawer
                ? "flex h-full min-h-0 w-full max-w-[420px] flex-col overflow-y-auto border-l border-[color:var(--cm-room-divider)] bg-[color:var(--cm-room-header-bg)] p-4 pb-[max(1rem,var(--safe-bottom))] shadow-[-8px_0_32px_rgba(0,0,0,0.12)]"
                : `overflow-y-auto ${
                    vm.activeSheet === "attach"
                      ? "max-h-[min(80dvh,32rem)] w-[80%] max-w-[360px] rounded-ui-rect border border-[color:var(--cm-room-divider)] bg-[color:var(--cm-room-header-bg)] shadow-[0_10px_28px_rgba(0,0,0,0.10)]"
                      : vm.activeSheet === "attach-confirm" ||
                    vm.activeSheet === "stickers" ||
                    vm.activeSheet === "emoji"
                        ? "max-h-[85vh] w-full rounded-t-ui-rect border-t border-[color:var(--cm-room-divider)] bg-[color:var(--cm-room-header-bg)] pb-[max(0.75rem,var(--safe-bottom))] shadow-[0_-8px_32px_rgba(0,0,0,0.08)]"
                        : `mx-auto max-h-[78vh] w-full max-w-[520px] rounded-t-ui-rect border border-[color:var(--cm-room-divider)] bg-[color:var(--cm-room-header-bg)] shadow-[0_-8px_32px_rgba(0,0,0,0.08)] ${
                            vm.activeSheet === "menu" && !vm.isGroupRoom ? "p-0" : "p-5"
                          }`
                  }`
            }
            onClick={(event) => event.stopPropagation()}
          >
            {vm.activeSheet === "attach" ? (
              <>
                <div className="border-b border-[color:var(--cm-room-divider)] px-4 py-3">
                  <p className="sam-text-body-secondary font-semibold text-[color:var(--cm-room-text)]">{vm.t("common_attach")}</p>
                  <p className="mt-0.5 sam-text-helper text-[color:var(--cm-room-text-muted)]">{vm.t("cm_ui_select_item_to_send")}</p>
                </div>
                <nav className="flex flex-col" aria-label={vm.t("common_attach")}>
                  <button
                    type="button"
                    onClick={() => vm.setActiveSheet("emoji")}
                    disabled={vm.roomUnavailable || composerOutboundBusy}
                    className="flex min-h-[48px] w-full items-center justify-between border-b border-[color:var(--cm-room-divider)] px-4 py-3 text-left sam-text-body font-medium text-[color:var(--cm-room-text)] active:bg-[color:var(--cm-room-primary-soft)] disabled:opacity-40"
                  >
                    <span className="flex items-center gap-2.5">
                      <Smile className="h-5 w-5 shrink-0 text-[color:var(--cm-room-primary)]" strokeWidth={2} aria-hidden />
                      {vm.t("common_emoji")}
                    </span>
                    <span className="text-[color:var(--cm-room-text-muted)]">›</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => vm.setActiveSheet("stickers")}
                    disabled={vm.roomUnavailable || composerOutboundBusy}
                    className="flex min-h-[48px] w-full items-center justify-between border-b border-[color:var(--cm-room-divider)] px-4 py-3 text-left sam-text-body font-medium text-[color:var(--cm-room-text)] active:bg-[color:var(--cm-room-primary-soft)] disabled:opacity-40"
                  >
                    <span className="flex items-center gap-2.5">
                      <Sticker className="h-5 w-5 shrink-0 text-[color:var(--cm-room-primary)]" strokeWidth={2} aria-hidden />
                      {vm.t("cm_ui_sticker")}
                    </span>
                    <span className="text-[color:var(--cm-room-text-muted)]">›</span>
                  </button>
                  <button
                    type="button"
                    onClick={vm.openImagePicker}
                    disabled={vm.roomUnavailable || vm.busy === "send-image" || !vm.canUploadAttachments}
                    className="flex min-h-[48px] w-full items-center justify-between border-b border-[color:var(--cm-room-divider)] px-4 py-3 text-left sam-text-body font-medium text-[color:var(--cm-room-text)] active:bg-[color:var(--cm-room-primary-soft)] disabled:opacity-40"
                  >
                    {vm.t("cm_ui_photo_gallery")}
                    <span className="text-[color:var(--cm-room-text-muted)]">›</span>
                  </button>
                  <button
                    type="button"
                    onClick={vm.openCameraPicker}
                    disabled={vm.roomUnavailable || vm.busy === "send-image" || !vm.canUploadAttachments}
                    className="flex min-h-[48px] w-full items-center justify-between border-b border-[color:var(--cm-room-divider)] px-4 py-3 text-left sam-text-body font-medium text-[color:var(--cm-room-text)] active:bg-[color:var(--cm-room-primary-soft)] disabled:opacity-40"
                  >
                    {vm.t("cm_ui_camera")}
                    <span className="text-[color:var(--cm-room-text-muted)]">›</span>
                  </button>
                  <button
                    type="button"
                    onClick={vm.openFilePicker}
                    disabled={vm.roomUnavailable || vm.busy === "send-file" || !vm.canUploadAttachments}
                    className="flex min-h-[48px] w-full items-center justify-between border-b border-[color:var(--cm-room-divider)] px-4 py-3 text-left sam-text-body font-medium text-[color:var(--cm-room-text)] active:bg-[color:var(--cm-room-primary-soft)] disabled:opacity-40"
                  >
                    {vm.t("cm_ui_file")}
                    <span className="text-[color:var(--cm-room-text-muted)]">›</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => void vm.sendLocationMessage()}
                    disabled={vm.roomUnavailable}
                    className="flex min-h-[48px] w-full items-center justify-between border-b border-[color:var(--cm-room-divider)] px-4 py-3 text-left sam-text-body font-medium text-[color:var(--cm-room-text)] active:bg-[color:var(--cm-room-primary-soft)] disabled:opacity-40"
                  >
                    {vm.t("common_location")}
                    <span className="text-[color:var(--cm-room-text-muted)]">›</span>
                  </button>
                </nav>
                <div className="px-4 py-2">
                  <button
                    type="button"
                    onClick={() => vm.setActiveSheet("menu")}
                    className="w-full rounded-ui-rect bg-[color:var(--cm-room-chat-bg)] px-3 py-2.5 text-center text-[13px] font-normal text-[color:var(--cm-room-text-muted)] active:opacity-90"
                  >
                    {vm.t("cm_ui_media_files_and_room_info_hint")}
                  </button>
                </div>
                <button
                  type="button"
                  onClick={vm.dismissRoomSheet}
                  className="mt-1 w-full border-t border-[color:var(--cm-room-divider)] py-3 sam-text-body font-medium text-[color:var(--cm-room-text-muted)] active:bg-[color:var(--cm-room-primary-soft)]"
                >
                  {vm.t("common_cancel")}
                </button>
              </>
            ) : null}

            {vm.activeSheet === "attach-confirm" && vm.attachmentConfirmDraft ? (
              <>
                <div className="border-b border-[color:var(--cm-room-divider)] px-4 py-3">
                  <p className="sam-text-body-secondary font-semibold text-[color:var(--cm-room-text)]">{vm.t("cm_ui_confirm_before_send")}</p>
                  <p className="mt-0.5 sam-text-helper text-[color:var(--cm-room-text-muted)]">{vm.t("cm_ui_cancel_not_sent_hint")}</p>
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
                            className="aspect-square w-full rounded-ui-rect object-cover"
                          />
                        ))}
                      </div>
                    ) : (
                      // 로컬 blob 미리보기 — next/image 미지원
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={vm.attachmentConfirmDraft.previewUrls[0]}
                        alt={vm.t("cm_ui_selected_image_preview_alt")}
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
                    className="min-h-[44px] flex-1 rounded-ui-rect border border-[color:var(--cm-room-divider)] bg-[color:var(--cm-room-chat-bg)] text-[14px] font-semibold text-[color:var(--cm-room-text)] active:opacity-90"
                  >
                    {vm.t("common_cancel")}
                  </button>
                  <button
                    type="button"
                    onClick={() => void vm.confirmAttachmentSend()}
                    disabled={
                      vm.roomUnavailable ||
                      vm.busy === "send-image" ||
                      vm.busy === "send-file" ||
                      vm.busy === "send-voice" ||
                      vm.busy === "delete-message"
                    }
                    className="min-h-[44px] flex-[1.15] rounded-ui-rect bg-[color:var(--cm-room-primary)] text-[14px] font-semibold text-white shadow-sm active:opacity-90 disabled:opacity-40"
                  >
                    {vm.t("common_send")}
                  </button>
                </div>
              </>
            ) : null}

            {vm.activeSheet === "emoji" ? (
              <div className="w-full bg-[color:var(--cm-room-header-bg)]">
                <div className="flex shrink-0 items-center justify-between border-b border-[color:var(--cm-room-divider)] px-3 py-2">
                  <button
                    type="button"
                    className="rounded-full px-2 py-1 sam-text-body-secondary font-medium text-[color:var(--cm-room-text-muted)] hover:bg-sam-surface-muted"
                    onClick={() => vm.setActiveSheet("attach")}
                  >
                    {vm.t("nav_back")}
                  </button>
                  <span className="sam-text-body font-semibold text-[color:var(--cm-room-text)]">{vm.t("common_emoji")}</span>
                  <button
                    type="button"
                    className="rounded-full px-2 py-1 sam-text-body-secondary font-medium text-[color:var(--cm-room-text-muted)] hover:bg-sam-surface-muted"
                    onClick={vm.dismissRoomSheet}
                  >
                    {vm.t("nav_close")}
                  </button>
                </div>
                <ChatEmojiPicker
                  disabled={vm.roomUnavailable || composerOutboundBusy}
                  onPick={(emoji) => {
                    if (vm.roomUnavailable || composerOutboundBusy) return;
                    vm.dismissRoomSheet();
                    void vm.sendMessage(emoji);
                  }}
                />
              </div>
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
                <div className="mb-3 flex shrink-0 items-center justify-between border-b border-sam-border pb-3">
                  <p className="sam-text-section-title font-semibold text-sam-fg">{vm.t("cm_ui_chat_room")}</p>
                  <button
                    type="button"
                    onClick={vm.dismissRoomSheet}
                    className="rounded-ui-rect px-3 py-1.5 sam-text-body text-sam-muted transition active:bg-sam-app"
                  >
                    {vm.t("nav_close")}
                  </button>
                </div>

                {vm.isPrivateGroupRoom ? (
                  <div className="mb-4 rounded-ui-rect border border-[#006241]/25 bg-[#EAF4EF] p-4">
                    <p className="sam-text-helper font-semibold text-[#006241]">{vm.t("nav_messenger_private_group")}</p>
                    <p className="mt-1 sam-text-body-secondary text-[#004C3F]">{vm.t("nav_messenger_open_group_settings")}</p>
                    {vm.canEditPrivateGroupMeta ? (
                      <div className="mt-3 grid gap-2">
                        <div className="flex items-center gap-3">
                          <SamarketThumbnail
                            src={vm.privateGroupAvatarUrl ?? vm.snapshot.room.avatarUrl}
                            size={56}
                            roundedClassName="rounded-[12px]"
                            className="bg-white ring-1 ring-[#006241]/20"
                            fallbackSrc=""
                            fallbackNode={
                              <span className="sam-text-page-title font-semibold text-[#006241]">
                                {vm.privateGroupTitle.trim().slice(0, 1).toUpperCase() || "?"}
                              </span>
                            }
                          />
                          <label className="min-h-[44px] cursor-pointer rounded-ui-rect border border-[#006241]/30 bg-white px-3 py-2 sam-text-helper font-semibold text-[#006241]">
                            {vm.t("cm_ui_photo_gallery")}
                            <input
                              type="file"
                              accept="image/jpeg,image/png,image/webp,image/gif"
                              className="sr-only"
                              disabled={vm.busy === "private-group-avatar"}
                              onChange={(e) => {
                                const file = e.target.files?.[0];
                                e.target.value = "";
                                if (file) void vm.uploadPrivateGroupAvatar(file);
                              }}
                            />
                          </label>
                        </div>
                        <input
                          value={vm.privateGroupTitle}
                          onChange={(e) => vm.setPrivateGroupTitle(e.target.value)}
                          placeholder={vm.t("nav_messenger_room_title_placeholder")}
                          className="h-11 w-full rounded-ui-rect border border-[#006241]/30 bg-white px-3 sam-text-body outline-none focus:border-[#006241]"
                        />
                        <button
                          type="button"
                          onClick={() => void vm.savePrivateGroupSettings()}
                          disabled={vm.busy === "private-group-settings" || !vm.privateGroupTitle.trim()}
                          className="rounded-ui-rect bg-[#006241] px-4 py-3 sam-text-body-secondary font-semibold text-white transition active:bg-[#004C3F] disabled:opacity-40"
                        >
                          {vm.busy === "private-group-settings"
                            ? vm.t("nav_messenger_saving_settings")
                            : vm.t("nav_messenger_save_room_settings")}
                        </button>
                      </div>
                    ) : null}
                    <div className="mt-3 grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => vm.setActiveSheet("members")}
                        className="rounded-ui-rect border border-[#006241]/30 bg-white px-3 py-3 text-left sam-text-helper font-semibold text-[#004C3F] transition active:bg-[#EAF4EF]"
                      >
                        {vm.t("nav_messenger_participants")}
                      </button>
                      <button
                        type="button"
                        onClick={() => void vm.toggleRoomMute()}
                        disabled={vm.busy === "room-mute"}
                        className="rounded-ui-rect border border-[#006241]/30 bg-white px-3 py-3 text-left sam-text-helper font-semibold text-[#004C3F] transition active:bg-[#EAF4EF] disabled:opacity-40"
                      >
                        {vm.snapshot.room.isMuted ? vm.t("cm_ui_turn_on_room_notifications") : vm.t("cm_ui_turn_off_room_notifications")}
                      </button>
                    </div>
                    <GroupInviteLinkSection
                      roomId={vm.roomId}
                      state={vm.groupInviteLinkState}
                      loading={vm.groupInviteLinkLoading}
                      canManage={vm.canEditPrivateGroupMeta}
                      busy={vm.busy}
                      onCopy={() => void vm.copyGroupInviteLink()}
                      onRegenerate={() => void vm.regenerateGroupInviteLink()}
                      onDisable={() => void vm.disableGroupInviteLink()}
                    />
                  </div>
                ) : null}

                <div className="flex flex-col items-center gap-2 border-b border-sam-border-soft pb-4">
                  <SamarketThumbnail
                    src={vm.snapshot.room.avatarUrl}
                    size={72}
                    roundedClassName="rounded-[14px]"
                    className="bg-sam-app ring-1 ring-sam-border"
                    fallbackSrc=""
                    fallbackNode={<span className="sam-text-page-title font-semibold text-sam-primary">{vm.snapshot.room.title.trim().slice(0, 1).toUpperCase() || "?"}</span>}
                  />
                  <h2 className="text-center sam-text-body-lg font-semibold leading-snug text-sam-fg">{vm.snapshot.room.title}</h2>
                  <p className="text-center sam-text-helper text-sam-muted">
                    {vm.t("nav_chat_count_people", { count: vm.snapshot.room.memberCount })} · {vm.myRoleLabel}
                  </p>
                </div>

                <div className="mt-4 rounded-ui-rect border border-sam-border bg-sam-surface">
                  <button
                    type="button"
                    onClick={() => vm.setActiveSheet("media")}
                    className="flex w-full min-h-[48px] items-center gap-3 border-b border-sam-border px-4 py-3 text-left transition active:bg-sam-app"
                  >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-700">
                      <ImageIcon className="h-5 w-5" strokeWidth={2} aria-hidden />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block sam-text-body font-semibold text-sam-fg">{vm.t("cm_ui_photo_video")}</span>
                      <span className="mt-0.5 block sam-text-helper text-sam-muted">
                        {vm.t("cm_ui_photo_voice_count", { photos: vm.photoMessageCount, voices: vm.voiceMessageCount })}
                      </span>
                    </span>
                    <span className="sam-text-page-title text-sam-meta">›</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => vm.setActiveSheet("files")}
                    className="flex w-full min-h-[48px] items-center gap-3 border-b border-sam-border px-4 py-3 text-left transition active:bg-sam-app"
                  >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-500/12 text-slate-700">
                      <FileIcon className="h-5 w-5 shrink-0" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block sam-text-body font-semibold text-sam-fg">{vm.t("cm_ui_file")}</span>
                      <span className="mt-0.5 block sam-text-helper text-sam-muted">{vm.t("cm_ui_file_count", { count: vm.fileMessageCount })}</span>
                    </span>
                    <span className="sam-text-page-title text-sam-meta">›</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => vm.setActiveSheet("links")}
                    className="flex w-full min-h-[48px] items-center gap-3 px-4 py-3 text-left transition active:bg-sam-app"
                  >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-sky-500/15 text-sky-700">
                      <Link2 className="h-5 w-5" strokeWidth={2} aria-hidden />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block sam-text-body font-semibold text-sam-fg">{vm.t("cm_ui_link")}</span>
                      <span className="mt-0.5 block sam-text-helper text-sam-muted">{vm.t("cm_ui_link_count", { count: vm.linkMessageCount })}</span>
                    </span>
                    <span className="sam-text-page-title text-sam-meta">›</span>
                  </button>
                </div>

                <div className="mt-3 grid grid-cols-2 gap-2">
                  {vm.roomNotice ? (
                    <button
                      type="button"
                      onClick={() => vm.openInfoSheet("notice")}
                      className="flex min-h-[72px] flex-col items-start justify-between gap-1 rounded-ui-rect border border-sam-border bg-sam-surface p-3 text-left transition active:bg-sam-app"
                    >
                      <Megaphone className="h-5 w-5 shrink-0 text-sky-600" strokeWidth={2} aria-hidden />
                      <span className="sam-text-helper font-semibold text-sam-fg">{vm.t("neighborhood_notice")}</span>
                      <span className="line-clamp-2 w-full sam-text-xxs leading-snug text-sam-muted">{vm.roomNotice}</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => vm.openInfoSheet(vm.canEditGroupNotice ? "notice" : undefined)}
                      className="flex min-h-[72px] flex-col items-start justify-between gap-1 rounded-ui-rect border border-dashed border-sam-border bg-sam-app p-3 text-left transition active:bg-sam-surface"
                    >
                      <span className="sam-text-helper font-semibold text-sam-muted">{vm.t("neighborhood_notice")}</span>
                      <span className="sam-text-xxs text-sam-muted">
                        {vm.canEditGroupNotice ? vm.t("cm_ui_tap_to_register_edit") : vm.t("cm_ui_check_in_room_info")}
                      </span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      vm.setRoomSearchQuery("");
                      vm.setActiveSheet("search");
                    }}
                    className="flex min-h-[72px] flex-col items-start justify-between gap-1 rounded-ui-rect border border-sam-border bg-sam-surface p-3 text-left transition active:bg-sam-app"
                  >
                    <Search className="h-5 w-5 shrink-0 text-sam-muted" strokeWidth={2} aria-hidden />
                    <span className="sam-text-helper font-semibold text-sam-fg">{vm.t("cm_ui_search_in_chat")}</span>
                    <span className="sam-text-xxs text-sam-muted">{vm.t("cm_ui_message_sender")}</span>
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => vm.openInfoSheet()}
                  className="mt-2 flex w-full items-center justify-between rounded-ui-rect border border-sam-border px-4 py-3 text-left transition active:bg-sam-app"
                >
                  <span className="sam-text-body font-semibold text-sam-fg">{vm.t("nav_messenger_room_info")}</span>
                  <span className="sam-text-page-title text-sam-meta">›</span>
                </button>

                <div className="mt-3 rounded-ui-rect border border-sam-border bg-sam-app px-4 py-3">
                  <p className="sam-text-xxs font-medium text-sam-muted">{vm.t("nav_messenger_group_call")}</p>
                  <p className="mt-1 sam-text-body font-semibold text-sam-fg">{vm.groupCallStatusLabel}</p>
                  <p className="mt-0.5 sam-text-helper text-sam-muted">
                    {vm.activeGroupCall
                      ? vm.t("cm_ui_group_call_participants", {
                          kind: vm.activeGroupCall.callKind === "video" ? vm.t("nav_video_call_label") : vm.t("nav_voice_call_label"),
                          count: vm.activeGroupCall.participants.length,
                        })
                      : vm.canStartGroupCall
                        ? vm.t("cm_ui_can_start_now")
                        : vm.t("cm_ui_no_start_permission")}
                  </p>
                </div>

                <div className="mt-3 grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setGroupOutgoingConfirmKind("voice")}
                    disabled={!vm.canStartGroupCall || vm.call.busy === "call-start" || vm.call.busy === "device-prepare"}
                    className="rounded-ui-rect border border-sam-border px-3 py-3 text-left sam-text-body font-semibold text-sam-fg transition active:bg-sam-surface disabled:opacity-40"
                  >
                    {vm.t("cm_ui_group_voice_call")}
                  </button>
                  <button
                    type="button"
                    onClick={() => setGroupOutgoingConfirmKind("video")}
                    disabled={!vm.canStartGroupCall || vm.call.busy === "call-start" || vm.call.busy === "device-prepare"}
                    className="rounded-ui-rect border border-sam-border px-3 py-3 text-left sam-text-body font-semibold text-sam-fg transition active:bg-sam-surface disabled:opacity-40"
                  >
                    {vm.t("cm_ui_group_video_call")}
                  </button>
                </div>

                <p className="mt-5 px-0.5 sam-text-helper font-semibold text-sam-muted">
                  {vm.t("cm_ui_chat_partners_count", { count: vm.snapshot.room.memberCount })}
                </p>
                <div className="mt-2 space-y-1">
                  {vm.sortedMembers.slice(0, 12).map((member) => {
                    const isSelf = messengerUserIdsEqual(member.id, vm.snapshot.viewerUserId);
                    const isRoomOwner =
                      Boolean(vm.snapshot.room.ownerUserId) &&
                      messengerUserIdsEqual(member.id, vm.snapshot.room.ownerUserId);
                    const aliasUrl = member.aliasProfile?.avatarUrl?.trim();
                    const avatarUrl =
                      member.identityMode === "alias" && aliasUrl?.startsWith("http")
                        ? aliasUrl
                        : member.avatarUrl?.trim()?.startsWith("http")
                          ? member.avatarUrl.trim()
                          : null;
                    const displayLabel =
                      member.identityMode === "alias" && member.aliasProfile?.displayName?.trim()
                        ? member.aliasProfile.displayName.trim()
                        : member.label;
                    const raw = displayLabel.replace(/\s+/g, "");
                    const initials = (raw[0] ?? "?").toUpperCase();
                    return (
                      <button
                        key={member.id}
                        type="button"
                        onClick={() => {
                          if (isSelf) return;
                          vm.setMemberActionTarget(member);
                        }}
                        className={`flex w-full items-center gap-3 rounded-ui-rect border border-transparent px-2 py-2 text-left transition ${
                          isSelf ? "opacity-90" : "active:bg-sam-surface"
                        }`}
                      >
                        <div className="relative h-10 w-10 shrink-0">
                          <SamarketThumbnail
                            src={avatarUrl}
                            size={40}
                            roundedClassName="rounded-full"
                            className="bg-sam-surface ring-1 ring-sam-border"
                            fallbackSrc=""
                            fallbackNode={<span className="sam-text-helper font-semibold text-sam-primary">{initials}</span>}
                          />
                          {isRoomOwner ? (
                            <span className="absolute -bottom-0.5 -right-0.5 flex h-[18px] w-[18px] items-center justify-center rounded-full bg-sam-surface ring-1 ring-sam-border">
                              <Crown className="h-3 w-3 text-sky-600" strokeWidth={2} aria-hidden />
                            </span>
                          ) : null}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate sam-text-body font-medium text-sam-fg">
                            {displayLabel}
                            {isSelf ? ` (${vm.t("nav_messenger_me")})` : ""}
                          </p>
                          <div className="mt-0.5 flex flex-wrap items-center gap-1">
                            <GroupMemberRoleBadge role={isRoomOwner ? "owner" : member.memberRole} />
                          </div>
                        </div>
                        {!isSelf ? <span className="sam-text-page-title text-sam-meta">›</span> : null}
                      </button>
                    );
                  })}
                </div>
                <button
                  type="button"
                  onClick={() => vm.setActiveSheet("members")}
                  className="mt-2 w-full rounded-ui-rect border border-sam-border py-2.5 sam-text-body font-medium text-sam-fg transition active:bg-sam-app"
                >
                  {vm.t("cm_ui_members_invites_view_all")} ›
                </button>

                {vm.managementEventMessages.length ? (
                  <div className="mt-4 rounded-ui-rect border border-sam-border p-3">
                    <p className="sam-text-body font-semibold text-sam-fg">{vm.t("cm_ui_operation_history")}</p>
                    <div className="mt-2 space-y-2">
                      {vm.managementEventMessages.map((event) => {
                        const summary = describeManagementEvent(event.content);
                        return (
                          <button
                            key={event.id}
                            type="button"
                            onClick={() => vm.scrollToRoomMessage(event.id)}
                            className="flex w-full items-start justify-between gap-2 rounded-ui-rect bg-sam-app px-2 py-2 text-left"
                          >
                            <div className="min-w-0 flex-1">
                              <p className="sam-text-xxs font-semibold text-sam-fg">{summary.title}</p>
                              <p className="mt-0.5 line-clamp-2 sam-text-xxs leading-snug text-sam-muted">{summary.detail}</p>
                            </div>
                            <span className="shrink-0 sam-text-xxs text-sam-meta">{formatTime(event.createdAt)}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ) : null}

                <div className="mt-4 space-y-2">
                  <button
                    type="button"
                    onClick={() => void vm.toggleRoomMute()}
                    disabled={vm.busy === "room-mute"}
                    className="flex w-full items-center justify-between rounded-ui-rect border border-sam-border px-4 py-3 text-left disabled:opacity-40"
                  >
                    <span className="sam-text-body font-semibold text-sam-fg">
                      {vm.snapshot.room.isMuted ? vm.t("cm_ui_turn_on_room_notifications") : vm.t("cm_ui_turn_off_room_notifications")}
                    </span>
                    <span
                      className={`rounded-ui-rect px-2 py-1 sam-text-xxs font-semibold ${
                        vm.snapshot.room.isMuted ? "bg-sam-ink text-white" : "bg-sam-surface-muted text-sam-muted"
                      }`}
                    >
                      {vm.busy === "room-mute" ? vm.t("common_processing") : vm.snapshot.room.isMuted ? vm.t("cm_ui_off") : vm.t("cm_ui_on")}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => void vm.toggleRoomArchive()}
                    disabled={vm.busy === "room-archive" || !communityMessengerRoomIsGloballyUsable(vm.snapshot.room)}
                    className="flex w-full items-center justify-between rounded-ui-rect border border-sam-border px-4 py-3 text-left disabled:opacity-40"
                  >
                    <span className="sam-text-body font-semibold text-sam-fg">
                      {!vm.snapshot.room.isArchivedByViewer ? vm.t("cm_ui_archive_room") : vm.t("cm_ui_unarchive_room")}
                    </span>
                    <span
                      className={`rounded-ui-rect px-2 py-1 sam-text-xxs font-semibold ${
                        !vm.snapshot.room.isArchivedByViewer ? "bg-sam-surface-muted text-sam-muted" : "bg-sam-ink text-white"
                      }`}
                    >
                      {vm.busy === "room-archive" ? vm.t("common_processing") : !vm.snapshot.room.isArchivedByViewer ? vm.t("common_active") : vm.t("cm_ui_archived")}
                    </span>
                  </button>
                </div>

                <div className="mt-4 space-y-2">
                  <button
                    type="button"
                    onClick={() => {
                      if (vm.isOwner && vm.isPrivateGroupRoom) {
                        vm.openMembersForOwnerTransfer();
                        return;
                      }
                      void vm.requestLeaveRoom();
                    }}
                    disabled={vm.busy === "leave-room"}
                    className="w-full rounded-ui-rect border border-red-200 bg-sam-surface px-4 py-3 text-left sam-text-body font-semibold text-red-700 disabled:opacity-40"
                  >
                    {vm.busy === "leave-room"
                      ? vm.t("nav_messenger_leaving")
                      : vm.isOwner && vm.isPrivateGroupRoom
                        ? vm.t("cm_ui_leave_after_owner_transfer")
                        : vm.t("nav_messenger_leave_group_room")}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      vm.dismissRoomSheet();
                      void vm.reportTarget({ reportType: "room" });
                    }}
                    className="w-full rounded-ui-rect border border-red-200 bg-sam-surface px-4 py-3 text-left sam-text-body font-semibold text-red-700"
                  >
                    {vm.t("nav_messenger_report")}
                  </button>
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
                        <p className="sam-text-xxs font-medium text-sam-muted">{vm.t("nav_messenger_participants")}</p>
                        <p className="mt-1 sam-text-body-lg font-semibold text-sam-fg">{vm.t("nav_chat_count_people", { count: vm.snapshot.room.memberCount })}</p>
                        <p className="mt-1 sam-text-helper text-sam-muted">{vm.roomTypeLabel}</p>
                      </div>
                      <div className="rounded-ui-rect border border-sam-border bg-sam-surface px-4 py-3">
                        <p className="sam-text-xxs font-medium text-sam-muted">{vm.t("cm_ui_operation_team")}</p>
                        <p className="mt-1 sam-text-body-lg font-semibold text-sam-fg">{vm.t("cm_ui_owner_admin_count", { count: vm.groupAdminCount })}</p>
                        <p className="mt-1 sam-text-helper text-sam-muted">{vm.t("cm_ui_group_operation_capacity")}</p>
                      </div>
                      <div className="rounded-ui-rect border border-sam-border bg-sam-surface px-4 py-3">
                        <p className="sam-text-xxs font-medium text-sam-muted">{vm.t("cm_ui_invite_status")}</p>
                        <p className="mt-1 sam-text-body-lg font-semibold text-sam-fg">{vm.canInviteMembers ? vm.t("cm_ui_possible") : vm.t("cm_ui_limited")}</p>
                        <p className="mt-1 sam-text-helper text-sam-muted">
                          {vm.t("cm_ui_alias_profile_count", { count: vm.aliasProfileCount })}
                          {vm.roomMembersDisplay.length < vm.snapshot.room.memberCount ? ` · ${vm.t("cm_ui_based_on_display_range")}` : ""}
                        </p>
                      </div>
                    </div>
                  ) : null}
                  {vm.isGroupRoom && vm.snapshot.room.memberCount > vm.roomMembersDisplay.length ? (
                    <p className="sam-text-helper leading-5 text-sam-muted">
                      {vm.t("cm_ui_loaded_member_profiles", {
                        total: vm.snapshot.room.memberCount,
                        loaded: vm.roomMembersDisplay.length,
                      })}
                    </p>
                  ) : null}
                  {vm.isGroupRoom && vm.membersListNextOffset !== null ? (
                    <button
                      type="button"
                      onClick={() => void vm.loadMoreRoomMembers()}
                      disabled={vm.membersPagingBusy}
                      className="w-full rounded-ui-rect border border-sam-border bg-sam-app px-4 py-3 sam-text-body font-medium text-sam-fg disabled:opacity-50"
                    >
                      {vm.membersPagingBusy ? vm.t("common_loading") : vm.t("cm_ui_load_more_members")}
                    </button>
                  ) : null}
                  {vm.isOwner && vm.isPrivateGroupRoom ? (
                    <div className="rounded-ui-rect border border-sam-border bg-sam-surface px-4 py-3">
                      <p className="sam-text-body-secondary font-semibold text-sam-fg">{vm.t("cm_ui_operation_guide")}</p>
                      <p className="mt-1 sam-text-helper leading-5 text-sam-muted">
                        {vm.t("cm_ui_member_action_guide")}
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
                              <GroupMemberRoleBadge role="owner" />
                            ) : member.memberRole === "admin" ? (
                              <GroupMemberRoleBadge role="admin" />
                            ) : null}
                            {messengerUserIdsEqual(member.id, vm.snapshot.viewerUserId) ? (
                              <span className="rounded-ui-rect bg-sam-surface-muted px-2 py-0.5 sam-text-xxs font-semibold text-sam-fg">{vm.t("nav_messenger_me")}</span>
                            ) : null}
                            {member.identityMode === "alias" ? (
                              <span className="rounded-ui-rect border border-sam-border bg-sam-app px-2 py-0.5 sam-text-xxs font-semibold text-sam-fg">{vm.t("cm_ui_nickname")}</span>
                            ) : null}
                          </div>
                          <p className="mt-1 sam-text-helper text-sam-muted">
                            {member.subtitle ?? (member.identityMode === "alias" ? vm.t("nav_messenger_member_alias_joined") : vm.t("nav_messenger_member_joined"))}
                          </p>
                          {!messengerUserIdsEqual(member.id, vm.snapshot.viewerUserId) ? (
                            <p className="mt-2 sam-text-xxs text-sam-meta">
                              {vm.isPrivateGroupRoom ? vm.t("cm_ui_tap_for_chat_role_kick") : vm.t("cm_ui_tap_for_chat_profile_actions")}
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
                          {vm.canInviteMembers ? vm.t("nav_messenger_invite_members_desc") : vm.t("cm_ui_member_invite_restricted")}
                        </p>
                      </div>
                      <span className="rounded-ui-rect bg-sam-surface px-2 py-1 sam-text-xxs font-semibold text-sam-muted">
                        {vm.myRoleLabel}
                      </span>
                    </div>
                    {vm.canInviteMembers && vm.inviteCandidates.length ? (
                      <>
                        <div className="mt-3 flex items-center justify-between gap-3">
                          <p className="sam-text-helper text-sam-muted">{vm.t("cm_ui_invite_candidate_selected_count", { candidates: vm.filteredInviteCandidates.length, selected: vm.inviteIds.length })}</p>
                          {vm.inviteIds.length ? (
                            <button
                              type="button"
                              onClick={() => vm.setInviteIds([])}
                              className="rounded-ui-rect border border-sam-border bg-sam-surface px-2.5 py-1 sam-text-xxs font-medium text-sam-muted"
                            >
                              {vm.t("cm_ui_clear_selection")}
                            </button>
                          ) : null}
                        </div>
                        <input
                          value={vm.inviteSearchQuery}
                          onChange={(e) => vm.setInviteSearchQuery(e.target.value)}
                          placeholder={vm.t("cm_ui_search_friends")}
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
                                {friend.label} {vm.t("nav_close")}
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
                        <p className="sam-text-helper text-sam-muted">{vm.t("cm_ui_no_search_results")}</p>
                      ) : vm.canInviteMembers ? (
                        <p className="sam-text-helper text-sam-muted">{vm.t("nav_messenger_no_invitable_friends")}</p>
                      ) : (
                        <p className="sam-text-helper text-sam-muted">{vm.t("cm_ui_friend_invite_owner_allowed_only")}</p>
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
                      <p className="sam-text-xxs font-medium text-sam-muted">{vm.t("nav_messenger_participants")}</p>
                      <p className="mt-1 sam-text-body-lg font-semibold text-sam-fg">{vm.t("nav_chat_count_people", { count: vm.snapshot.room.memberCount })}</p>
                      <p className="mt-1 sam-text-helper text-sam-muted">{vm.roomTypeLabel}</p>
                    </div>
                    <div className="rounded-ui-rect border border-sam-border bg-sam-surface px-4 py-3">
                      <p className="sam-text-xxs font-medium text-sam-muted">{vm.t("cm_ui_my_status")}</p>
                      <p className="mt-1 sam-text-body-lg font-semibold text-sam-fg">{vm.myRoleLabel}</p>
                      <p className="mt-1 sam-text-helper text-sam-muted">{vm.roomIdentityLabel || vm.t("cm_ui_default_profile")}</p>
                    </div>
                    <div className="rounded-ui-rect border border-sam-border bg-sam-surface px-4 py-3">
                      <p className="sam-text-xxs font-medium text-sam-muted">{vm.t("cm_ui_join_method")}</p>
                      <p className="mt-1 sam-text-body-lg font-semibold text-sam-fg">{vm.roomJoinLabel || vm.t("cm_ui_default_join")}</p>
                      <p className="mt-1 sam-text-helper text-sam-muted">
                        {vm.isOpenGroupRoom ? (vm.snapshot.room.isDiscoverable ? vm.t("cm_ui_search_visibility") : vm.t("nav_messenger_private_group")) : vm.t("cm_ui_invite_based")}
                      </p>
                    </div>
                    <div className="rounded-ui-rect border border-sam-border bg-sam-surface px-4 py-3">
                      <p className="sam-text-xxs font-medium text-sam-muted">{vm.t("cm_ui_shared_items")}</p>
                      <p className="mt-1 sam-text-body-lg font-semibold text-sam-fg">
                        {vm.t("cm_ui_count_items", { count: vm.photoMessageCount + vm.voiceMessageCount + vm.fileMessageCount + vm.linkMessageCount })}
                      </p>
                      <p className="mt-1 sam-text-helper text-sam-muted">
                        {vm.t("cm_ui_photo_file_counts", { photos: vm.photoMessageCount, files: vm.fileMessageCount })}
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    <button
                      type="button"
                      onClick={() => vm.setActiveSheet("members")}
                      className="rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-3 text-left"
                    >
                      <p className="sam-text-xxs text-sam-muted">{vm.t("nav_messenger_participants")}</p>
                      <p className="mt-1 sam-text-body-secondary font-semibold text-sam-fg">{vm.isGroupRoom ? vm.t("cm_ui_member_management") : vm.t("cm_ui_peer_info")}</p>
                    </button>
                    <button
                      type="button"
                      onClick={() => vm.setActiveSheet("media")}
                      className="rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-3 text-left"
                    >
                      <p className="sam-text-xxs text-sam-muted">{vm.t("cm_ui_media")}</p>
                      <p className="mt-1 sam-text-body-secondary font-semibold text-sam-fg">{vm.t("cm_ui_photo_voice")}</p>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        vm.setRoomSearchQuery("");
                        vm.setActiveSheet("search");
                      }}
                      className="rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-3 text-left"
                    >
                      <p className="sam-text-xxs text-sam-muted">{vm.t("common_search")}</p>
                      <p className="mt-1 sam-text-body-secondary font-semibold text-sam-fg">{vm.t("cm_ui_search_in_chat")}</p>
                    </button>
                  </div>

                  <div className="rounded-ui-rect border border-sam-border p-4">
                    <p className="sam-text-body font-semibold text-sam-fg">{vm.t("cm_ui_basic_info")}</p>
                    <p className="mt-3 sam-text-body font-semibold text-sam-fg">{vm.snapshot.room.title}</p>
                    <p className="mt-2 sam-text-body-secondary leading-5 text-sam-muted">
                      {vm.roomSummaryHoldsOnlyTradeOrDeliveryMeta
                        ? vm.roomSubtitle || vm.t("nav_messenger_room_no_intro")
                        : vm.snapshot.room.summary?.trim() || vm.roomSubtitle || vm.t("nav_messenger_room_no_intro")}
                    </p>
                    <div className="mt-4 space-y-2 border-t border-sam-border-soft pt-4 sam-text-body-secondary text-sam-fg">
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-sam-muted">{vm.t("cm_ui_room_type")}</span>
                        <span className="font-medium text-sam-fg">{vm.roomTypeLabel}</span>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-sam-muted">{vm.t("nav_messenger_participants")}</span>
                        <span className="font-medium text-sam-fg">{vm.t("nav_chat_count_people", { count: vm.snapshot.room.memberCount })}</span>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-sam-muted">{vm.t("nav_messenger_owner_label")}</span>
                        <span className="font-medium text-sam-fg">{vm.snapshot.room.ownerLabel || "-"}</span>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-sam-muted">{vm.t("cm_ui_my_role")}</span>
                        <span className="font-medium text-sam-fg">{vm.myRoleLabel}</span>
                      </div>
                      {vm.snapshot.room.memberLimit ? (
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-sam-muted">{vm.t("cm_ui_max_members")}</span>
                          <span className="font-medium text-sam-fg">{vm.t("nav_chat_count_people", { count: vm.snapshot.room.memberLimit })}</span>
                        </div>
                      ) : null}
                      {vm.roomJoinLabel ? (
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-sam-muted">{vm.t("cm_ui_join_method")}</span>
                          <span className="font-medium text-sam-fg">{vm.roomJoinLabel}</span>
                        </div>
                      ) : null}
                      {vm.roomIdentityLabel ? (
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-sam-muted">{vm.t("cm_ui_display_name")}</span>
                          <span className="font-medium text-sam-fg">{vm.roomIdentityLabel}</span>
                        </div>
                      ) : null}
                      {vm.isOpenGroupRoom ? (
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-sam-muted">{vm.t("cm_ui_search_visibility")}</span>
                          <span className="font-medium text-sam-fg">{vm.snapshot.room.isDiscoverable ? vm.t("cm_ui_allowed") : vm.t("nav_messenger_private_group")}</span>
                        </div>
                      ) : null}
                      {vm.isOpenGroupRoom ? (
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-sam-muted">{vm.t("nav_messenger_password_short")}</span>
                          <span className="font-medium text-sam-fg">{vm.snapshot.room.requiresPassword ? vm.t("cm_ui_enabled") : vm.t("common_none")}</span>
                        </div>
                      ) : null}
                      {vm.isPrivateGroupRoom ? (
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-sam-muted">{vm.t("nav_messenger_invite_members")}</span>
                          <span className="font-medium text-sam-fg">{vm.snapshot.room.allowMemberInvite ? vm.t("cm_ui_allowed") : vm.t("cm_ui_limited")}</span>
                        </div>
                      ) : null}
                    </div>
                  </div>

                  {vm.isGroupRoom ? (
                    <div className="rounded-ui-rect border border-sam-border p-4">
                      <p className="sam-text-body font-semibold text-sam-fg">{vm.t("cm_ui_call_status")}</p>
                      <div className="mt-3 space-y-2 sam-text-body-secondary text-sam-fg">
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-sam-muted">{vm.t("cm_ui_current_status")}</span>
                          <span className="font-medium text-sam-fg">{vm.groupCallStatusLabel}</span>
                        </div>
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-sam-muted">{vm.t("cm_ui_start_permission")}</span>
                          <span className="font-medium text-sam-fg">{vm.canStartGroupCall ? vm.t("cm_ui_possible") : vm.t("cm_ui_limited")}</span>
                        </div>
                        {vm.activeGroupCall ? (
                          <div className="flex items-center justify-between gap-3">
                            <span className="text-sam-muted">{vm.t("cm_ui_current_participants")}</span>
                            <span className="font-medium text-sam-fg">{vm.t("nav_chat_count_people", { count: vm.activeGroupCall.participants.length })}</span>
                          </div>
                        ) : null}
                      </div>
                    </div>
                  ) : null}

                  <div className="rounded-ui-rect border border-sam-border p-4">
                    <p className="sam-text-body font-semibold text-sam-fg">{vm.t("cm_ui_shared_items")}</p>
                    <div className="mt-3 grid grid-cols-4 gap-2">
                      <button
                        type="button"
                        onClick={() => vm.setActiveSheet("media")}
                        className="rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-3 text-left"
                      >
                        <p className="sam-text-xxs text-sam-muted">{vm.t("cm_ui_photo")}</p>
                        <p className="mt-1 sam-text-body-lg font-semibold text-sam-fg">{vm.photoMessageCount}</p>
                      </button>
                      <button
                        type="button"
                        onClick={() => vm.setActiveSheet("media")}
                        className="rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-3 text-left"
                      >
                        <p className="sam-text-xxs text-sam-muted">{vm.t("nav_voice_call_label")}</p>
                        <p className="mt-1 sam-text-body-lg font-semibold text-sam-fg">{vm.voiceMessageCount}</p>
                      </button>
                      <button
                        type="button"
                        onClick={() => vm.setActiveSheet("files")}
                        className="rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-3 text-left"
                      >
                        <p className="sam-text-xxs text-sam-muted">{vm.t("cm_ui_file")}</p>
                        <p className="mt-1 sam-text-body-lg font-semibold text-sam-fg">{vm.fileMessageCount}</p>
                      </button>
                      <button
                        type="button"
                        onClick={() => vm.setActiveSheet("links")}
                        className="rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-3 text-left"
                      >
                        <p className="sam-text-xxs text-sam-muted">{vm.t("cm_ui_link")}</p>
                        <p className="mt-1 sam-text-body-lg font-semibold text-sam-fg">{vm.linkMessageCount}</p>
                      </button>
                    </div>
                  </div>

                  {vm.isPrivateGroupRoom ? (
                    <div className="rounded-ui-rect border border-sam-border p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="sam-text-body font-semibold text-sam-fg">{vm.t("cm_ui_operation")}</p>
                          <p className="mt-1 sam-text-helper text-sam-muted">
                            {vm.t("cm_ui_owner_admin_summary", { owner: vm.snapshot.room.ownerLabel || "-", count: vm.groupAdminCount })}
                          </p>
                        </div>
                        <span className="rounded-ui-rect border border-sam-border bg-sam-surface px-2 py-1 sam-text-xxs font-semibold text-sam-fg">{vm.myRoleLabel}</span>
                      </div>
                      <div className="mt-3 grid grid-cols-3 gap-2">
                        <div className="rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-3">
                          <p className="sam-text-xxs text-sam-muted">{vm.t("neighborhood_notice")}</p>
                          <p className="mt-1 sam-text-body-secondary font-semibold text-sam-fg">{vm.privateGroupNoticeStatusLabel}</p>
                          <p className="mt-1 sam-text-xxs text-sam-meta">{vm.t("cm_ui_top_fixed_status")}</p>
                        </div>
                        <div className="rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-3">
                          <p className="sam-text-xxs text-sam-muted">{vm.t("cm_ui_allowed_permissions")}</p>
                          <p className="mt-1 sam-text-body-secondary font-semibold text-sam-fg">{vm.allowedPrivateGroupPermissionCount}/6</p>
                          <p className="mt-1 sam-text-xxs text-sam-meta">{vm.t("cm_ui_operation_settings_applied")}</p>
                        </div>
                        <div className="rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-3">
                          <p className="sam-text-xxs text-sam-muted">{vm.t("cm_ui_operation_history")}</p>
                          <p className="mt-1 sam-text-body-secondary font-semibold text-sam-fg">{vm.t("cm_ui_count_items", { count: vm.managementEventMessages.length })}</p>
                          <p className="mt-1 sam-text-xxs text-sam-meta">{vm.t("cm_ui_role_change_history")}</p>
                        </div>
                      </div>
                      <div className="mt-3 grid grid-cols-3 gap-2">
                        <button
                          type="button"
                          onClick={() => vm.openInfoSheet("notice")}
                          className="rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-3 text-left"
                        >
                          <p className="sam-text-xxs text-sam-muted">{vm.t("cm_ui_operation")}</p>
                          <p className="mt-1 sam-text-body-secondary font-semibold text-sam-fg">{vm.t("neighborhood_notice")}</p>
                          <p className="mt-1 sam-text-xxs text-sam-meta">{vm.t("cm_ui_register_edit")}</p>
                        </button>
                        <button
                          type="button"
                          onClick={() => vm.openInfoSheet("permissions")}
                          className="rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-3 text-left"
                        >
                          <p className="sam-text-xxs text-sam-muted">{vm.t("cm_ui_operation")}</p>
                          <p className="mt-1 sam-text-body-secondary font-semibold text-sam-fg">{vm.t("cm_ui_permissions")}</p>
                          <p className="mt-1 sam-text-xxs text-sam-meta">{vm.t("cm_ui_adjust_allowed_range")}</p>
                        </button>
                        <button
                          type="button"
                          onClick={() => vm.openInfoSheet("history")}
                          className="rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-3 text-left"
                        >
                          <p className="sam-text-xxs text-sam-muted">{vm.t("cm_ui_operation")}</p>
                          <p className="mt-1 sam-text-body-secondary font-semibold text-sam-fg">{vm.t("cm_ui_history")}</p>
                          <p className="mt-1 sam-text-xxs text-sam-meta">{vm.t("cm_ui_view_system_history")}</p>
                        </button>
                      </div>
                      <div className="mt-3 grid gap-2">
                        <button
                          type="button"
                          onClick={() => vm.setActiveSheet("members")}
                          className="rounded-ui-rect border border-sam-border px-4 py-3 text-left sam-text-body-secondary font-semibold text-sam-fg"
                        >
                          {vm.isOwner ? vm.t("cm_ui_members_transfer") : vm.t("cm_ui_members_invite")}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            if (vm.isOwner) {
                              vm.setActiveSheet("members");
                              return;
                            }
                            void vm.requestLeaveRoom();
                          }}
                          disabled={vm.busy === "leave-room"}
                          className="rounded-ui-rect border border-red-200 bg-sam-surface px-4 py-3 text-left sam-text-body-secondary font-semibold text-red-700 disabled:opacity-40"
                        >
                          {vm.busy === "leave-room"
                            ? vm.t("nav_messenger_leaving")
                            : vm.isOwner
                              ? vm.t("cm_ui_leave_after_owner_transfer")
                              : vm.t("nav_messenger_leave_group_room")}
                        </button>
                      </div>
                    </div>
                  ) : null}

                  {vm.isPrivateGroupRoom || vm.isOpenGroupRoom ? (
                    <div ref={vm.groupNoticeSectionRef} className="rounded-ui-rect border border-sam-border p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="sam-text-body font-semibold text-sam-fg">
                            {vm.isOpenGroupRoom ? vm.t("cm_ui_meeting_notice") : vm.t("cm_ui_group_notice")}
                          </p>
                          <p className="mt-1 sam-text-helper text-sam-muted">
                            {vm.privateGroupNotice
                              ? vm.isOpenGroupRoom
                                ? vm.t("cm_ui_shown_to_participants")
                                : vm.t("cm_ui_shown_top_and_drawer")
                              : vm.t("cm_ui_no_registered_notice")}
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
                          <p className="sam-text-xxs text-sam-muted">{vm.t("cm_ui_status")}</p>
                          <p className="mt-1 sam-text-body-secondary font-semibold text-sam-fg">{vm.privateGroupNoticeStatusLabel}</p>
                        </div>
                        <div className="rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-3">
                          <p className="sam-text-xxs text-sam-muted">{vm.t("cm_ui_visibility")}</p>
                          <p className="mt-1 sam-text-body-secondary font-semibold text-sam-fg">{vm.privateGroupNotice ? vm.t("cm_ui_shown_top") : vm.t("cm_ui_not_set")}</p>
                        </div>
                      </div>
                      {vm.canEditGroupNotice ? (
                        <div className="mt-3 grid gap-3">
                          <textarea
                            value={vm.privateGroupNoticeDraft}
                            onChange={(e) => vm.setPrivateGroupNoticeDraft(e.target.value)}
                            rows={4}
                            placeholder={vm.isOpenGroupRoom ? vm.t("cm_ui_enter_meeting_notice") : vm.t("cm_ui_enter_group_notice")}
                            className="w-full rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-3 sam-text-body outline-none focus:border-sam-border"
                          />
                          <button
                            type="button"
                            onClick={() => void vm.savePrivateGroupNotice()}
                            disabled={vm.busy === "group-notice"}
                            className="rounded-ui-rect bg-sam-ink px-4 py-3 sam-text-body-secondary font-semibold text-white disabled:opacity-40"
                          >
                            {vm.busy === "group-notice" ? vm.t("common_processing") : vm.t("cm_ui_save_notice")}
                          </button>
                        </div>
                      ) : vm.privateGroupNotice ? (
                        <div className="mt-3 rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-3">
                          <p className="whitespace-pre-wrap sam-text-body-secondary leading-5 text-sam-fg">{vm.privateGroupNotice}</p>
                        </div>
                      ) : (
                        <div className="mt-3 rounded-ui-rect border border-dashed border-sam-border bg-sam-surface px-3 py-4 sam-text-helper text-sam-muted">
                          {vm.isOpenGroupRoom ? vm.t("cm_ui_no_registered_meeting_notice") : vm.t("cm_ui_no_registered_group_notice")}
                        </div>
                      )}
                    </div>
                  ) : null}

                  {vm.isPrivateGroupRoom ? (
                    <div ref={vm.groupPermissionsSectionRef} className="rounded-ui-rect border border-sam-border p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="sam-text-body font-semibold text-sam-fg">{vm.t("cm_ui_permission_settings")}</p>
                          <p className="mt-1 sam-text-helper text-sam-muted">{vm.t("cm_ui_allowed_limited_counts", { allowed: vm.allowedPrivateGroupPermissionCount, limited: 6 - vm.allowedPrivateGroupPermissionCount })}</p>
                        </div>
                        <span className="rounded-ui-rect border border-sam-border bg-sam-surface px-2 py-1 sam-text-xxs font-semibold text-sam-fg">{vm.myRoleLabel}</span>
                      </div>
                      <div className="mt-3 grid grid-cols-2 gap-2">
                        <div className="rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-3">
                          <p className="sam-text-xxs text-sam-muted">{vm.t("cm_ui_allowed")}</p>
                          <p className="mt-1 sam-text-body-secondary font-semibold text-sam-fg">{vm.t("cm_ui_count_items", { count: vm.allowedPrivateGroupPermissionCount })}</p>
                        </div>
                        <div className="rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-3">
                          <p className="sam-text-xxs text-sam-muted">{vm.t("cm_ui_limited")}</p>
                          <p className="mt-1 sam-text-body-secondary font-semibold text-sam-fg">{vm.t("cm_ui_count_items", { count: 6 - vm.allowedPrivateGroupPermissionCount })}</p>
                        </div>
                      </div>
                      <div className="mt-3 rounded-ui-rect border border-sam-border bg-sam-surface p-3">
                        <p className="sam-text-helper font-semibold text-sam-fg">{vm.t("cm_ui_permission_summary")}</p>
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
                          <span className="sam-text-body-secondary font-medium text-sam-fg">{vm.t("cm_ui_allow_member_invite")}</span>
                          <input type="checkbox" checked={vm.groupAllowMemberInvite} onChange={(e) => vm.setGroupAllowMemberInvite(e.target.checked)} disabled={!vm.canManageGroupPermissions} />
                        </label>
                        <label className="flex items-center justify-between rounded-ui-rect border border-sam-border px-3 py-3">
                          <span className="sam-text-body-secondary font-medium text-sam-fg">{vm.t("cm_ui_allow_admin_invite")}</span>
                          <input type="checkbox" checked={vm.groupAllowAdminInvite} onChange={(e) => vm.setGroupAllowAdminInvite(e.target.checked)} disabled={!vm.canManageGroupPermissions} />
                        </label>
                        <label className="flex items-center justify-between rounded-ui-rect border border-sam-border px-3 py-3">
                          <span className="sam-text-body-secondary font-medium text-sam-fg">{vm.t("cm_ui_allow_admin_kick")}</span>
                          <input type="checkbox" checked={vm.groupAllowAdminKick} onChange={(e) => vm.setGroupAllowAdminKick(e.target.checked)} disabled={!vm.canManageGroupPermissions} />
                        </label>
                        <label className="flex items-center justify-between rounded-ui-rect border border-sam-border px-3 py-3">
                          <span className="sam-text-body-secondary font-medium text-sam-fg">{vm.t("cm_ui_allow_admin_edit_notice")}</span>
                          <input type="checkbox" checked={vm.groupAllowAdminEditNotice} onChange={(e) => vm.setGroupAllowAdminEditNotice(e.target.checked)} disabled={!vm.canManageGroupPermissions} />
                        </label>
                        <label className="flex items-center justify-between rounded-ui-rect border border-sam-border px-3 py-3">
                          <span className="sam-text-body-secondary font-medium text-sam-fg">{vm.t("cm_ui_allow_member_upload")}</span>
                          <input type="checkbox" checked={vm.groupAllowMemberUpload} onChange={(e) => vm.setGroupAllowMemberUpload(e.target.checked)} disabled={!vm.canManageGroupPermissions} />
                        </label>
                        <label className="flex items-center justify-between rounded-ui-rect border border-sam-border px-3 py-3">
                          <span className="sam-text-body-secondary font-medium text-sam-fg">{vm.t("cm_ui_allow_member_call")}</span>
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
                          {vm.busy === "group-permissions" ? vm.t("common_processing") : vm.t("cm_ui_save_permissions")}
                        </button>
                      ) : null}
                    </div>
                  ) : null}

                  {vm.managementEventMessages.length ? (
                    <div ref={vm.groupHistorySectionRef} className="rounded-ui-rect border border-sam-border p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="sam-text-body font-semibold text-sam-fg">{vm.t("cm_ui_operation_history")}</p>
                          <p className="mt-1 sam-text-helper text-sam-muted">{vm.t("cm_ui_check_operation_history_description")}</p>
                        </div>
                        <span className="rounded-ui-rect border border-sam-border bg-sam-surface px-2 py-1 sam-text-xxs font-semibold text-sam-fg">
                          {vm.t("cm_ui_count_items", { count: vm.managementEventMessages.length })}
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
                            onClick={() => void vm.requestLeaveRoom()}
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
                    <p className="sam-text-body-secondary font-medium text-sam-fg">{vm.t("cm_ui_search_in_this_room")}</p>
                    <h2 className="mt-1 sam-text-page-title font-semibold text-sam-fg">{vm.t("cm_ui_search_in_chat")}</h2>
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
                  placeholder={vm.t("cm_ui_keyword_sender_content")}
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
                    <p className="py-6 text-center sam-text-body-secondary text-sam-muted">{vm.t("cm_ui_no_search_results")}</p>
                  )}
                </div>
              </>
            ) : null}

            {vm.activeSheet === "media" ? (
              <>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="sam-text-body-secondary font-medium text-sam-fg">
                      {vm.isPrivateGroupRoom ? vm.t("cm_ui_group_media_album") : vm.t("cm_ui_room_media")}
                    </p>
                    <h2 className="mt-1 sam-text-page-title font-semibold text-sam-fg">{vm.t("cm_ui_photo_voice")}</h2>
                  </div>
                  <button
                    type="button"
                    onClick={() => vm.setActiveSheet("menu")}
                    className="rounded-ui-rect border border-sam-border px-3 py-2 sam-text-helper text-sam-fg"
                  >
                    {vm.t("tier1_back")}
                  </button>
                </div>
                {vm.isPrivateGroupRoom ? (
                  <GroupRoomMediaAlbumTabs
                    roomId={vm.streamRoomId}
                    enabled={vm.activeSheet === "media"}
                    onOpenMessage={(id) => {
                      vm.dismissRoomSheet();
                      vm.scrollToRoomMessage(id);
                    }}
                  />
                ) : (
                  <>
                <div className="mt-4 grid grid-cols-2 gap-2">
                  <div className="rounded-ui-rect border border-sam-border bg-sam-surface px-4 py-3">
                    <p className="sam-text-xxs font-medium text-sam-muted">{vm.t("cm_ui_photo")}</p>
                    <p className="mt-1 sam-text-body-lg font-semibold text-sam-fg">{vm.photoMessageCount}</p>
                    <p className="mt-1 sam-text-helper text-sam-muted">{vm.t("cm_ui_image_photo_links")}</p>
                  </div>
                  <div className="rounded-ui-rect border border-sam-border bg-sam-surface px-4 py-3">
                    <p className="sam-text-xxs font-medium text-sam-muted">{vm.t("nav_voice_call_label")}</p>
                    <p className="mt-1 sam-text-body-lg font-semibold text-sam-fg">{vm.voiceMessageCount}</p>
                    <p className="mt-1 sam-text-helper text-sam-muted">{vm.t("cm_ui_voice_message_history")}</p>
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
                            vm.t("nav_voice_call_label")
                          ) : m.messageType === "image" || looksLikeDirectImageUrl(m.content) ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={(m.imageAlbumUrls?.[0] ?? m.content).trim()}
                              alt=""
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            vm.t("cm_ui_media")
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="sam-text-helper text-sam-muted">{formatTime(m.createdAt)}</p>
                          <p className="mt-0.5 truncate sam-text-body text-sam-fg">
                            {m.messageType === "voice"
                              ? vm.t("cm_ui_voice_with_optional_seconds", {
                                  seconds:
                                    typeof m.voiceDurationSeconds === "number" && m.voiceDurationSeconds > 0
                                      ? ` · ${m.voiceDurationSeconds}${vm.t("cm_ui_seconds_suffix")}`
                                      : "",
                                })
                              : m.imageAlbumUrls && m.imageAlbumUrls.length > 1
                                ? vm.t("cm_ui_photo_count_sheets", { count: m.imageAlbumUrls.length })
                                : vm.t("cm_ui_photo")}
                          </p>
                        </div>
                      </button>
                    ))
                  ) : (
                    <p className="py-8 text-center sam-text-body-secondary text-sam-muted">{vm.t("cm_ui_no_media")}</p>
                  )}
                </div>
                  </>
                )}
              </>
            ) : null}

            {vm.activeSheet === "files" ? (
              <>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="sam-text-body-secondary font-medium text-sam-fg">{vm.t("cm_ui_room_files")}</p>
                    <h2 className="mt-1 sam-text-page-title font-semibold text-sam-fg">{vm.t("cm_ui_files_collection")}</h2>
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
                  <p className="sam-text-xxs font-medium text-sam-muted">{vm.t("cm_ui_attached_files")}</p>
                  <p className="mt-1 sam-text-body-lg font-semibold text-sam-fg">{vm.t("cm_ui_count_items", { count: vm.fileMessageCount })}</p>
                  <p className="mt-1 sam-text-helper text-sam-muted">{vm.t("cm_ui_check_docs_archives_attachments")}</p>
                </div>
                <div className="mt-4 max-h-[55vh] space-y-3 overflow-y-auto">
                  {vm.fileMessages.length ? (
                    vm.fileMessages.map((m) => (
                      <div key={m.id} className="rounded-ui-rect border border-sam-border bg-sam-surface p-3">
                        <button type="button" onClick={() => vm.scrollToRoomMessage(m.id)} className="w-full text-left">
                          <p className="sam-text-helper text-sam-muted">{vm.tt(m.senderLabel)} · {formatTime(m.createdAt)}</p>
                          <p className="mt-1 truncate sam-text-body font-semibold text-sam-fg">{m.fileName?.trim() || vm.t("cm_ui_attached_files")}</p>
                          <p className="mt-1 sam-text-helper text-sam-muted">{formatFileMeta(m.fileMimeType, m.fileSizeBytes)}</p>
                        </button>
                        {!m.pending && m.content.trim() ? (
                          <a
                            href={m.content.trim()}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="mt-3 inline-flex rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2 sam-text-helper font-semibold text-sam-fg"
                          >
                            {vm.t("cm_ui_open_file")}
                          </a>
                        ) : (
                          <p className="mt-3 sam-text-helper text-sam-muted">{vm.t("cm_ui_uploading")}</p>
                        )}
                      </div>
                    ))
                  ) : (
                    <p className="py-8 text-center sam-text-body-secondary text-sam-muted">{vm.t("cm_ui_no_files")}</p>
                  )}
                </div>
              </>
            ) : null}

            {vm.activeSheet === "links" ? (
              <>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="sam-text-body-secondary font-medium text-sam-fg">{vm.t("cm_ui_room_links")}</p>
                    <h2 className="mt-1 sam-text-page-title font-semibold text-sam-fg">{vm.t("cm_ui_links_collection")}</h2>
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
                  <p className="sam-text-xxs font-medium text-sam-muted">{vm.t("cm_ui_shared_links")}</p>
                  <p className="mt-1 sam-text-body-lg font-semibold text-sam-fg">{vm.t("cm_ui_count_items", { count: vm.linkMessageCount })}</p>
                  <p className="mt-1 sam-text-helper text-sam-muted">{vm.t("cm_ui_collect_message_urls")}</p>
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
                    <p className="py-8 text-center sam-text-body-secondary text-sam-muted">{vm.t("cm_ui_no_links")}</p>
                  )}
                </div>
              </>
            ) : null}
          </div>
        </div>
      ) : null}
      {groupOutgoingConfirmKind ? (
        <MessengerOutgoingCallConfirmDialog
          open
          peerLabel={vm.snapshot.room.title?.trim() || ""}
          kind={groupOutgoingConfirmKind}
          busy={vm.call.busy === "call-start" || vm.call.busy === "device-prepare"}
          onCancel={() => setGroupOutgoingConfirmKind(null)}
          onConfirm={() => {
            const kind = groupOutgoingConfirmKind;
            setGroupOutgoingConfirmKind(null);
            void vm.startGroupCall(kind);
          }}
        />
      ) : null}
    </>
  );
}
