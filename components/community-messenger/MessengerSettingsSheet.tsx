"use client";

import type { RefObject } from "react";
import { CommunityMessengerDeviceSettingsSection } from "@/components/community-messenger/CommunityMessengerDeviceSettingsSection";
import {
  MessengerHomeBottomSheetShell,
  MessengerSettingsBlock,
  SettingsActionRow,
  SettingsToggleRow,
} from "@/components/community-messenger/MessengerSheetUi";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
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
  const { t } = useI18n();
  return (
    <MessengerHomeBottomSheetShell
      onClose={onClose}
      closeAriaLabel={t("nav_close")}
      dialogAriaLabel={t("common_settings")}
      anchor="device-bottom"
    >
        <div className="flex shrink-0 items-center justify-between border-b border-[color:var(--messenger-divider)] px-3 py-2.5">
          <p className="sam-text-body-lg font-semibold" style={{ color: "var(--messenger-text)" }}>
            {t("common_settings")}
          </p>
          <button
            type="button"
            className="rounded-[var(--messenger-radius-sm)] px-2 py-1 sam-text-body active:bg-[color:var(--messenger-primary-soft)]"
            style={{ color: "var(--messenger-text-secondary)" }}
            onClick={onClose}
          >
            {t("nav_close")}
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-[color:var(--messenger-bg)] px-3 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
          <div className="space-y-4">
            <MessengerSettingsBlock title={t("common_notifications")}>
              <SettingsToggleRow
                title={t("cm_ui_messenger_direct_chat")}
                description={t("cm_ui_general_chat_notifications")}
                checked={notificationSettings.community_chat_enabled}
                disabled={busyId === "notification-setting:community_chat_enabled"}
                onChange={(next) => void updateNotificationSetting("community_chat_enabled", next)}
              />
              <SettingsToggleRow
                title={t("nav_trade_chat_label")}
                description={t("cm_ui_trade_chat_notifications")}
                checked={notificationSettings.trade_chat_enabled}
                disabled={busyId === "notification-setting:trade_chat_enabled"}
                onChange={(next) => void updateNotificationSetting("trade_chat_enabled", next)}
              />
              <SettingsToggleRow
                title={t("cm_ui_order_delivery")}
                checked={notificationSettings.order_enabled}
                disabled={busyId === "notification-setting:order_enabled"}
                onChange={(next) => void updateNotificationSetting("order_enabled", next)}
              />
              <SettingsToggleRow
                title={t("common_store")}
                description={t("cm_ui_store_notice_operations_notifications")}
                checked={notificationSettings.store_enabled}
                disabled={busyId === "notification-setting:store_enabled"}
                onChange={(next) => void updateNotificationSetting("store_enabled", next)}
              />
              <SettingsToggleRow
                title={t("cm_ui_chat_service_notification_sound")}
                description={t("cm_ui_message_trade_order_sound")}
                checked={notificationSettings.sound_enabled}
                disabled={busyId === "notification-setting:sound_enabled"}
                onChange={(next) => void updateNotificationSetting("sound_enabled", next)}
              />
              <SettingsToggleRow
                title={t("cm_ui_incoming_call_bell")}
                description={t("cm_ui_incoming_call_bell_desc")}
                checked={incomingCallSoundEnabled}
                onChange={(next) => onIncomingCallSoundChange(next)}
              />
              <SettingsToggleRow
                title={t("cm_ui_incoming_call_screen_guide")}
                description={t("cm_ui_banner_overlay")}
                checked={incomingCallBannerEnabled}
                onChange={(next) => onIncomingCallBannerChange(next)}
              />
              <SettingsToggleRow
                title={t("cm_ui_vibration")}
                checked={notificationSettings.vibration_enabled}
                disabled={busyId === "notification-setting:vibration_enabled"}
                onChange={(next) => void updateNotificationSetting("vibration_enabled", next)}
              />
            </MessengerSettingsBlock>

            <MessengerSettingsBlock title={t("cm_ui_call_devices")}>
              <CommunityMessengerDeviceSettingsSection visible={true} embedded />
            </MessengerSettingsBlock>

            <MessengerSettingsBlock title={t("nav_messenger_friends")}>
              <p className="px-3 py-2 sam-text-helper leading-snug text-ui-muted">
                {t("cm_ui_block_hidden_favorites_count", { blocked: blocked.length, hidden: hidden.length, favorites: favoriteCount })}
              </p>
              <SettingsToggleRow
                title={t("cm_ui_add_friend_by_phone")}
                description={t("cm_ui_use_contacts_tab")}
                checked={localSettings.phoneFriendAddEnabled}
                onChange={(next) => updateLocalSetting("phoneFriendAddEnabled", next)}
              />
              <SettingsToggleRow
                title={t("cm_ui_auto_add_contacts")}
                description={t("cm_ui_auto_apply_mobile_integration")}
                checked={localSettings.contactAutoAddEnabled}
                onChange={(next) => updateLocalSetting("contactAutoAddEnabled", next)}
              />
              <div className="px-3 py-2">
                <p className="sam-text-helper font-medium text-ui-fg">{t("common_block")}</p>
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
                          {t("cm_ui_release")}
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="mt-1 sam-text-xxs text-ui-muted">{t("cm_ui_no_blocked_users")}</p>
                )}
              </div>
              <div className="px-3 py-2">
                <p className="sam-text-helper font-medium text-ui-fg">{t("cm_ui_hidden_friends")}</p>
                {hidden.length ? (
                  <div className="mt-1.5 space-y-1">
                    {hidden.map((friend) => (
                      <div key={friend.id} className="flex items-center justify-between gap-2 border-b border-ui-border py-1.5 last:border-0">
                        <div className="min-w-0">
                          <p className="truncate sam-text-body-secondary text-ui-fg">{friend.label}</p>
                          <p className="truncate sam-text-xxs text-ui-muted">{friend.subtitle ?? t("cm_ui_hidden_only_in_list")}</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => void onToggleHiddenFriend(friend.id)}
                          disabled={busyId === `hidden:${friend.id}`}
                          className="shrink-0 sam-text-xxs font-medium text-ui-muted"
                        >
                          {t("cm_ui_release")}
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="mt-1 sam-text-xxs text-ui-muted">{t("cm_ui_no_hidden_friends")}</p>
                )}
              </div>
              <div className="px-3 py-2">
                <p className="sam-text-helper font-medium text-ui-fg">{t("cm_ui_manage_favorites")}</p>
                {favoriteManageFriends.length ? (
                  <div className="mt-1.5 space-y-1">
                    {favoriteManageFriends.map((friend) => (
                      <div key={friend.id} className="flex items-center justify-between gap-2 border-b border-ui-border py-1.5 last:border-0">
                        <div className="min-w-0">
                          <p className="truncate sam-text-body-secondary text-ui-fg">{friend.label}</p>
                          <p className="truncate sam-text-xxs text-ui-muted">
                            {friend.isHiddenFriend ? t("cm_ui_hidden_friend_keep_favorite") : friend.subtitle ?? t("cm_ui_favorite")}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => void onToggleFavoriteFriend(friend.id)}
                          disabled={busyId === `favorite:${friend.id}`}
                          className="shrink-0 sam-text-xxs font-medium text-ui-muted"
                        >
                          {t("cm_ui_release")}
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="mt-1 sam-text-xxs text-ui-muted">{t("cm_ui_no_favorite_friends")}</p>
                )}
              </div>
            </MessengerSettingsBlock>

            <MessengerSettingsBlock title={t("cm_ui_settings_section_conversation")}>
              <SettingsToggleRow
                title={t("cm_ui_check_info_before_join")}
                description={t("cm_ui_check_meeting_info_before_join")}
                checked={localSettings.groupJoinPreviewEnabled}
                onChange={(next) => updateLocalSetting("groupJoinPreviewEnabled", next)}
              />
              <SettingsToggleRow
                title={t("cm_ui_media_auto_save")}
                description={t("cm_ui_open_files_images_with_save_focus")}
                checked={localSettings.mediaAutoSaveEnabled}
                onChange={(next) => updateLocalSetting("mediaAutoSaveEnabled", next)}
              />
              <SettingsToggleRow
                title={t("cm_ui_link_preview")}
                description={t("cm_ui_show_link_chip_in_chat")}
                checked={localSettings.linkPreviewEnabled}
                onChange={(next) => updateLocalSetting("linkPreviewEnabled", next)}
              />
              <div className="flex items-center justify-between gap-3 px-3 py-2">
                <span className="min-w-0">
                  <span className="block sam-text-body-secondary font-medium text-ui-fg">{t("cm_ui_chat_backup")}</span>
                  <span className="mt-0.5 block sam-text-xxs leading-snug text-ui-muted">{t("cm_ui_backup_settings_recent_device")}</span>
                </span>
                <div className="flex shrink-0 gap-1.5">
                  <button
                    type="button"
                    onClick={exportSettingsBackup}
                    className="rounded-ui-rect border border-ui-border bg-ui-page px-2.5 py-1 sam-text-xxs font-medium text-ui-fg"
                  >
                    {t("cm_ui_export")}
                  </button>
                  <button
                    type="button"
                    onClick={() => backupInputRef.current?.click()}
                    className="rounded-ui-rect border border-ui-border bg-ui-page px-2.5 py-1 sam-text-xxs font-medium text-ui-fg"
                  >
                    {t("cm_ui_import")}
                  </button>
                </div>
              </div>
            </MessengerSettingsBlock>

            <MessengerSettingsBlock title={t("cm_ui_settings_section_open_group")}>
              <SettingsActionRow
                title={t("cm_ui_find_meeting")}
                description={t("cm_ui_open_joinable_meetings")}
                actionLabel={t("cm_ui_open")}
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
    </MessengerHomeBottomSheetShell>
  );
}
