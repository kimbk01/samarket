"use client";

import type { RefObject } from "react";
import { CommunityMessengerDeviceSettingsSection } from "@/components/community-messenger/CommunityMessengerDeviceSettingsSection";
import { MessengerSettingsBlock, SettingsActionRow, SettingsToggleRow } from "@/components/community-messenger/MessengerSheetUi";
import type { CommunityMessengerLocalSettings } from "@/lib/community-messenger/preferences";
import type { CommunityMessengerProfileLite } from "@/lib/community-messenger/types";

type MessengerNotificationSettings = {
  trade_chat_enabled: boolean;
  community_chat_enabled: boolean;
  order_enabled: boolean;
  store_enabled: boolean;
  sound_enabled: boolean;
  vibration_enabled: boolean;
};

export type MessengerSettingsSheetProps = {
  onClose: () => void;
  busyId: string | null;
  blocked: CommunityMessengerProfileLite[];
  hidden: CommunityMessengerProfileLite[];
  favoriteManageFriends: CommunityMessengerProfileLite[];
  favoriteCount: number;
  notificationSettings: MessengerNotificationSettings;
  updateNotificationSetting: (key: keyof MessengerNotificationSettings, value: boolean) => void | Promise<void>;
  incomingCallSoundEnabled: boolean;
  onIncomingCallSoundChange: (next: boolean) => void;
  incomingCallBannerEnabled: boolean;
  onIncomingCallBannerChange: (next: boolean) => void;
  localSettings: CommunityMessengerLocalSettings;
  updateLocalSetting: (key: keyof CommunityMessengerLocalSettings, value: boolean) => void;
  onToggleBlock: (userId: string) => void | Promise<void>;
  onToggleHiddenFriend: (userId: string) => void | Promise<void>;
  onToggleFavoriteFriend: (userId: string) => void | Promise<void>;
  exportSettingsBackup: () => void;
  backupInputRef: RefObject<HTMLInputElement | null>;
  onBackupFileSelected: (event: React.ChangeEvent<HTMLInputElement>) => void | Promise<void>;
  onOpenOpenChatDiscovery: () => void;
};

/**
 * 메신저 설정 — 알림 / 통화·기기 / 친구 / 채팅 / 모임 다섯 블록만 유지.
 */
export function MessengerSettingsSheet({
  onClose,
  busyId,
  blocked,
  hidden,
  favoriteManageFriends,
  favoriteCount,
  notificationSettings,
  updateNotificationSetting,
  incomingCallSoundEnabled,
  onIncomingCallSoundChange,
  incomingCallBannerEnabled,
  onIncomingCallBannerChange,
  localSettings,
  updateLocalSetting,
  onToggleBlock,
  onToggleHiddenFriend,
  onToggleFavoriteFriend,
  exportSettingsBackup,
  backupInputRef,
  onBackupFileSelected,
  onOpenOpenChatDiscovery,
}: MessengerSettingsSheetProps) {
  return (
    <div className="fixed inset-0 z-[43] flex flex-col justify-end bg-black/30">
      <button type="button" className="min-h-0 flex-1 cursor-default" aria-label="닫기" onClick={onClose} />
      <div
        data-messenger-shell
        className="flex max-h-[88vh] w-full flex-col overflow-hidden rounded-t-[var(--messenger-radius-md)] border border-[color:var(--messenger-divider)] bg-[color:var(--messenger-surface)] shadow-[var(--messenger-shadow-soft)]"
      >
        <div className="flex shrink-0 items-center justify-between border-b border-[color:var(--messenger-divider)] px-3 py-2.5">
          <p className="sam-text-body-lg font-semibold" style={{ color: "var(--messenger-text)" }}>
            설정
          </p>
          <button
            type="button"
            className="rounded-[var(--messenger-radius-sm)] px-2 py-1 sam-text-body active:bg-[color:var(--messenger-primary-soft)]"
            style={{ color: "var(--messenger-text-secondary)" }}
            onClick={onClose}
          >
            닫기
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto bg-[color:var(--messenger-bg)] px-3 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
          <div className="space-y-4">
            <MessengerSettingsBlock title="알림">
              <SettingsToggleRow
                title="메신저·1:1 채팅"
                description="일반 대화 알림"
                checked={notificationSettings.community_chat_enabled}
                disabled={busyId === "notification-setting:community_chat_enabled"}
                onChange={(next) => void updateNotificationSetting("community_chat_enabled", next)}
              />
              <SettingsToggleRow
                title="거래 채팅"
                description="중고·거래 연결 알림"
                checked={notificationSettings.trade_chat_enabled}
                disabled={busyId === "notification-setting:trade_chat_enabled"}
                onChange={(next) => void updateNotificationSetting("trade_chat_enabled", next)}
              />
              <SettingsToggleRow
                title="주문·배달"
                checked={notificationSettings.order_enabled}
                disabled={busyId === "notification-setting:order_enabled"}
                onChange={(next) => void updateNotificationSetting("order_enabled", next)}
              />
              <SettingsToggleRow
                title="매장"
                description="매장 공지·운영 알림"
                checked={notificationSettings.store_enabled}
                disabled={busyId === "notification-setting:store_enabled"}
                onChange={(next) => void updateNotificationSetting("store_enabled", next)}
              />
              <SettingsToggleRow
                title="채팅·서비스 알림 소리"
                description="메시지·거래·주문 등 알림음"
                checked={notificationSettings.sound_enabled}
                disabled={busyId === "notification-setting:sound_enabled"}
                onChange={(next) => void updateNotificationSetting("sound_enabled", next)}
              />
              <SettingsToggleRow
                title="수신 통화 벨"
                description="이 기기에서 통화 수신 시 재생합니다. 관리자가 서버에 지정한 통화 톤이 있으면 그 톤이 우선될 수 있습니다."
                checked={incomingCallSoundEnabled}
                onChange={(next) => onIncomingCallSoundChange(next)}
              />
              <SettingsToggleRow
                title="수신 통화 화면 안내"
                description="배너·오버레이"
                checked={incomingCallBannerEnabled}
                onChange={(next) => onIncomingCallBannerChange(next)}
              />
              <SettingsToggleRow
                title="진동"
                checked={notificationSettings.vibration_enabled}
                disabled={busyId === "notification-setting:vibration_enabled"}
                onChange={(next) => void updateNotificationSetting("vibration_enabled", next)}
              />
            </MessengerSettingsBlock>

            <MessengerSettingsBlock title="통화 · 기기">
              <CommunityMessengerDeviceSettingsSection visible={true} embedded />
            </MessengerSettingsBlock>

            <MessengerSettingsBlock title="친구">
              <p className="px-3 py-2 sam-text-helper leading-snug text-ui-muted">
                차단 {blocked.length}명 · 숨김 {hidden.length}명 · 즐겨찾기 {favoriteCount}명
              </p>
              <SettingsToggleRow
                title="전화번호로 친구 추가"
                description="연락처 탭 사용"
                checked={localSettings.phoneFriendAddEnabled}
                onChange={(next) => updateLocalSetting("phoneFriendAddEnabled", next)}
              />
              <SettingsToggleRow
                title="연락처 자동 추가"
                description="모바일 연동 시 자동 반영"
                checked={localSettings.contactAutoAddEnabled}
                onChange={(next) => updateLocalSetting("contactAutoAddEnabled", next)}
              />
              <div className="px-3 py-2">
                <p className="sam-text-helper font-medium text-ui-fg">차단</p>
                {blocked.length ? (
                  <div className="mt-1.5 space-y-1">
                    {blocked.map((user) => (
                      <div key={user.id} className="flex items-center justify-between gap-2 border-b border-ui-border py-1.5 last:border-0">
                        <span className="truncate sam-text-body-secondary text-ui-fg">{user.label}</span>
                        <button
                          type="button"
                          onClick={() => void onToggleBlock(user.id)}
                          disabled={busyId === `block:${user.id}`}
                          className="shrink-0 sam-text-xxs font-medium text-ui-muted"
                        >
                          해제
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="mt-1 sam-text-xxs text-ui-muted">차단된 사용자가 없습니다.</p>
                )}
              </div>
              <div className="px-3 py-2">
                <p className="sam-text-helper font-medium text-ui-fg">숨김 친구</p>
                {hidden.length ? (
                  <div className="mt-1.5 space-y-1">
                    {hidden.map((friend) => (
                      <div key={friend.id} className="flex items-center justify-between gap-2 border-b border-ui-border py-1.5 last:border-0">
                        <div className="min-w-0">
                          <p className="truncate sam-text-body-secondary text-ui-fg">{friend.label}</p>
                          <p className="truncate sam-text-xxs text-ui-muted">{friend.subtitle ?? "목록에서만 숨김"}</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => void onToggleHiddenFriend(friend.id)}
                          disabled={busyId === `hidden:${friend.id}`}
                          className="shrink-0 sam-text-xxs font-medium text-ui-muted"
                        >
                          해제
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="mt-1 sam-text-xxs text-ui-muted">숨김 처리된 친구가 없습니다.</p>
                )}
              </div>
              <div className="px-3 py-2">
                <p className="sam-text-helper font-medium text-ui-fg">즐겨찾기 관리</p>
                {favoriteManageFriends.length ? (
                  <div className="mt-1.5 space-y-1">
                    {favoriteManageFriends.map((friend) => (
                      <div key={friend.id} className="flex items-center justify-between gap-2 border-b border-ui-border py-1.5 last:border-0">
                        <div className="min-w-0">
                          <p className="truncate sam-text-body-secondary text-ui-fg">{friend.label}</p>
                          <p className="truncate sam-text-xxs text-ui-muted">
                            {friend.isHiddenFriend ? "숨김 친구 · 즐겨찾기 유지" : friend.subtitle ?? "즐겨찾기"}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => void onToggleFavoriteFriend(friend.id)}
                          disabled={busyId === `favorite:${friend.id}`}
                          className="shrink-0 sam-text-xxs font-medium text-ui-muted"
                        >
                          해제
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="mt-1 sam-text-xxs text-ui-muted">즐겨찾기 친구가 없습니다.</p>
                )}
              </div>
            </MessengerSettingsBlock>

            <MessengerSettingsBlock title="채팅">
              <SettingsToggleRow
                title="입장 전 정보 확인"
                description="모임 채팅도 입장 전 정보를 먼저 확인"
                checked={localSettings.groupJoinPreviewEnabled}
                onChange={(next) => updateLocalSetting("groupJoinPreviewEnabled", next)}
              />
              <SettingsToggleRow
                title="미디어 자동 저장"
                description="파일·이미지 링크를 저장 중심으로 열기"
                checked={localSettings.mediaAutoSaveEnabled}
                onChange={(next) => updateLocalSetting("mediaAutoSaveEnabled", next)}
              />
              <SettingsToggleRow
                title="링크 미리보기"
                description="대화에서 링크 칩 표시"
                checked={localSettings.linkPreviewEnabled}
                onChange={(next) => updateLocalSetting("linkPreviewEnabled", next)}
              />
              <div className="flex items-center justify-between gap-3 px-3 py-2">
                <span className="min-w-0">
                  <span className="block sam-text-body-secondary font-medium text-ui-fg">대화 백업</span>
                  <span className="mt-0.5 block sam-text-xxs leading-snug text-ui-muted">설정과 최근 검색, 장치 선택 백업</span>
                </span>
                <div className="flex shrink-0 gap-1.5">
                  <button
                    type="button"
                    onClick={exportSettingsBackup}
                    className="rounded-ui-rect border border-ui-border bg-ui-page px-2.5 py-1 sam-text-xxs font-medium text-ui-fg"
                  >
                    내보내기
                  </button>
                  <button
                    type="button"
                    onClick={() => backupInputRef.current?.click()}
                    className="rounded-ui-rect border border-ui-border bg-ui-page px-2.5 py-1 sam-text-xxs font-medium text-ui-fg"
                  >
                    가져오기
                  </button>
                </div>
              </div>
            </MessengerSettingsBlock>

            <MessengerSettingsBlock title="모임">
              <SettingsActionRow
                title="모임 찾기"
                description="참여 가능한 모임 목록 열기"
                actionLabel="열기"
                onClick={onOpenOpenChatDiscovery}
              />
            </MessengerSettingsBlock>
            <input
              ref={backupInputRef}
              type="file"
              accept="application/json"
              className="hidden"
              onChange={(event) => void onBackupFileSelected(event)}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
