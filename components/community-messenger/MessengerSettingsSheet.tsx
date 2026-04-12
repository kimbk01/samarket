"use client";

import type { RefObject } from "react";
import { CommunityMessengerDeviceSettingsSection } from "@/components/community-messenger/CommunityMessengerDeviceSettingsSection";
import {
  MessengerSettingsBlock,
  MiniMetricCard,
  SettingsActionRow,
  SettingsToggleRow,
} from "@/components/community-messenger/MessengerSheetUi";
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
 * 메신저 설정 — 알림 / 통화·기기 / 친구 / 채팅 / 오픈채팅 다섯 블록만 유지.
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
      <div className="flex max-h-[88vh] w-full flex-col overflow-hidden rounded-t-[12px] border border-ui-border bg-ui-surface shadow-[var(--ui-shadow-card)]">
        <div className="flex shrink-0 items-center justify-between border-b border-ui-border px-3 py-2.5">
          <p className="text-[16px] font-semibold text-ui-fg">설정</p>
          <button type="button" className="rounded-ui-rect px-2 py-1 text-[14px] text-ui-muted" onClick={onClose}>
            닫기
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-[max(1rem,env(safe-area-inset-bottom))] pt-2">
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
                title="벨소리·수신 통화 톤"
                checked={incomingCallSoundEnabled && notificationSettings.sound_enabled}
                onChange={(next) => {
                  onIncomingCallSoundChange(next);
                  void updateNotificationSetting("sound_enabled", next);
                }}
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
              <div className="grid grid-cols-3 gap-1.5 px-3 py-2">
                <MiniMetricCard label="차단" value={String(blocked.length)} helper="연결 차단" compact />
                <MiniMetricCard label="숨김" value={String(hidden.length)} helper="목록만 숨김" compact />
                <MiniMetricCard label="즐겨찾기" value={String(favoriteCount)} helper="빠른 접근" compact />
              </div>
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
                <p className="text-[12px] font-medium text-ui-fg">차단</p>
                {blocked.length ? (
                  <div className="mt-1.5 space-y-1">
                    {blocked.map((user) => (
                      <div key={user.id} className="flex items-center justify-between gap-2 border-b border-ui-border py-1.5 last:border-0">
                        <span className="truncate text-[13px] text-ui-fg">{user.label}</span>
                        <button
                          type="button"
                          onClick={() => void onToggleBlock(user.id)}
                          disabled={busyId === `block:${user.id}`}
                          className="shrink-0 text-[11px] font-medium text-ui-muted"
                        >
                          해제
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="mt-1 text-[11px] text-ui-muted">차단된 사용자가 없습니다.</p>
                )}
              </div>
              <div className="px-3 py-2">
                <p className="text-[12px] font-medium text-ui-fg">숨김 친구</p>
                {hidden.length ? (
                  <div className="mt-1.5 space-y-1">
                    {hidden.map((friend) => (
                      <div key={friend.id} className="flex items-center justify-between gap-2 border-b border-ui-border py-1.5 last:border-0">
                        <div className="min-w-0">
                          <p className="truncate text-[13px] text-ui-fg">{friend.label}</p>
                          <p className="truncate text-[11px] text-ui-muted">{friend.subtitle ?? "목록에서만 숨김"}</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => void onToggleHiddenFriend(friend.id)}
                          disabled={busyId === `hidden:${friend.id}`}
                          className="shrink-0 text-[11px] font-medium text-ui-muted"
                        >
                          해제
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="mt-1 text-[11px] text-ui-muted">숨김 처리된 친구가 없습니다.</p>
                )}
              </div>
              <div className="px-3 py-2">
                <p className="text-[12px] font-medium text-ui-fg">즐겨찾기 관리</p>
                {favoriteManageFriends.length ? (
                  <div className="mt-1.5 space-y-1">
                    {favoriteManageFriends.map((friend) => (
                      <div key={friend.id} className="flex items-center justify-between gap-2 border-b border-ui-border py-1.5 last:border-0">
                        <div className="min-w-0">
                          <p className="truncate text-[13px] text-ui-fg">{friend.label}</p>
                          <p className="truncate text-[11px] text-ui-muted">
                            {friend.isHiddenFriend ? "숨김 친구 · 즐겨찾기 유지" : friend.subtitle ?? "즐겨찾기"}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => void onToggleFavoriteFriend(friend.id)}
                          disabled={busyId === `favorite:${friend.id}`}
                          className="shrink-0 text-[11px] font-medium text-ui-muted"
                        >
                          해제
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="mt-1 text-[11px] text-ui-muted">즐겨찾기 친구가 없습니다.</p>
                )}
              </div>
            </MessengerSettingsBlock>

            <MessengerSettingsBlock title="채팅">
              <SettingsToggleRow
                title="입장 전 정보 확인"
                description="자유 입장 오픈채팅도 먼저 확인"
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
                  <span className="block text-[13px] font-medium text-ui-fg">대화 백업</span>
                  <span className="mt-0.5 block text-[11px] leading-snug text-ui-muted">설정과 최근 검색, 장치 선택 백업</span>
                </span>
                <div className="flex shrink-0 gap-1.5">
                  <button
                    type="button"
                    onClick={exportSettingsBackup}
                    className="rounded-ui-rect border border-ui-border bg-ui-page px-2.5 py-1 text-[11px] font-medium text-ui-fg"
                  >
                    내보내기
                  </button>
                  <button
                    type="button"
                    onClick={() => backupInputRef.current?.click()}
                    className="rounded-ui-rect border border-ui-border bg-ui-page px-2.5 py-1 text-[11px] font-medium text-ui-fg"
                  >
                    가져오기
                  </button>
                </div>
              </div>
            </MessengerSettingsBlock>

            <MessengerSettingsBlock title="오픈채팅">
              <SettingsActionRow
                title="오픈채팅 탐색"
                description="공개방 목록 열기"
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
